import asyncio
import sys
import time
from pathlib import Path
from typing import List

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Adjust path to import shared modules and local modules
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
sys.path.insert(0, str(Path(__file__).parent))

from shared.config import setup_logging, get_env
from shared.schemas import (
    InteractionEnvelope, CheckResult, CheckVerdict,
    PolicyDecisionRequest, get_latency_budget,
    Decision, RiskAssessment, DecisionAction, RiskTier
)

from scanners.prompt_injection import PromptInjectionScanner
from scanners.toxicity import ToxicityScanner
from scanners.secrets import SecretsScanner

logger = setup_logging("input_guard")

PII_SERVICE_URL = get_env("PII_SERVICE_URL", "http://localhost:8003")
POLICY_ENGINE_URL = get_env("POLICY_ENGINE_URL", "http://localhost:8004")

app = FastAPI(title="Input Guard Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

scanners = {
    "prompt_injection": PromptInjectionScanner(),
    "toxicity": ToxicityScanner(),
    "secrets": SecretsScanner()
}

async def run_scanner_with_timeout(name: str, scanner, text: str, timeout: float) -> CheckResult:
    try:
        # Wrap scanner call in timeout
        return await asyncio.wait_for(scanner.scan(text=text), timeout=timeout)
    except asyncio.TimeoutError:
        logger.warning(f"Scanner {name} timed out after {timeout}s")
        return CheckResult(
            check_name=name,
            engine="timeout",
            score=0.0,
            verdict=CheckVerdict.SKIPPED,
            latency_ms=timeout * 1000
        )
    except Exception as e:
        logger.error(f"Scanner {name} failed: {e}")
        return CheckResult(
            check_name=name,
            engine="error",
            score=0.0,
            verdict=CheckVerdict.SKIPPED,
            latency_ms=0.0
        )

async def check_pii(text: str, geography: str, timeout: float) -> CheckResult:
    start = time.time()
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{PII_SERVICE_URL}/detect",
                json={"text": text, "geography": geography},
                timeout=timeout
            )
            resp.raise_for_status()
            data = resp.json()
            score = 0.0
            if data.get("entities"):
                # If entities found, score scales with max confidence
                score = max((e.get("score", 0.0) for e in data["entities"]), default=0.0)
            
            return CheckResult(
                check_name="pii",
                engine="pii_service",
                score=score,
                latency_ms=(time.time() - start) * 1000
            )
    except httpx.TimeoutException:
        logger.warning(f"PII Service timed out after {timeout}s")
        return CheckResult(
            check_name="pii",
            engine="pii_service",
            score=0.0,
            verdict=CheckVerdict.SKIPPED,
            latency_ms=(time.time() - start) * 1000
        )
    except Exception as e:
        logger.error(f"PII Service call failed: {e}")
        return CheckResult(
            check_name="pii",
            engine="pii_service",
            score=0.0,
            verdict=CheckVerdict.SKIPPED,
            latency_ms=(time.time() - start) * 1000
        )

@app.post("/scan", response_model=InteractionEnvelope)
async def scan_input(envelope: InteractionEnvelope):
    text = envelope.payload.content
    budget_ms = get_latency_budget(envelope.use_case, "input_guard")

    # Local scanners (in-process, sub-ms) use the latency budget.
    # PII is a remote HTTP call — give it a generous fixed timeout so a
    # cold-start or slow machine doesn't immediately mark every request as SKIPPED.
    scanner_timeout = budget_ms / 1000.0          # e.g. 0.15s for customer_support
    pii_timeout = max(scanner_timeout, 5.0)       # always at least 5 seconds
    policy_timeout = max(scanner_timeout, 3.0)    # always at least 3 seconds

    # Run local scanners + PII in parallel with their respective timeouts
    scanner_tasks = [
        run_scanner_with_timeout(name, scanner, text, scanner_timeout)
        for name, scanner in scanners.items()
    ]
    pii_task = check_pii(text, envelope.geography.value, pii_timeout)

    results = await asyncio.gather(*scanner_tasks, pii_task)

    check_times = {res.check_name: f"{res.latency_ms:.2f}ms" for res in results}
    logger.info(f"[{envelope.interaction_id}] Scanner latencies: {check_times}")

    envelope.checks.extend(results)

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
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{POLICY_ENGINE_URL}/decide",
                json=policy_req.model_dump(mode='json'),
                timeout=policy_timeout
            )
            resp.raise_for_status()
            decision_data = resp.json()
            envelope.decision = Decision(**decision_data["decision"])
            envelope.risk = RiskAssessment(**decision_data["risk"])
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
