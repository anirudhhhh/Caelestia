import re
import math
import sys
import json
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
        return self.endpoint or self.target_model_or_url or "gemini-3.5-flash-lite"

# In-memory registry of enterprise workflow endpoints with semantic instructions
DEFAULT_ENDPOINTS: Dict[str, WorkflowEndpoint] = {
    "customer_support": WorkflowEndpoint(
        id="customer_support",
        name="Customer Support & Success",
        instructions="Handles general customer inquiries, product questions, order status, returns, refunds, user onboarding, and satisfaction surveys.",
        endpoint="gemini-3.5-flash-lite",
        target_model_or_url="gemini-3.5-flash-lite",
        use_case="customer_support",
        keywords=["order", "refund", "customer", "return", "product", "account", "help", "support", "ticket", "status"],
        weight=1.0
    ),
    "internal_copilot": WorkflowEndpoint(
        id="internal_copilot",
        name="Engineering & Internal Copilot",
        instructions="Specialized in software debugging, Python, API integrations, cloud architecture, stack traces, code generation, and developer diagnostics.",
        endpoint="gemini-3.5-flash-lite",
        target_model_or_url="gemini-3.5-flash-lite",
        use_case="internal_copilot",
        keywords=["code", "debug", "python", "api", "function", "error", "script", "database", "sql", "bug", "aws", "docker"],
        weight=1.0
    ),
    "decision_support": WorkflowEndpoint(
        id="decision_support",
        name="Billing & Financial Decision Support",
        instructions="Handles enterprise subscription plans, payment processing, invoices, receipts, contract terms, billing disputes, and price tiers.",
        endpoint="gemini-3.5-flash-lite",
        target_model_or_url="gemini-3.5-flash-lite",
        use_case="decision_support",
        keywords=["billing", "invoice", "payment", "subscription", "price", "charge", "credit", "receipt", "plan", "cost"],
        weight=1.0
    ),
    "legal_compliance": WorkflowEndpoint(
        id="legal_compliance",
        name="Security & Legal Compliance",
        instructions="Specialized in terms of service, GDPR, compliance requirements, enterprise privacy policies, data governance, and regulatory guidelines.",
        endpoint="gemini-3.5-flash-lite",
        target_model_or_url="gemini-3.5-flash-lite",
        use_case="decision_support",
        keywords=["policy", "legal", "gdpr", "compliance", "privacy", "terms", "contract", "security", "regulation", "confidential"],
        weight=1.0
    ),
    "mocha_endpoint": WorkflowEndpoint(
        id="mocha_endpoint",
        name="Mocha QA & Load Balancer Live Test Endpoint",
        instructions="Specialized live test endpoint for verifying semantic load balancer routing, latency diagnostics, and returning mocha outputs.",
        endpoint="http://localhost:8099/complete",
        target_model_or_url="http://localhost:8099/complete",
        use_case="customer_support",
        keywords=["mocha", "mochaaa", "coffee", "test", "testing", "echo", "ping", "probe", "latency", "benchmark"],
        weight=1.2
    ),
}

DATA_DIR = Path(__file__).parent / "data"
ENDPOINTS_FILE = DATA_DIR / "custom_endpoints.json"

from services.router.vector_router import vector_db_router

def _save_custom_endpoints():
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        custom = {k: v.model_dump() for k, v in DEFAULT_ENDPOINTS.items()}
        with open(ENDPOINTS_FILE, "w") as f:
            json.dump(custom, f, indent=2)
    except Exception as e:
        logger.warning(f"Failed to save custom endpoints: {e}")

# Initialize Pinecone-style Vector Index with default enterprise endpoints + saved custom endpoints
def _init_vector_index():
    if ENDPOINTS_FILE.exists():
        try:
            with open(ENDPOINTS_FILE, "r") as f:
                saved = json.load(f)
                for eid, edata in saved.items():
                    DEFAULT_ENDPOINTS[eid] = WorkflowEndpoint(**edata)
        except Exception as e:
            logger.warning(f"Failed to load custom endpoints from file: {e}")

    for ep in DEFAULT_ENDPOINTS.values():
        vector_db_router.index_endpoint(
            endpoint_id=ep.id,
            name=ep.name,
            instructions=ep.instructions,
            keywords=ep.keywords,
            target_model=ep.push_target,
            use_case=ep.use_case,
            weight=ep.weight
        )

_init_vector_index()

SESSION_ROUTES: Dict[str, str] = {}

@app.get("/")
async def root():
    return {"status": "ok", "message": "Service is running"}

@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "router", "indexed_endpoints": len(vector_db_router.vector_index)}

@app.get("/endpoints")
async def list_endpoints():
    return list(DEFAULT_ENDPOINTS.values())

@app.post("/endpoints")
async def register_endpoint(endpoint: WorkflowEndpoint):
    DEFAULT_ENDPOINTS[endpoint.id] = endpoint
    vector_db_router.index_endpoint(
        endpoint_id=endpoint.id,
        name=endpoint.name,
        instructions=endpoint.instructions,
        keywords=endpoint.keywords,
        target_model=endpoint.push_target,
        use_case=endpoint.use_case,
        weight=endpoint.weight
    )
    _save_custom_endpoints()
    logger.info(f"Registered and indexed workflow endpoint: {endpoint.id} ({endpoint.name})")
    return {"status": "registered", "endpoint": endpoint}

@app.put("/endpoints/{endpoint_id}")
async def update_endpoint(endpoint_id: str, endpoint: WorkflowEndpoint):
    endpoint.id = endpoint_id
    DEFAULT_ENDPOINTS[endpoint_id] = endpoint
    vector_db_router.index_endpoint(
        endpoint_id=endpoint.id,
        name=endpoint.name,
        instructions=endpoint.instructions,
        keywords=endpoint.keywords,
        target_model=endpoint.push_target,
        use_case=endpoint.use_case,
        weight=endpoint.weight
    )
    _save_custom_endpoints()
    logger.info(f"Updated and re-indexed workflow endpoint: {endpoint.id} ({endpoint.name})")
    return {"status": "updated", "endpoint": endpoint}

class MatchRequest(BaseModel):
    prompt: str

@app.post("/match")
async def test_semantic_match(req: MatchRequest):
    """Test and rank all active endpoints against an input prompt using 384-d Pinecone-style Vector Search."""
    if not req.prompt or not req.prompt.strip():
        return {"results": [], "winning_endpoint": None}

    vector_matches = vector_db_router.search_similar_endpoints(req.prompt, top_k=len(DEFAULT_ENDPOINTS))
    results = []
    for m in vector_matches:
        ep_id = m["endpoint"]
        if ep_id in DEFAULT_ENDPOINTS and DEFAULT_ENDPOINTS[ep_id].active:
            ep = DEFAULT_ENDPOINTS[ep_id]
            results.append({
                "id": ep.id,
                "name": ep.name,
                "target": ep.push_target,
                "endpoint": ep.push_target,
                "use_case": ep.use_case,
                "score": m["score"],
                "matched_keywords": m["vector_metrics"].get("matched_keywords", []),
                "weight": ep.weight,
                "vector_metrics": m["vector_metrics"]
            })
    return {"results": results, "winning_endpoint": results[0] if results else None}

@app.delete("/endpoints/{endpoint_id}")
async def delete_endpoint(endpoint_id: str):
    if endpoint_id in DEFAULT_ENDPOINTS:
        del DEFAULT_ENDPOINTS[endpoint_id]
        vector_db_router.remove_endpoint(endpoint_id)
        _save_custom_endpoints()
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
    logger.info(f"[{envelope.interaction_id}] Vector-routing request via 384-d Pinecone-style DB")
    
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

    # 3. Pinecone-style Vector DB Hybrid Search over active endpoints
    vector_matches = vector_db_router.search_similar_endpoints(text, top_k=5)
    candidate_scores = []
    for m in vector_matches:
        ep_id = m["endpoint"]
        if ep_id in DEFAULT_ENDPOINTS and DEFAULT_ENDPOINTS[ep_id].active:
            ep = DEFAULT_ENDPOINTS[ep_id]
            candidate_scores.append({
                "endpoint": ep.id,
                "name": ep.name,
                "model": ep.push_target,
                "score": m["score"],
                "use_case": ep.use_case,
                "vector_metrics": m["vector_metrics"]
            })

    if candidate_scores:
        best = candidate_scores[0]
        envelope.model.routed_to = best["model"]
        envelope.model.routing_trace = candidate_scores
        SESSION_ROUTES[session_id] = best["endpoint"]
        logger.info(f"[{envelope.interaction_id}] Vector-routed to {best['name']} (score: {best['score']}, cos_sim: {best['vector_metrics']['cosine_similarity']}) -> {best['model']}")
    else:
        fallback_model = DEFAULT_MODEL or (AVAILABLE_MODELS[0] if AVAILABLE_MODELS else "google/gemini-2.5-flash")
        envelope.model.routed_to = fallback_model
        envelope.model.routing_trace = [{"model": fallback_model, "score": 1.0, "reason": "default_fallback"}]

    return envelope

