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
            # Query audit store for events
            async with httpx.AsyncClient(timeout=10.0) as client:
                try:
                    resp = await client.get(f"{AUDIT_STORE_URL}/stats")
                    if resp.status_code == 200:
                        stats = resp.json()
                        # Dummy EWMA anomaly detection for prototype
                        # In real world, we would keep historical series and compute z-score
                        
                        # Fake anomaly injection if stats indicate high block rate
                        block_rate = stats.get("block_rate", 0.0)
                        if block_rate > 0.15: # 15% block rate
                            alert = AnomalyAlert(
                                metric_name="block_rate",
                                current_value=block_rate,
                                baseline_mean=0.05,
                                baseline_std=0.02,
                                sigma_breach=(block_rate - 0.05)/0.02,
                                severity="critical"
                            )
                            ALERTS[alert.alert_id] = alert
                            logger.warning(f"Anomaly detected: {alert.metric_name} = {alert.current_value}")
                            
                            # Send to review console
                            # Actually need to send it as an escalation but we just log for now
                except Exception as e:
                    logger.error(f"Failed to query audit store: {e}")
                    
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
