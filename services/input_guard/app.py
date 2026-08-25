import asyncio
import sys
import time
from pathlib import Path
from typing import List, Optional, Dict, Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Adjust path to import shared modules and local modules
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from shared.config import setup_logging, get_env, GUARDRAILS_ML_URL, PII_SERVICE_URL, POLICY_ENGINE_URL
from shared.schemas import (
    InteractionEnvelope, CheckResult, CheckVerdict,
    PolicyDecisionRequest, get_latency_budget,
    Decision, RiskAssessment, DecisionAction, RiskTier
)

from shared.text_normalize import normalize_text
from services.guardrails_fast.lexicon import get_lexicon_scanner
from services.guardrails_fast.patterns import scan_fast_patterns
from services.input_guard.scanners.secrets import SecretsScanner

logger = setup_logging("input_guard")

app = FastAPI(title="Input Guard Service (Grand Guardrails Pipeline)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

lexicon_scanner = get_lexicon_scanner()
secrets_scanner = SecretsScanner()

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

async def check_pii(text: str, geography: str, timeout: float) -> CheckResult:
    start = time.time()
    try:
        client = get_http_client()
        resp = await client.post(
            f"{PII_SERVICE_URL}/detect",
            json={"text": text, "geography": geography},
            timeout=timeout
        )
        resp.raise_for_status()
        data = resp.json()
        score = 0.0
        if data.get("entities"):
            score = max((e.get("score", 0.0) for e in data["entities"]), default=0.0)
        
        return CheckResult(
            check_name="pii",
            engine="pii_service",
            score=score,
            latency_ms=(time.time() - start) * 1000,
            details={"entities_found": len(data.get("entities", []))}
        )
    except Exception as e:
        logger.warning(f"PII Service call exception: {e}")
        return CheckResult(
            check_name="pii",
            engine="pii_service",
            score=0.0,
            verdict=CheckVerdict.SKIPPED,
            latency_ms=(time.time() - start) * 1000
        )

async def check_ml_guardrails(text: str, use_case: str, timeout: float) -> Dict[str, Any]:
    """Calls L2 Contextual ML Classifiers and L3 Vector Store on Guardrails ML service."""
    start = time.time()
    results = {"toxicity_score": 0.0, "injection_score": 0.0, "vector_similarity": 0.0}
    try:
        client = get_http_client()
        tox_resp, inj_resp, sim_resp = await asyncio.gather(
            client.post(f"{GUARDRAILS_ML_URL}/classify/toxicity", json={"text": text, "use_case": use_case}, timeout=timeout),
            client.post(f"{GUARDRAILS_ML_URL}/classify/injection", json={"text": text, "use_case": use_case}, timeout=timeout),
            client.post(f"{GUARDRAILS_ML_URL}/similarity/attack-corpus", json={"text": text, "use_case": use_case}, timeout=timeout),
            return_exceptions=True
        )

        if not isinstance(tox_resp, Exception) and tox_resp.status_code == 200:
            results["toxicity_score"] = float(tox_resp.json().get("score", 0.0))
            results["toxicity_reason"] = tox_resp.json().get("reason", "")
        if not isinstance(inj_resp, Exception) and inj_resp.status_code == 200:
            results["injection_score"] = float(inj_resp.json().get("score", 0.0))
            results["injection_categories"] = inj_resp.json().get("categories", [])
        if not isinstance(sim_resp, Exception) and sim_resp.status_code == 200:
            results["vector_similarity"] = float(sim_resp.json().get("max_similarity", 0.0))
            results["vector_top_match"] = sim_resp.json().get("top_match")

    except Exception as e:
        logger.warning(f"Guardrails ML call exception: {e}")

    results["latency_ms"] = (time.time() - start) * 1000
    return results

@app.post("/scan", response_model=InteractionEnvelope)
async def scan_input(envelope: InteractionEnvelope):
    text = envelope.payload.content
    budget_ms = get_latency_budget(envelope.use_case, "input_guard")

    # ── L0: Normalization & Anti-Evasion ─────────────────────────────────────
    norm = normalize_text(text)

    # ── L1: Fast Aho-Corasick Lexicon & Heuristics ──────────────────────────
    l1_res = lexicon_scanner.scan_text(text)
    fast_patterns = scan_fast_patterns(text)

    # Secrets Local Scan
    secrets_res = await secrets_scanner.scan(text=text)

    # ── L2 & L3: Contextual ML & Vector Corpus Search ───────────────────────
    ml_timeout = max(budget_ms / 1000.0, 3.0)
    ml_res, pii_res = await asyncio.gather(
        check_ml_guardrails(text, envelope.use_case.value, ml_timeout),
        check_pii(text, envelope.geography.value, ml_timeout)
    )

    # Combine L1 Lexicon + L2 Contextual ML for Toxicity
    final_toxicity_score = max(l1_res["score"], ml_res.get("toxicity_score", 0.0))
    if ml_res.get("toxicity_reason") == "Matched technical command context (e.g. process/thread/table operation)":
        final_toxicity_score = 0.05  # Override false alarm for technical process kill commands

    toxicity_check = CheckResult(
        check_name="toxicity",
        engine="aho_corasick_and_contextual_ml",
        score=final_toxicity_score,
        verdict=CheckVerdict.FAIL if final_toxicity_score >= 0.80 else (CheckVerdict.WARN if final_toxicity_score >= 0.40 else CheckVerdict.PASS),
        latency_ms=l1_res["latency_ms"] + ml_res["latency_ms"],
        details={
            "matches": l1_res["all_matches"],
            "normalized_canonical": norm.canonical,
            "ml_verdict": ml_res.get("toxicity_reason", "")
        }
    )

    # Combine L1 Patterns + L2 ML + L3 Vector similarity for Prompt Injection
    fast_inj_score = max((p["score"] for p in fast_patterns if p["category"] == "prompt_injection"), default=0.0)
    vector_sim = ml_res.get("vector_similarity", 0.0)
    
    # Boost injection score if vector similarity to known attack corpus is high (> 0.85)
    vector_boost_score = 0.90 if vector_sim >= 0.85 else (0.75 if vector_sim >= 0.70 else 0.0)
    final_injection_score = max(fast_inj_score, ml_res.get("injection_score", 0.0), vector_boost_score)

    injection_check = CheckResult(
        check_name="prompt_injection",
        engine="aho_corasick_vector_deberta",
        score=final_injection_score,
        verdict=CheckVerdict.FAIL if final_injection_score >= 0.80 else (CheckVerdict.WARN if final_injection_score >= 0.40 else CheckVerdict.PASS),
        latency_ms=l1_res["latency_ms"] + ml_res["latency_ms"],
        details={
            "vector_similarity": vector_sim,
            "pattern_categories": ml_res.get("injection_categories", []),
            "top_attack_match": ml_res.get("vector_top_match")
        }
    )

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
        tool_calls=envelope.tool_calls
    )

    try:
        client = get_http_client()
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

    return envelope

@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "input_guard"}

@app.get("/metrics")
async def metrics():
    return {"status": "ok"}
