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
from services.output_guard.verification.judge import verify_hallucination

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

async def scan_pii(text: str) -> CheckResult:
    try:
        client = get_http_client()
        resp = await client.post(f"{PII_SERVICE_URL}/detect", json={"text": text}, timeout=3.0)
        resp.raise_for_status()
        entities = resp.json().get("entities", [])
        score = max((e["score"] for e in entities), default=0.0)
        return CheckResult(
            check_name="pii",
            engine="pii_service",
            score=score,
            verdict=CheckVerdict.FAIL if score >= 0.7 else CheckVerdict.PASS,
            details={"entities_found": len(entities)}
        )
    except Exception as e:
        logger.error(f"PII service call failed: {e}")
        return CheckResult(check_name="pii", engine="pii_service", score=0.0, verdict=CheckVerdict.SKIPPED)

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.post("/scan", response_model=InteractionEnvelope)
async def scan_output(envelope: InteractionEnvelope):
    text = envelope.payload.content
    logger.info(f"[{envelope.interaction_id}] Scanning output payload")
    
    start_time = time.time()

    # ── L0 Normalization & L1 Lexicon Scanning ──────────────────────────────
    norm = normalize_text(text)
    l1_res = lexicon_scanner.scan_text(text)

    # ── L2 Contextual Toxicity Call ─────────────────────────────────────────
    ml_toxicity_score = 0.0
    try:
        client = get_http_client()
        ml_resp = await client.post(f"{GUARDRAILS_ML_URL}/classify/toxicity", json={"text": text}, timeout=3.0)
        if ml_resp.status_code == 200:
            ml_toxicity_score = float(ml_resp.json().get("score", 0.0))
    except Exception:
        pass

    final_toxicity_score = max(l1_res["score"], ml_toxicity_score)
    toxicity_result = CheckResult(
        check_name="toxicity",
        engine="aho_corasick_and_contextual_ml",
        score=final_toxicity_score,
        verdict=CheckVerdict.FAIL if final_toxicity_score >= 0.80 else CheckVerdict.PASS,
        details={"matches": l1_res["all_matches"]}
    )

    tasks = [
        asyncio.to_thread(scan_sensitive_data, text),
        asyncio.to_thread(scan_system_prompt_leakage, text),
        scan_pii(text)
    ]
    
    # L4 AI-as-judge only for medium/high risk tiers
    if envelope.risk.tier in (RiskTier.MEDIUM, RiskTier.HIGH):
        tasks.append(verify_hallucination(text))
        
    results = await asyncio.gather(*tasks)
    
    envelope.checks.append(toxicity_result)
    for r in results:
        r.latency_ms = (time.time() - start_time) * 1000
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
