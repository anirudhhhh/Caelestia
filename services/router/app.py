import re
import math
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from shared.schemas import InteractionEnvelope
from shared.config import setup_logging, AVAILABLE_MODELS, DEFAULT_MODEL

logger = setup_logging("router")
app = FastAPI(title="Semantic Router & Load Balancer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class WorkflowEndpoint(BaseModel):
    id: str
    name: str
    instructions: str
    endpoint: Optional[str] = None
    target_model_or_url: Optional[str] = None
    use_case: str = "general"
    keywords: List[str] = Field(default_factory=list)
    weight: float = 1.0
    active: bool = True

    @property
    def push_target(self) -> str:
        return self.endpoint or self.target_model_or_url or "google/gemini-2.5-flash"

# In-memory registry of enterprise workflow endpoints with semantic instructions
DEFAULT_ENDPOINTS: Dict[str, WorkflowEndpoint] = {
    "customer_support_workflow": WorkflowEndpoint(
        id="customer_support_workflow",
        name="Customer Support & Success Workflow",
        instructions="Handles general customer inquiries, product questions, order status, returns, refunds, user onboarding, and satisfaction surveys.",
        endpoint="google/gemini-2.5-flash",
        target_model_or_url="google/gemini-2.5-flash",
        use_case="customer_support",
        keywords=["order", "refund", "customer", "return", "product", "account", "help", "support", "ticket", "status"],
        weight=1.0
    ),
    "technical_troubleshooting_workflow": WorkflowEndpoint(
        id="technical_troubleshooting_workflow",
        name="Technical & Engineering Diagnostics Workflow",
        instructions="Specialized in software debugging, Python, API integrations, cloud architecture, stack traces, code generation, and developer diagnostics.",
        endpoint="google/gemini-2.5-flash",
        target_model_or_url="google/gemini-2.5-flash",
        use_case="internal_copilot",
        keywords=["code", "debug", "python", "api", "function", "error", "script", "database", "sql", "bug", "aws", "docker"],
        weight=1.0
    ),
    "billing_and_finance_workflow": WorkflowEndpoint(
        id="billing_and_finance_workflow",
        name="Billing, Invoicing & Finance Workflow",
        instructions="Handles enterprise subscription plans, payment processing, invoices, receipts, contract terms, billing disputes, and price tiers.",
        endpoint="google/gemini-2.5-flash",
        target_model_or_url="google/gemini-2.5-flash",
        use_case="decision_support",
        keywords=["billing", "invoice", "payment", "subscription", "price", "charge", "credit", "receipt", "plan", "cost"],
        weight=1.0
    ),
    "legal_and_compliance_workflow": WorkflowEndpoint(
        id="legal_and_compliance_workflow",
        name="Security, Governance & Policy Workflow",
        instructions="Specialized in terms of service, GDPR, compliance requirements, enterprise privacy policies, data governance, and regulatory guidelines.",
        endpoint="google/gemini-2.5-flash",
        target_model_or_url="google/gemini-2.5-flash",
        use_case="decision_support",
        keywords=["policy", "legal", "gdpr", "compliance", "privacy", "terms", "contract", "security", "regulation", "confidential"],
        weight=1.0
    ),
}

SESSION_ROUTES: Dict[str, str] = {}

def _tokenize(text: str) -> set[str]:
    """Tokenize text into lowercase alphanumeric words."""
    return set(re.findall(r'\b[a-z0-9_]{3,}\b', text.lower()))

def semantic_match_score(prompt: str, endpoint: WorkflowEndpoint) -> float:
    """
    Computes semantic match score between input prompt and endpoint instructions/keywords.
    Combines instruction TF-IDF term overlap, keyword density, and baseline weight.
    """
    prompt_tokens = _tokenize(prompt)
    if not prompt_tokens:
        return 0.1 * endpoint.weight

    instruction_tokens = _tokenize(endpoint.instructions)
    keyword_tokens = set(k.lower() for k in endpoint.keywords)

    # 1. Jaccard token overlap with instructions
    inst_overlap = len(prompt_tokens & instruction_tokens)
    inst_score = inst_overlap / (math.sqrt(len(prompt_tokens)) * math.sqrt(len(instruction_tokens)) + 1e-5)

    # 2. Keyword hits (weighted heavily for strong semantic intent)
    kw_hits = len(prompt_tokens & keyword_tokens)
    kw_score = min(1.0, kw_hits * 0.35)

    # 3. Combined score
    total_score = (inst_score * 0.45 + kw_score * 0.45 + (0.1 * endpoint.weight))
    return round(float(total_score), 4)

@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "router"}

@app.get("/endpoints")
async def list_endpoints():
    return list(DEFAULT_ENDPOINTS.values())

@app.post("/endpoints")
async def register_endpoint(endpoint: WorkflowEndpoint):
    DEFAULT_ENDPOINTS[endpoint.id] = endpoint
    logger.info(f"Registered workflow endpoint: {endpoint.id} ({endpoint.name})")
    return {"status": "registered", "endpoint": endpoint}

class MatchRequest(BaseModel):
    prompt: str

@app.post("/match")
async def test_semantic_match(req: MatchRequest):
    """Test and rank all active endpoints against an input prompt for semantic explainability."""
    results = []
    for ep in DEFAULT_ENDPOINTS.values():
        if not ep.active:
            continue
        score = semantic_match_score(req.prompt, ep)
        prompt_tokens = _tokenize(req.prompt)
        keyword_tokens = set(k.lower() for k in ep.keywords)
        matched_keywords = list(prompt_tokens & keyword_tokens)
        results.append({
            "id": ep.id,
            "name": ep.name,
            "target": ep.push_target,
            "endpoint": ep.push_target,
            "use_case": ep.use_case,
            "score": score,
            "matched_keywords": matched_keywords,
            "weight": ep.weight
        })
    results.sort(key=lambda x: x["score"], reverse=True)
    return {"results": results, "winning_endpoint": results[0] if results else None}

@app.delete("/endpoints/{endpoint_id}")
async def delete_endpoint(endpoint_id: str):
    if endpoint_id in DEFAULT_ENDPOINTS:
        del DEFAULT_ENDPOINTS[endpoint_id]
        logger.info(f"Deleted workflow endpoint: {endpoint_id}")
        return {"status": "deleted", "id": endpoint_id}
    raise HTTPException(status_code=404, detail="Endpoint not found")

@app.get("/models")
async def list_models():
    return {
        "available_models": AVAILABLE_MODELS,
        "workflow_endpoints": [e.model_dump() for e in DEFAULT_ENDPOINTS.values()],
        "health": {m: "healthy" for m in AVAILABLE_MODELS}
    }

@app.post("/route", response_model=InteractionEnvelope)
async def route(envelope: InteractionEnvelope):
    logger.info(f"[{envelope.interaction_id}] Semantically routing request")
    
    session_id = envelope.session_id
    text = envelope.payload.content
    requested = envelope.model.requested

    # 1. If explicit endpoint ID was requested by client, honor it directly
    if requested and requested in DEFAULT_ENDPOINTS:
        target_ep = DEFAULT_ENDPOINTS[requested]
        envelope.model.routed_to = target_ep.push_target
        envelope.model.routing_trace = [{
            "endpoint": target_ep.id,
            "name": target_ep.name,
            "model": target_ep.push_target,
            "score": 1.0,
            "reason": "explicit_selection"
        }]
        return envelope
    elif requested and (requested in AVAILABLE_MODELS or requested.startswith(("http://", "https://"))):
        envelope.model.routed_to = requested
        envelope.model.routing_trace = [{
            "endpoint": "custom",
            "name": "Custom Model / URL",
            "model": requested,
            "score": 1.0,
            "reason": "explicit_selection"
        }]
        return envelope

    # 2. Check for session continuity
    if session_id in SESSION_ROUTES and SESSION_ROUTES[session_id] in DEFAULT_ENDPOINTS:
        cached_ep = DEFAULT_ENDPOINTS[SESSION_ROUTES[session_id]]
        if cached_ep.active:
            envelope.model.routed_to = cached_ep.push_target
            envelope.model.routing_trace = [{
                "endpoint": cached_ep.id,
                "name": cached_ep.name,
                "model": cached_ep.push_target,
                "score": 1.0,
                "reason": "session_continuity"
            }]
            return envelope

    # 3. Rank active endpoints by semantic match against instructions
    candidate_scores = []
    for ep in DEFAULT_ENDPOINTS.values():
        if not ep.active:
            continue
        score = semantic_match_score(text, ep)
        candidate_scores.append({
            "endpoint": ep.id,
            "name": ep.name,
            "model": ep.push_target,
            "score": score,
            "use_case": ep.use_case
        })

    candidate_scores.sort(key=lambda x: x["score"], reverse=True)

    if candidate_scores:
        best = candidate_scores[0]
        envelope.model.routed_to = best["model"]
        envelope.model.routing_trace = candidate_scores
        SESSION_ROUTES[session_id] = best["endpoint"]
        logger.info(f"[{envelope.interaction_id}] Routed to {best['name']} (score: {best['score']}) -> {best['model']}")
    else:
        fallback_model = DEFAULT_MODEL or (AVAILABLE_MODELS[0] if AVAILABLE_MODELS else "google/gemini-2.5-flash")
        envelope.model.routed_to = fallback_model
        envelope.model.routing_trace = [{"model": fallback_model, "score": 1.0, "reason": "default_fallback"}]

    return envelope

