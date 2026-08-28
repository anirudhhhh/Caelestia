import asyncio
import sys
import time
from pathlib import Path
from typing import List, Optional, Dict, Any, Tuple

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Adjust path to import shared modules and local modules
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from shared.config import setup_logging, get_env, GUARDRAILS_ML_URL, PII_SERVICE_URL, POLICY_ENGINE_URL, AUDIT_STORE_URL
from shared.schemas import (
    InteractionEnvelope, CheckResult, CheckVerdict,
    PolicyDecisionRequest, get_latency_budget,
    Decision, RiskAssessment, DecisionAction, RiskTier, Finding
)

from shared.text_normalize import normalize_text
from services.guardrails_fast.lexicon import get_lexicon_scanner
from services.guardrails_fast.patterns import scan_fast_patterns
from services.input_guard.scanners.secret_scanner import SecretScanner
from services.input_guard.sanitizer import SanitizerEngine

logger = setup_logging("input_guard")

app = FastAPI(title="Input Guard")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

lexicon_scanner = get_lexicon_scanner()
secrets_scanner = SecretScanner(audit_store_url=AUDIT_STORE_URL)
sanitizer_engine = SanitizerEngine(audit_store_url=AUDIT_STORE_URL)

HTTP_CLIENT: Optional[httpx.AsyncClient] = None

def get_http_client() -> httpx.AsyncClient:
    global HTTP_CLIENT
    if HTTP_CLIENT is None or HTTP_CLIENT.is_closed:
        HTTP_CLIENT = httpx.AsyncClient(
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
            timeout=httpx.Timeout(30.0, connect=5.0)
        )
    return HTTP_CLIENT

@app.on_event("startup")
async def startup_event():
    global HTTP_CLIENT
    HTTP_CLIENT = httpx.AsyncClient(
        limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
        timeout=httpx.Timeout(30.0, connect=5.0)
    )

@app.on_event("shutdown")
async def shutdown_event():
    global HTTP_CLIENT
    if HTTP_CLIENT and not HTTP_CLIENT.is_closed:
        await HTTP_CLIENT.aclose()

async def check_pii(text: str, geography: str, timeout: float) -> Tuple[CheckResult, List[Dict[str, Any]]]:
    start = time.time()
    raw_entities = []
    try:
        client = get_http_client()
        resp = await client.post(
            f"{PII_SERVICE_URL}/detect",
            json={"text": text, "geography": geography},
            timeout=timeout
        )
        resp.raise_for_status()
        data = resp.json()
        raw_entities = data.get("entities", [])
        score = 0.0
        if raw_entities:
            score = max((e.get("score", 0.0) for e in raw_entities), default=0.0)
        
        return CheckResult(
            check_name="pii",
            engine="pii_service",
            score=score,
            verdict=CheckVerdict.FAIL if score >= 0.70 else (CheckVerdict.WARN if score >= 0.40 else CheckVerdict.PASS),
            latency_ms=(time.time() - start) * 1000,
            layer="pii_service",
            details={"entities_found": len(raw_entities)}
        ), raw_entities
    except Exception as e:
        logger.warning(f"PII service check failed: {e}")
        return CheckResult(
            check_name="pii",
            engine="pii_service",
            score=0.0,
            verdict=CheckVerdict.SKIPPED,
            latency_ms=(time.time() - start) * 1000,
            layer="pii_service",
            details={"error": str(e)}
        ), []

async def fetch_use_case_config(use_case: str, model: str = None) -> Dict[str, Any]:
    client = get_http_client()
    # 1. If specific model/endpoint is specified, check for component-level config
    if model:
        try:
            resp = await client.get(f"{AUDIT_STORE_URL}/v1/configs/{model}", timeout=2.0)
            if resp.status_code == 200:
                cfg = resp.json()
                if cfg.get("pii_permissions"):
                    return cfg
        except Exception:
            pass

    # 2. Check use_case level config
    try:
        resp = await client.get(f"{AUDIT_STORE_URL}/v1/configs/{use_case}", timeout=2.0)
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass
    return {
        "detectors": {
            "secrets": {"enabled": True, "block_threshold": 0.5, "flag_threshold": 0.3},
            "pii": {"enabled": True, "block_threshold": 0.75, "flag_threshold": 0.4, "action": "redact"},
            "toxicity": {"enabled": True, "block_threshold": 0.8, "flag_threshold": 0.4},
            "injection": {"enabled": True, "block_threshold": 0.8, "flag_threshold": 0.5}
        }
    }

async def check_ml_guardrails(text: str, use_case: str, timeout: float) -> Dict[str, Any]:
    """Calls L2 Contextual ML Classifiers and Multi-Corpus Vector DB on Guardrails ML service."""
    start = time.time()
    results = {
        "toxicity_score": 0.0,
        "injection_score": 0.0,
        "vector_similarity": 0.0,
        "vector_toxicity_sim": 0.0,
        "vector_secrets_sim": 0.0,
        "vector_policy_sim": 0.0
    }
    try:
        client = get_http_client()
        tox_resp, inj_resp, sim_resp, tox_sim_resp, sec_sim_resp, pol_sim_resp = await asyncio.gather(
            client.post(f"{GUARDRAILS_ML_URL}/classify/toxicity", json={"text": text, "use_case": use_case}, timeout=timeout),
            client.post(f"{GUARDRAILS_ML_URL}/classify/injection", json={"text": text, "use_case": use_case}, timeout=timeout),
            client.post(f"{GUARDRAILS_ML_URL}/similarity/attack-corpus", json={"text": text, "use_case": use_case}, timeout=timeout),
            client.post(f"{GUARDRAILS_ML_URL}/similarity/toxicity", json={"text": text, "use_case": use_case}, timeout=timeout),
            client.post(f"{GUARDRAILS_ML_URL}/similarity/secrets", json={"text": text, "use_case": use_case}, timeout=timeout),
            client.post(f"{GUARDRAILS_ML_URL}/similarity/policy", json={"text": text, "use_case": use_case}, timeout=timeout),
            return_exceptions=True
        )

        if not isinstance(tox_resp, Exception) and tox_resp.status_code == 200:
            tox_data = tox_resp.json()
            results["toxicity_score"] = float(tox_data.get("score", 0.0))
            results["toxicity_reason"] = tox_data.get("reason", "")
            results["verdict"] = tox_data.get("verdict", "")
        if not isinstance(inj_resp, Exception) and inj_resp.status_code == 200:
            results["injection_score"] = float(inj_resp.json().get("score", 0.0))
            results["injection_categories"] = inj_resp.json().get("categories", [])
        if not isinstance(sim_resp, Exception) and sim_resp.status_code == 200:
            results["vector_similarity"] = float(sim_resp.json().get("max_similarity", 0.0))
            results["vector_top_match"] = sim_resp.json().get("top_match")
        if not isinstance(tox_sim_resp, Exception) and tox_sim_resp.status_code == 200:
            results["vector_toxicity_sim"] = float(tox_sim_resp.json().get("max_similarity", 0.0))
        if not isinstance(sec_sim_resp, Exception) and sec_sim_resp.status_code == 200:
            results["vector_secrets_sim"] = float(sec_sim_resp.json().get("max_similarity", 0.0))
        if not isinstance(pol_sim_resp, Exception) and pol_sim_resp.status_code == 200:
            results["vector_policy_sim"] = float(pol_sim_resp.json().get("max_similarity", 0.0))

    except Exception as e:
        logger.warning(f"Guardrails ML call exception: {e}")

    results["latency_ms"] = (time.time() - start) * 1000
    return results

@app.post("/scan", response_model=InteractionEnvelope)
async def scan_input(envelope: InteractionEnvelope):
    text = envelope.payload.content
    budget_ms = get_latency_budget(envelope.use_case, "input_guard")
    client = get_http_client()

    # ── L0: Normalization & Anti-Evasion ─────────────────────────────────────
    norm = normalize_text(text)

    # ── Fetch Config ────────────────────────────────────────────────────────
    model_req = envelope.model.requested if envelope.model else None
    use_case_cfg = await fetch_use_case_config(envelope.use_case.value, model=model_req)

    # ── L1: Fast Aho-Corasick Lexicon & Heuristics ──────────────────────────
    l1_res = lexicon_scanner.scan_text(text)
    fast_patterns = scan_fast_patterns(text)

    # ── L1: Secret Detection (HMAC + Gitleaks + Entropy) ────────────────────
    secrets_res = await secrets_scanner.scan(text=text, http_client=client)

    # ── L2 & L3: Contextual ML & Vector Corpus Search ───────────────────────
    ml_timeout = max(budget_ms / 1000.0, 3.0)
    ml_res_task = check_ml_guardrails(text, envelope.use_case.value, ml_timeout)
    pii_res_task = check_pii(text, envelope.geography.value, ml_timeout)

    ml_res, (pii_res, pii_entities) = await asyncio.gather(ml_res_task, pii_res_task)

    # Combine L1 Lexicon + L2 Contextual ML + L3 Vector DB for Toxicity
    vec_tox_sim = ml_res.get("vector_toxicity_sim", 0.0)
    vec_tox_contrib = vec_tox_sim if vec_tox_sim >= 0.70 else 0.0
    ml_tox_score = ml_res.get("toxicity_score", 0.0)
    l1_tox_score = l1_res["score"]
    
    if ml_res.get("verdict") in ("safe_technical_context", "safe_pop_culture_context"):
        final_toxicity_score = 0.01
    else:
        final_toxicity_score = max(l1_tox_score, ml_tox_score, vec_tox_contrib)

    # Determine controlling layer for toxicity
    toxicity_layer = "L3_vector_store" if vec_tox_contrib > max(l1_tox_score, ml_tox_score) else ("L2_contextual_ml" if ml_tox_score > l1_tox_score else "L1_lexicon")

    toxicity_check = CheckResult(
        check_name="toxicity",
        engine="aho_corasick_and_contextual_ml",
        score=round(final_toxicity_score, 4),
        verdict=CheckVerdict.FAIL if final_toxicity_score >= 0.80 else (CheckVerdict.WARN if final_toxicity_score >= 0.40 else CheckVerdict.PASS),
        latency_ms=l1_res["latency_ms"] + ml_res["latency_ms"],
        layer=toxicity_layer,
        details={
            "matches": l1_res["all_matches"],
            "normalized_canonical": norm.canonical,
            "ml_verdict": ml_res.get("toxicity_reason", ""),
            "vector_similarity": vec_tox_sim
        }
    )

    # Combine L1 Patterns + L2 ML + L3 Vector similarity for Prompt Injection
    fast_inj_score = max((p["score"] for p in fast_patterns if p["category"] == "prompt_injection"), default=0.0)
    vector_sim = ml_res.get("vector_similarity", 0.0)
    vec_inj_contrib = vector_sim if vector_sim >= 0.70 else 0.0
    ml_inj_score = ml_res.get("injection_score", 0.0)
    
    final_injection_score = max(fast_inj_score, ml_inj_score, vec_inj_contrib)

    injection_layer = "L3_vector_store" if vec_inj_contrib > max(fast_inj_score, ml_inj_score) else ("L2_contextual_ml" if ml_inj_score > fast_inj_score else "L1_lexicon")

    injection_check = CheckResult(
        check_name="prompt_injection",
        engine="aho_corasick_vector_deberta",
        score=round(final_injection_score, 4),
        verdict=CheckVerdict.FAIL if final_injection_score >= 0.80 else (CheckVerdict.WARN if final_injection_score >= 0.40 else CheckVerdict.PASS),
        latency_ms=l1_res["latency_ms"] + ml_res["latency_ms"],
        layer=injection_layer,
        details={
            "vector_similarity": vector_sim,
            "pattern_categories": ml_res.get("injection_categories", []),
            "top_attack_match": ml_res.get("vector_top_match")
        }
    )

    # Combine Deterministic Rules + Shannon Entropy + L3 Vector Secrets
    vec_sec_sim = ml_res.get("vector_secrets_sim", 0.0)
    vec_score_contrib = vec_sec_sim if vec_sec_sim >= 0.75 else 0.0
    final_sec_score = max(secrets_res.score, vec_score_contrib)
    secrets_res.score = final_sec_score
    if final_sec_score >= 0.70:
        secrets_res.verdict = CheckVerdict.FAIL
    elif final_sec_score >= 0.35:
        secrets_res.verdict = CheckVerdict.WARN
    else:
        secrets_res.verdict = CheckVerdict.PASS

    secrets_res.layer = "L3_vector_store" if vec_score_contrib > secrets_res.score else "detect_secrets"
    secrets_res.details["vector_similarity"] = vec_sec_sim

    # Convert CheckResults to standardized Findings
    standard_findings = []
    if "findings" in secrets_res.details:
        for f in secrets_res.details["findings"]:
            standard_findings.append(Finding(**f))
    
    # ── Execute Policy-Based PII & Security Evaluation via Sanitizer Engine ──
    pii_declaration = envelope.pii_declaration or envelope.metadata.get("pii_declaration", [])
    sanitizer_out, should_block_sanitizer = sanitizer_engine.sanitize_payload(
        original_text=text,
        interaction_id=envelope.interaction_id,
        findings=standard_findings,
        pii_entities=pii_entities,
        use_case_config=use_case_cfg,
        pii_declaration=pii_declaration
    )

    # Payload content remains 100% original raw text
    envelope.payload.content = text
    envelope.metadata["sanitizer_output"] = sanitizer_out.model_dump()
    if sanitizer_out.warnings:
        envelope.metadata["warnings"] = sanitizer_out.warnings

    # Calibrate PII CheckResult according to enterprise policy permission outcomes
    if sanitizer_out.blocked_pii:
        pii_res.score = 1.0
        pii_res.verdict = CheckVerdict.FAIL
        pii_res.details["blocked_pii"] = sanitizer_out.blocked_pii
    elif sanitizer_out.warnings:
        pii_res.score = 0.35
        pii_res.verdict = CheckVerdict.WARN
        pii_res.details["warnings"] = sanitizer_out.warnings
    else:
        pii_res.score = 0.0
        pii_res.verdict = CheckVerdict.PASS
        pii_res.details["allowed_pii"] = sanitizer_out.allowed_pii

    envelope.checks.extend([
        injection_check,
        toxicity_check,
        secrets_res,
        pii_res
    ])

    # Call policy engine
    policy_req = PolicyDecisionRequest(
        interaction_id=envelope.interaction_id,
        use_case=envelope.use_case,
        geography=envelope.geography,
        direction=envelope.direction,
        checks=envelope.checks,
        tool_calls=envelope.tool_calls,
        pii_declaration=pii_declaration,
        detected_pii=pii_entities,
        strict_pii=use_case_cfg.get("strict_pii_declaration", False)
    )

    try:
        resp = await client.post(
            f"{POLICY_ENGINE_URL}/decide",
            json=policy_req.model_dump(mode='json'),
            timeout=ml_timeout
        )
        resp.raise_for_status()
        decision_data = resp.json()
        envelope.decision = Decision(**decision_data["decision"])
        envelope.risk = RiskAssessment(**decision_data["risk"])
        if decision_data.get("checks"):
            envelope.checks = [CheckResult(**c) for c in decision_data["checks"]]
    except Exception as e:
        logger.error(f"Failed to call Policy Engine: {e}")
        envelope.decision = Decision(action=DecisionAction.BLOCK, reason="Policy Engine unavailable", decided_by="input_guard")
        envelope.risk = RiskAssessment(tier=RiskTier.HIGH, confidence=1.0)

    # Enforce enterprise PII policy block if prohibited PII was detected
    if sanitizer_out.blocked_pii:
        envelope.decision.action = DecisionAction.BLOCK
        envelope.decision.reason = f"Blocked by enterprise PII policy: prohibited PII detected ({', '.join(sanitizer_out.blocked_pii)})"
        envelope.decision.blocked_by_layer = "enterprise_pii_policy"
        envelope.decision.blocked_entities = sanitizer_out.blocked_pii
        envelope.decision.details = {
            "detected_pii": sanitizer_out.detected_pii,
            "blocked_pii": sanitizer_out.blocked_pii,
            "allowed_pii": sanitizer_out.allowed_pii,
        }
    elif should_block_sanitizer and envelope.decision.action != DecisionAction.BLOCK:
        envelope.decision.action = DecisionAction.BLOCK
        envelope.decision.reason = "Blocked by perimeter security finding"

    return envelope

@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "input_guard"}

@app.get("/metrics")
async def metrics():
    return {"status": "ok"}
