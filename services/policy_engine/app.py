import hashlib
import sys
import uuid
import yaml
from pathlib import Path
from typing import Any, Dict, List, Optional
from pydantic import BaseModel

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
MASTER_POLICY_FILE = Path(__file__).parent.parent.parent / "policies" / "default_policy.yaml"

evaluator = PolicyEvaluator()

def reload_evaluator():
    target_file = MASTER_POLICY_FILE if MASTER_POLICY_FILE.exists() else DEFAULT_POLICY_FILE
    if target_file.exists():
        with open(target_file, "r") as f:
            content = f.read()
            config_hash = hashlib.sha256(content.encode()).hexdigest()[:8]
            data = yaml.safe_load(content)
            evaluator.update_policies(data, config_hash)
            logger.info(f"Policies reloaded from {target_file.name}. Version: {config_hash}")

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
    POLICIES_DIR.mkdir(parents=True, exist_ok=True)
    reload_evaluator()

@app.post("/decide", response_model=PolicyDecisionResponse)
async def decide(req: PolicyDecisionRequest):
    return evaluator.evaluate(req)

@app.get("/policies")
async def get_policies():
    target_file = MASTER_POLICY_FILE if MASTER_POLICY_FILE.exists() else DEFAULT_POLICY_FILE
    if not target_file.exists():
        return {"policies": [], "defaults": {}}
    with open(target_file, "r") as f:
        data = yaml.safe_load(f)
    return {"version": evaluator.version, "config": data}

@app.put("/policies")
async def update_policies(new_config: Dict[str, Any]):
    try:
        if MASTER_POLICY_FILE.exists():
            # Preserve pii_permissions and other top-level keys if new_config only contains policies
            with open(MASTER_POLICY_FILE, "r") as f:
                existing = yaml.safe_load(f) or {}
            existing.update(new_config)
            with open(MASTER_POLICY_FILE, "w") as f:
                yaml.dump(existing, f, default_flow_style=False)
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

class PolicyExtractRequest(BaseModel):
    text: str
    title: Optional[str] = None

@app.post("/v1/policies/extract")
async def extract_structured_policy_rule(req: PolicyExtractRequest):
    """
    Extracts structured rule (entities, prohibited actions, destination, action)
    from plain language enterprise policy text (§3.8 & §5).
    """
    raw_text = req.text.strip()
    if not raw_text:
        raise HTTPException(status_code=400, detail="Policy text cannot be empty")
    
    text_lower = raw_text.lower()
    
    # 1. Extract Entities
    entities = []
    entity_keywords = {
        "EMAIL": ["email", "e-mail", "inbox"],
        "SSN": ["ssn", "social security", "national id", "tax id"],
        "CREDIT_CARD": ["credit card", "debit card", "cvv", "payment card", "pan"],
        "PHONE": ["phone", "telephone", "mobile number"],
        "API_KEY": ["api key", "apikey", "secret", "token", "password", "credential"],
        "FINANCIAL_DATA": ["revenue", "salary", "earnings", "financial report", "quarterly results"],
        "SOURCE_CODE": ["source code", "proprietary code", "git repository", "intellectual property"],
        "CUSTOMER_DATA": ["customer record", "client data", "patient record", "medical record"]
    }
    for etype, kws in entity_keywords.items():
        if any(kw in text_lower for kw in kws):
            entities.append(etype)
    if not entities:
        entities = ["CONFIDENTIAL_DATA"]

    # 2. Extract Prohibited Actions
    prohibited_actions = []
    action_keywords = {
        "share": ["share", "sharing", "distribute"],
        "send": ["send", "sending", "transmit"],
        "upload": ["upload", "export", "paste"],
        "disclose": ["disclose", "reveal", "leak"],
        "store": ["store", "save", "persist"]
    }
    for act, kws in action_keywords.items():
        if any(kw in text_lower for kw in kws):
            prohibited_actions.append(act)
    if not prohibited_actions:
        prohibited_actions = ["share", "send", "upload"]

    # 3. Extract Destination
    destination = ["EXTERNAL_AI"]
    if "third party" in text_lower or "vendor" in text_lower:
        destination.append("THIRD_PARTY")
    if "public" in text_lower or "internet" in text_lower:
        destination.append("PUBLIC_WEB")

    # 4. Action Outcome
    action = "BLOCK"
    if "redact" in text_lower or "mask" in text_lower:
        action = "REDACT"
    elif "escalate" in text_lower or "review" in text_lower or "human" in text_lower:
        action = "ESCALATE"

    policy_id = f"pol_{uuid.uuid4().hex[:8]}"
    short_desc = req.title or (raw_text[:80] + ("..." if len(raw_text) > 80 else ""))

    # 5. Compute 384-d Embedding
    from services.router.vector_router import vector_db_router
    embedding = vector_db_router.compute_embedding(raw_text)

    structured_rule = {
        "entities": entities,
        "prohibited_actions": prohibited_actions,
        "destination": destination,
        "action": action
    }

    return {
        "policy_id": policy_id,
        "short_description": short_desc,
        "raw_text": raw_text,
        "structured_rule": structured_rule,
        "embedding": embedding,
        "status": "draft"
    }

@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "policy_engine", "version": evaluator.version}

@app.get("/metrics")
async def metrics():
    return {"status": "ok"}
