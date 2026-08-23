import sys
import asyncio
from pathlib import Path
from typing import List, Dict, Any
import math

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from shared.schemas import AnomalyAlert, ThresholdProposal
from shared.config import setup_logging, AUDIT_STORE_URL, REVIEW_CONSOLE_URL, POLICY_ENGINE_URL

logger = setup_logging("immune_system")
app = FastAPI(title="Immune System")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ALERTS: Dict[str, AnomalyAlert] = {}
MONITOR_TASK = None

async def monitor_loop():
    logger.info("Starting immune system monitor loop...")
    while True:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                try:
                    stats_resp, outcomes_resp = await asyncio.gather(
                        client.get(f"{AUDIT_STORE_URL}/stats"),
                        client.get(f"{AUDIT_STORE_URL}/outcomes/stats"),
                        return_exceptions=True
                    )
                    
                    stats = stats_resp.json() if not isinstance(stats_resp, Exception) and stats_resp.status_code == 200 else {}
                    outcomes = outcomes_resp.json() if not isinstance(outcomes_resp, Exception) and outcomes_resp.status_code == 200 else {}

                    total_interactions = stats.get("total_interactions", 0)
                    block_rate = stats.get("block_rate", 0.0)
                    escalate_rate = stats.get("escalation_rate", 0.0)
                    fp_rate = outcomes.get("false_positive_rate", 0.0)

                    # 1. High Block Rate Anomaly
                    if block_rate > 0.20 and total_interactions >= 5:
                        alert_id = "alert_high_block_rate"
                        ALERTS[alert_id] = AnomalyAlert(
                            alert_id=alert_id,
                            metric_name="Firewall Block Rate",
                            current_value=round(block_rate * 100, 1),
                            baseline_mean=5.0,
                            baseline_std=2.0,
                            sigma_breach=round((block_rate - 0.05) / 0.02, 1),
                            severity="critical" if block_rate > 0.40 else "medium"
                        )
                    elif "alert_high_block_rate" in ALERTS and block_rate <= 0.20:
                        del ALERTS["alert_high_block_rate"]

                    # 2. High Escalation Rate Anomaly
                    if escalate_rate > 0.10 and total_interactions >= 5:
                        alert_id = "alert_high_escalation"
                        ALERTS[alert_id] = AnomalyAlert(
                            alert_id=alert_id,
                            metric_name="Human Escalation Rate",
                            current_value=round(escalate_rate * 100, 1),
                            baseline_mean=2.0,
                            baseline_std=1.0,
                            sigma_breach=round((escalate_rate - 0.02) / 0.01, 1),
                            severity="medium"
                        )
                    elif "alert_high_escalation" in ALERTS and escalate_rate <= 0.10:
                        del ALERTS["alert_high_escalation"]

                    # 3. False Positive Drift Anomaly
                    if fp_rate > 0.15 and outcomes.get("total_reviews", 0) >= 3:
                        alert_id = "alert_fp_drift"
                        ALERTS[alert_id] = AnomalyAlert(
                            alert_id=alert_id,
                            metric_name="False Positive Drift",
                            current_value=round(fp_rate * 100, 1),
                            baseline_mean=3.0,
                            baseline_std=1.5,
                            sigma_breach=round((fp_rate - 0.03) / 0.015, 1),
                            severity="high"
                        )
                    elif "alert_fp_drift" in ALERTS and fp_rate <= 0.15:
                        del ALERTS["alert_fp_drift"]

                except Exception as e:
                    logger.error(f"Failed to evaluate immune health: {e}")

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Monitor loop error: {e}")

        await asyncio.sleep(30)

@app.on_event("startup")
async def startup_event():
    global MONITOR_TASK
    MONITOR_TASK = asyncio.create_task(monitor_loop())

@app.on_event("shutdown")
async def shutdown_event():
    if MONITOR_TASK:
        MONITOR_TASK.cancel()

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.get("/status")
async def get_status():
    return {"status": "monitoring", "active_alerts": len(ALERTS)}

@app.get("/alerts", response_model=List[AnomalyAlert])
async def list_alerts():
    return list(ALERTS.values())

@app.get("/alerts/{alert_id}", response_model=AnomalyAlert)
async def get_alert(alert_id: str):
    if alert_id not in ALERTS:
        raise HTTPException(status_code=404, detail="Alert not found")
    return ALERTS[alert_id]

@app.post("/threshold-proposal")
async def submit_proposal(proposal: ThresholdProposal):
    logger.info(f"Submitting threshold proposal {proposal.proposal_id}")
    
    # Send to policy engine
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{POLICY_ENGINE_URL}/proposals",
                json=proposal.model_dump()
            )
            if resp.status_code == 200:
                proposal.status = "approved"
    except Exception as e:
        logger.error(f"Error submitting to policy engine: {e}")
        
    return proposal
