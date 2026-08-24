import sys
from pathlib import Path
from typing import List, Optional, Dict
import time

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from shared.schemas import EscalationItem, ReviewAction, HumanOutcome
from shared.config import setup_logging, AUDIT_STORE_URL

logger = setup_logging("review_console")
app = FastAPI(title="Review Console Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory escalation queue for prototype
ESCALATIONS: Dict[str, EscalationItem] = {}

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.post("/escalations")
async def add_escalation(item: EscalationItem):
    logger.info(f"Adding escalation for {item.interaction_id}")
    ESCALATIONS[item.interaction_id] = item
    return {"status": "added", "interaction_id": item.interaction_id}

from datetime import datetime, timezone

@app.get("/escalations", response_model=List[EscalationItem])
async def list_escalations(status: Optional[str] = None):
    items = list(ESCALATIONS.values())
    if status and status.lower() != "all":
        items = [e for e in items if e.status.lower() == status.lower()]
    # Return newest first
    return sorted(items, key=lambda x: x.created_at, reverse=True)

@app.get("/escalations/{interaction_id}", response_model=EscalationItem)
async def get_escalation(interaction_id: str):
    if interaction_id not in ESCALATIONS:
        raise HTTPException(status_code=404, detail="Escalation not found")
    return ESCALATIONS[interaction_id]

@app.post("/escalations/{interaction_id}/resolve")
async def resolve_escalation(interaction_id: str, action: ReviewAction):
    if interaction_id not in ESCALATIONS:
        raise HTTPException(status_code=404, detail="Escalation not found")
        
    item = ESCALATIONS[interaction_id]
    item.status = "resolved"
    item.resolution = action.action
    item.resolved_by = action.reviewer_id or "human_operator"
    item.resolved_at = datetime.now(timezone.utc).isoformat()
    item.resolution_reason = action.reason
    item.was_original_flag_correct = action.was_original_flag_correct
    if action.edited_content:
        item.edited_content = action.edited_content
    
    # Write outcome to Audit Store
    outcome = HumanOutcome(
        interaction_id=interaction_id,
        reviewer_id=action.reviewer_id,
        action=action.action,
        was_original_flag_correct=action.was_original_flag_correct,
        reason=action.reason
    )
    
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                f"{AUDIT_STORE_URL}/outcomes",
                json=outcome.model_dump()
            )
            if resp.status_code != 200:
                logger.error(f"Failed to save outcome to Audit Store: {resp.text}")
    except Exception as e:
        logger.error(f"Error calling Audit Store: {e}")
        
    return {"status": "resolved", "item": item}

@app.get("/stats")
async def get_stats():
    resolved_count = sum(1 for e in ESCALATIONS.values() if e.status == "resolved")
    pending_count = len(ESCALATIONS) - resolved_count
    return {
        "queue_depth": pending_count,
        "resolved_total": resolved_count
    }
