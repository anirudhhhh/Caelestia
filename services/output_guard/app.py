import asyncio
import sys
import time
from pathlib import Path
from typing import Optional

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from fastapi import FastAPI, HTTPException
import httpx
from fastapi.middleware.cors import CORSMiddleware
from shared.schemas import InteractionEnvelope, CheckVerdict, RiskTier, Direction, PolicyDecisionRequest, CheckResult, Decision, RiskAssessment
from shared.config import setup_logging, POLICY_ENGINE_URL, PII_SERVICE_URL, GUARDRAILS_ML_URL

from shared.text_normalize import normalize_text
from services.guardrails_fast.lexicon import get_lexicon_scanner
from services.output_guard.scanners.heuristic_scanners import scan_sensitive_data
from services.output_guard.scanners.system_prompt_leakage import scan_system_prompt_leakage

logger = setup_logging("output_guard")
app = FastAPI(title="Output Guard")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

lexicon_scanner = get_lexicon_scanner()
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

def normalize_pii_type(etype: str) -> str:
    etype_upper = etype.upper()
    if "EMAIL" in etype_upper:
        return "EMAIL"
    if "PHONE" in etype_upper:
        return "PHONE"
    if "LOCATION" in etype_upper or "ADDRESS" in etype_upper:
        return "ADDRESS"
    if "SSN" in etype_upper or "SOCIAL_SECURITY" in etype_upper:
        return "SSN"
    if "PAN" in etype_upper:
        return "PAN"
    if "CREDIT_CARD" in etype_upper or "CARD" in etype_upper:
        return "CREDIT_CARD"
    if "AADHAAR" in etype_upper:
        return "AADHAAR"
    if "BANK" in etype_upper or "ACCOUNT" in etype_upper:
        return "BANK_ACCOUNT"
    return etype_upper

async def scan_pii(text: str, pii_permissions: dict = None) -> CheckResult:
    if pii_permissions is None:
        pii_permissions = {"EMAIL": "allow", "PHONE": "allow", "ADDRESS": "allow"}
    try:
        client = get_http_client()
        resp = await client.post(f"{PII_SERVICE_URL}/detect", json={"text": text}, timeout=3.0)
        resp.raise_for_status()
        entities = resp.json().get("entities", [])
        
        blocked = []
        for e in entities:
            norm_type = normalize_pii_type(e.get("entity_type", ""))
            if pii_permissions.get(norm_type, "block") != "allow":
                blocked.append(norm_type)
                
        if blocked:
            return CheckResult(
                check_name="pii",
                engine="pii_service",
                score=1.0,
                verdict=CheckVerdict.FAIL,
                details={"blocked_pii": blocked, "entities_found": len(entities)}
            )
        return CheckResult(
            check_name="pii",
            engine="pii_service",
            score=0.0,
            verdict=CheckVerdict.PASS,
            details={"entities_found": len(entities)}
        )
    except Exception as e:
        logger.error(f"PII service call failed: {e}")
        return CheckResult(check_name="pii", engine="pii_service", score=0.0, verdict=CheckVerdict.SKIPPED)

@app.get("/")
async def root():
    return {"status": "ok", "message": "Service is running"}

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.post("/scan", response_model=InteractionEnvelope)
async def scan_output(envelope: InteractionEnvelope):
    text = envelope.payload.content
    content_type = envelope.metadata.get("content_type", "prose")
    logger.info(f"[{envelope.interaction_id}] Scanning output payload (content_type={content_type})")
    
    start_time = time.time()

    # ── L0 Normalization & L1 Lexicon Scanning ──────────────────────────────
    norm = normalize_text(text)
    
    if content_type in ("json", "code", "opaque"):
        # Skip conversational toxicity for structured formats
        toxicity_result = CheckResult(
            check_name="toxicity",
            engine="aho_corasick_and_contextual_ml",
            score=0.0,
            verdict=CheckVerdict.NOT_APPLICABLE,
            layer="L0_normalization",
            details={"reason": f"Skipped for {content_type} content_type"}
        )
    else:
        l1_res = lexicon_scanner.scan_text(text)

        # ── L2 Contextual Toxicity Call ─────────────────────────────────────────
        ml_toxicity_score = 0.0
        ml_verdict = ""
        try:
            client = get_http_client()
            ml_resp = await client.post(f"{GUARDRAILS_ML_URL}/classify/toxicity", json={"text": text}, timeout=3.0)
            if ml_resp.status_code == 200:
                ml_data = ml_resp.json()
                ml_toxicity_score = float(ml_data.get("score", 0.0))
                ml_verdict = ml_data.get("verdict", "")
        except Exception:
            pass

        final_toxicity_score = max(l1_res["score"], ml_toxicity_score)
        if ml_verdict in ("safe_technical_context", "safe_pop_culture_context", "safe_multilingual_context", "safe_positive_emphasis"):
            final_toxicity_score = 0.05

        toxicity_layer = "L2_contextual_ml" if ml_toxicity_score > l1_res["score"] else "L1_lexicon"
        toxicity_result = CheckResult(
            check_name="toxicity",
            engine="aho_corasick_and_contextual_ml",
            score=final_toxicity_score,
            verdict=CheckVerdict.FAIL if final_toxicity_score >= 0.80 else CheckVerdict.PASS,
            layer=toxicity_layer,
            details={"matches": l1_res["all_matches"], "ml_verdict": ml_verdict}
        )

    system_prompt = envelope.metadata.get("system_prompt")
    model_req = envelope.model.requested if envelope.model else None
    use_case_id = envelope.use_case.value if hasattr(envelope.use_case, 'value') else str(envelope.use_case)

    # Fetch component or use-case specific PII permissions
    pii_perms = None
    try:
        client = get_http_client()
        if model_req:
            cfg_resp = await client.get(f"{AUDIT_STORE_URL}/v1/configs/{model_req}", timeout=2.0)
            if cfg_resp.status_code == 200:
                cfg = cfg_resp.json()
                if cfg.get("pii_permissions"):
                    pii_perms = cfg["pii_permissions"]
        if pii_perms is None:
            cfg_resp = await client.get(f"{AUDIT_STORE_URL}/v1/configs/{use_case_id}", timeout=2.0)
            if cfg_resp.status_code == 200:
                pii_perms = cfg_resp.json().get("pii_permissions")
    except Exception:
        pass

    tasks = [
        asyncio.to_thread(scan_sensitive_data, text),
        asyncio.to_thread(scan_system_prompt_leakage, text, system_prompt),
        scan_pii(text, pii_perms)
    ]
    
    results = await asyncio.gather(*tasks)
    
    envelope.checks.append(toxicity_result)
    for r in results:
        r.latency_ms = (time.time() - start_time) * 1000
        if r.check_name == "sensitive_data":
            r.layer = "detect_secrets"
        elif r.check_name == "system_prompt_leakage":
            r.layer = "L1_fast_patterns"
        elif r.check_name == "pii":
            r.layer = "pii_service"
        envelope.checks.append(r)
        
    # Call Policy Engine
    try:
        client = get_http_client()
        pe_req = PolicyDecisionRequest(
            interaction_id=envelope.interaction_id,
            use_case=envelope.use_case,
            geography=envelope.geography,
            direction=Direction.OUTPUT,
            checks=envelope.checks,
            tool_calls=envelope.tool_calls
        )
        pe_resp = await client.post(f"{POLICY_ENGINE_URL}/decide", json=pe_req.model_dump(), timeout=5.0)
        if pe_resp.status_code == 200:
            pe_data = pe_resp.json()
            envelope.decision = Decision(**pe_data["decision"])
            envelope.risk = RiskAssessment(**pe_data["risk"])
            if pe_data.get("checks"):
                envelope.checks = [CheckResult(**c) for c in pe_data["checks"]]
        else:
            logger.error(f"[{envelope.interaction_id}] Policy Engine returned {pe_resp.status_code}")
    except Exception as e:
        logger.error(f"[{envelope.interaction_id}] Failed to reach Policy Engine: {e}")
        
    return envelope
