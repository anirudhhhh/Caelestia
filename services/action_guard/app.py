import sys
import yaml
from pathlib import Path
from typing import Dict, Any, List, Optional

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

def load_registry():
    path = Path(__file__).parent / "tool_registry.yaml"
    if not path.exists():
        return {}
    with open(path, "r") as f:
        data = yaml.safe_load(f)
        return {t["name"]: t for t in data.get("tools", [])}

REGISTRY = load_registry()

# Cumulative session risk tracking (compounding session risk score 0.0 - 1.0)
SESSION_RISK: Dict[str, float] = {}

class GuardRequest(BaseModel):
    tool_calls: List[ToolCall]
    session_id: str
    use_case: UseCase
    interaction_id: str

class GuardResponse(BaseModel):
    tool_calls: List[ToolCall]
    cumulative_session_risk: float = 0.0

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.get("/registry")
async def get_registry():
    return list(REGISTRY.values())

@app.get("/risk/{session_id}")
async def get_session_risk(session_id: str):
    return {"session_id": session_id, "cumulative_risk": SESSION_RISK.get(session_id, 0.0)}

@app.post("/guard", response_model=GuardResponse)
async def guard_tools(req: GuardRequest):
    logger.info(f"[{req.interaction_id}] Guarding {len(req.tool_calls)} tool calls for session {req.session_id}")
    
    # 1. Pre-process blast radius for each tool call
    for tc in req.tool_calls:
        if tc.tool_name in REGISTRY:
            tc.blast_radius = BlastRadius(REGISTRY[tc.tool_name]["blast_radius"])
        else:
            tc.blast_radius = BlastRadius.IRREVERSIBLE_ACTION
            
    # 2. Call Policy Engine
    try:
        client = get_http_client()
        pe_req = PolicyDecisionRequest(
            interaction_id=req.interaction_id,
            use_case=req.use_case,
            geography=Geography.US,
            direction=Direction.OUTPUT,
            checks=[],
            tool_calls=req.tool_calls
        )
        await client.post(f"{POLICY_ENGINE_URL}/decide", json=pe_req.model_dump(), timeout=5.0)
    except Exception as e:
        logger.error(f"[{req.interaction_id}] Failed to reach Policy Engine: {e}")
        
    # 3. Compounding Cumulative Risk Evaluation & Blast Radius Gating
    current_risk = SESSION_RISK.get(req.session_id, 0.0)
    
    for tc in req.tool_calls:
        if tc.blast_radius == BlastRadius.IRREVERSIBLE_ACTION:
            if current_risk > 0.70:
                tc.guard_verdict = ToolGuardVerdict.BLOCK
                tc.guard_reason = f"Cumulative session risk ({current_risk:.2f}) exceeded threshold (0.70) for irreversible action"
            else:
                tc.guard_verdict = ToolGuardVerdict.ESCALATE
                tc.guard_reason = "Irreversible action requires human escalation & approval"
            current_risk += 0.50

        elif tc.blast_radius == BlastRadius.REVERSIBLE_WRITE:
            if current_risk > 0.60:
                tc.guard_verdict = ToolGuardVerdict.BLOCK
                tc.guard_reason = f"Cumulative session risk ({current_risk:.2f}) exceeded threshold (0.60) for write action"
            else:
                tc.guard_verdict = ToolGuardVerdict.ALLOW
                tc.guard_reason = "Reversible write permitted under active session risk allowance"
            current_risk += 0.25

        else:
            tc.guard_verdict = ToolGuardVerdict.ALLOW
            tc.guard_reason = "Read-only operation allowed"
            current_risk += 0.05

    # 4. Write back updated cumulative session risk (bounded at 1.0)
    updated_risk = round(min(1.0, current_risk), 2)
    SESSION_RISK[req.session_id] = updated_risk
    logger.info(f"[{req.interaction_id}] Updated session risk for {req.session_id}: {updated_risk}")
            
    return GuardResponse(tool_calls=req.tool_calls, cumulative_session_risk=updated_risk)
