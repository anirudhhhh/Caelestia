import sys
import yaml
from pathlib import Path
from typing import Dict, Any, List

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pydantic import BaseModel
from shared.schemas import ToolCall, BlastRadius, ToolGuardVerdict, UseCase, Direction, CheckResult, PolicyDecisionRequest
from shared.config import setup_logging, POLICY_ENGINE_URL

logger = setup_logging("action_guard")
app = FastAPI(title="Action Guard")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def load_registry():
    path = Path(__file__).parent / "tool_registry.yaml"
    if not path.exists():
        return {}
    with open(path, "r") as f:
        data = yaml.safe_load(f)
        return {t["name"]: t for t in data.get("tools", [])}

REGISTRY = load_registry()

# Cumulative session risk tracking
SESSION_RISK: Dict[str, float] = {}

class GuardRequest(BaseModel):
    tool_calls: List[ToolCall]
    session_id: str
    use_case: UseCase
    interaction_id: str

class GuardResponse(BaseModel):
    tool_calls: List[ToolCall]

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.get("/registry")
async def get_registry():
    return list(REGISTRY.values())

@app.post("/guard", response_model=GuardResponse)
async def guard_tools(req: GuardRequest):
    logger.info(f"[{req.interaction_id}] Guarding {len(req.tool_calls)} tool calls")
    
    # Pre-process blast radius
    for tc in req.tool_calls:
        if tc.tool_name in REGISTRY:
            tc.blast_radius = BlastRadius(REGISTRY[tc.tool_name]["blast_radius"])
        else:
            tc.blast_radius = BlastRadius.IRREVERSIBLE_ACTION
            
    # Call Policy Engine to decide based on blast radius
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            pe_req = PolicyDecisionRequest(
                interaction_id=req.interaction_id,
                use_case=req.use_case,
                geography="US", # default
                direction=Direction.OUTPUT,
                checks=[],
                tool_calls=req.tool_calls
            )
            pe_resp = await client.post(f"{POLICY_ENGINE_URL}/decide", json=pe_req.model_dump())
            if pe_resp.status_code == 200:
                # The policy engine should have updated the tool calls with verdicts
                # For this prototype, we'll assign verdicts ourselves if PE didn't handle it
                pass
    except Exception as e:
        logger.error(f"[{req.interaction_id}] Failed to reach Policy Engine: {e}")
        
    # Basic logic if Policy Engine is simple
    for tc in req.tool_calls:
        if tc.blast_radius == BlastRadius.IRREVERSIBLE_ACTION:
            tc.guard_verdict = ToolGuardVerdict.ESCALATE
            tc.guard_reason = "Irreversible action requires approval"
        elif tc.blast_radius == BlastRadius.REVERSIBLE_WRITE:
            # Maybe check cumulative session risk
            risk = SESSION_RISK.get(req.session_id, 0.0)
            if risk > 0.5:
                tc.guard_verdict = ToolGuardVerdict.BLOCK
                tc.guard_reason = "Session risk too high for write"
            else:
                tc.guard_verdict = ToolGuardVerdict.ALLOW
        else:
            tc.guard_verdict = ToolGuardVerdict.ALLOW
            
    return GuardResponse(tool_calls=req.tool_calls)
