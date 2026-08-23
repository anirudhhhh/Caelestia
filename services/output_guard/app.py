import asyncio
import sys
import time
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from fastapi import FastAPI, HTTPException
import httpx
from fastapi.middleware.cors import CORSMiddleware
from shared.schemas import InteractionEnvelope, CheckVerdict, RiskTier, Direction, PolicyDecisionRequest
from shared.config import setup_logging, POLICY_ENGINE_URL, PII_SERVICE_URL

from services.output_guard.scanners.heuristic_scanners import scan_toxicity, scan_sensitive_data
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

async def scan_pii(text: str) -> 'CheckResult':
    from shared.schemas import CheckResult
    # Call PII service or mock
    # For now mock since we only have output guard
    return CheckResult(
        check_name="pii_leakage",
        engine="mock-pii",
        score=0.0,
        verdict=CheckVerdict.PASS
    )

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.post("/scan", response_model=InteractionEnvelope)
async def scan_output(envelope: InteractionEnvelope):
    text = envelope.payload.content
    logger.info(f"[{envelope.interaction_id}] Scanning output payload")
    
    # Run heuristic and PII scanners in parallel
    start_time = time.time()
    
    tasks = [
        asyncio.to_thread(scan_toxicity, text),
        asyncio.to_thread(scan_sensitive_data, text),
        asyncio.to_thread(scan_system_prompt_leakage, text),
        scan_pii(text)
    ]
    
    # AI-as-judge only for medium/high risk tiers
    if envelope.risk.tier in (RiskTier.MEDIUM, RiskTier.HIGH):
        # We need context for judge
        tasks.append(verify_hallucination(text))
        
    results = await asyncio.gather(*tasks)
    
    for r in results:
        r.latency_ms = (time.time() - start_time) * 1000
        envelope.checks.append(r)
        
    # Call Policy Engine
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            pe_req = PolicyDecisionRequest(
                interaction_id=envelope.interaction_id,
                use_case=envelope.use_case,
                geography=envelope.geography,
                direction=Direction.OUTPUT,
                checks=envelope.checks,
                tool_calls=envelope.tool_calls
            )
            pe_resp = await client.post(f"{POLICY_ENGINE_URL}/decide", json=pe_req.model_dump())
            if pe_resp.status_code == 200:
                pe_data = pe_resp.json()
                from shared.schemas import Decision, RiskAssessment
                envelope.decision = Decision(**pe_data["decision"])
                envelope.risk = RiskAssessment(**pe_data["risk"])
            else:
                logger.error(f"[{envelope.interaction_id}] Policy Engine returned {pe_resp.status_code}")
    except Exception as e:
        logger.error(f"[{envelope.interaction_id}] Failed to reach Policy Engine: {e}")
        
    return envelope
