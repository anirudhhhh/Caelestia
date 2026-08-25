import hashlib
import sys
import yaml
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware

# Adjust path to import shared modules and local modules
sys.path.insert(0, str(Path(__file__).parent.parent.parent))
sys.path.insert(0, str(Path(__file__).parent))

from shared.config import setup_logging
from shared.schemas import (
    PolicyDecisionRequest, PolicyDecisionResponse, Decision, 
    DecisionAction, RiskAssessment, RiskTier, ThresholdProposal
)

from services.policy_engine.evaluator import PolicyEvaluator, load_policies

logger = setup_logging("policy_engine")
CONFIG_DIR = Path(__file__).parent / "config"
POLICIES_DIR = CONFIG_DIR / "policies"
DEFAULT_POLICY_FILE = POLICIES_DIR / "default.yaml"

evaluator = PolicyEvaluator()

def reload_evaluator():
    if DEFAULT_POLICY_FILE.exists():
        with open(DEFAULT_POLICY_FILE, "r") as f:
            content = f.read()
            config_hash = hashlib.sha256(content.encode()).hexdigest()[:8]
            data = yaml.safe_load(content)
            evaluator.update_policies(data, config_hash)
            logger.info(f"Policies reloaded. Version: {config_hash}")

app = FastAPI(title="Policy Engine Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    # Make sure dirs exist
    POLICIES_DIR.mkdir(parents=True, exist_ok=True)
    if not DEFAULT_POLICY_FILE.exists():
        logger.warning(f"Policy file {DEFAULT_POLICY_FILE} not found. Using empty policies.")
        evaluator.update_policies({}, "initial")
    else:
        reload_evaluator()

@app.post("/decide", response_model=PolicyDecisionResponse)
async def decide(req: PolicyDecisionRequest):
    return evaluator.evaluate(req)

@app.get("/policies")
async def get_policies():
    if not DEFAULT_POLICY_FILE.exists():
        return {"policies": [], "defaults": {}}
    with open(DEFAULT_POLICY_FILE, "r") as f:
        data = yaml.safe_load(f)
    return {"version": evaluator.version, "config": data}

@app.put("/policies")
async def update_policies(new_config: Dict[str, Any]):
    try:
        with open(DEFAULT_POLICY_FILE, "w") as f:
            yaml.dump(new_config, f, default_flow_style=False)
        reload_evaluator()
        return {"status": "updated", "version": evaluator.version}
    except Exception as e:
        logger.error(f"Failed to update policies: {e}")
        raise HTTPException(status_code=500, detail="Failed to update policies")

@app.post("/threshold-proposal")
async def receive_threshold_proposal(proposal: ThresholdProposal):
    logger.info(f"Received proposal: {proposal.proposal_id} for {proposal.check_name}")
    # In a real system, this would be persisted to a DB and evaluated by humans/immune system
    return {"status": "received", "proposal_id": proposal.proposal_id}

@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "policy_engine", "version": evaluator.version}

@app.get("/metrics")
async def metrics():
    return {"status": "ok"}
