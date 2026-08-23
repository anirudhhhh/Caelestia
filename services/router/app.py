import sys
from pathlib import Path
import yaml
import logging

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from shared.schemas import InteractionEnvelope
from shared.config import setup_logging, AVAILABLE_MODELS

logger = setup_logging("router")
app = FastAPI(title="Router & Load Balancer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def load_profiles():
    profile_path = Path(__file__).parent / "config" / "capability_profiles.yaml"
    if not profile_path.exists():
        logger.warning("No capability profiles found.")
        return {}
    with open(profile_path, "r") as f:
        data = yaml.safe_load(f)
        return {m["id"]: m for m in data.get("models", [])}

PROFILES = load_profiles()

# Mock session tracking for session continuity
SESSION_MODELS = {}

def score_model(model_id: str, text: str) -> float:
    profile = PROFILES.get(model_id)
    if not profile:
        return 0.1 # Base score
    
    score = profile.get("weight", 0.5)
    keywords = profile.get("keywords", [])
    text_lower = text.lower()
    
    for kw in keywords:
        if kw in text_lower:
            score += 0.5
            
    return score

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.get("/models")
async def list_models():
    return {
        "available_models": AVAILABLE_MODELS,
        "health": {m: "healthy" for m in AVAILABLE_MODELS}
    }

@app.post("/route", response_model=InteractionEnvelope)
async def route(envelope: InteractionEnvelope):
    logger.info(f"[{envelope.interaction_id}] Routing request")
    
    session_id = envelope.session_id
    text = envelope.payload.content
    
    if session_id in SESSION_MODELS and SESSION_MODELS[session_id] in AVAILABLE_MODELS:
        envelope.model.routed_to = SESSION_MODELS[session_id]
        envelope.model.routing_trace = [{"model": SESSION_MODELS[session_id], "reason": "session_continuity"}]
        return envelope
    
    scores = []
    for m in AVAILABLE_MODELS:
        s = score_model(m, text)
        scores.append({"model": m, "score": s})
        
    scores.sort(key=lambda x: x["score"], reverse=True)
    
    if scores:
        best_model = scores[0]["model"]
        envelope.model.routed_to = best_model
        envelope.model.routing_trace = scores
        SESSION_MODELS[session_id] = best_model
    else:
        # Fallback
        envelope.model.routed_to = AVAILABLE_MODELS[0] if AVAILABLE_MODELS else "unknown"
        envelope.model.routing_trace = [{"model": envelope.model.routed_to, "reason": "fallback"}]
        
    return envelope
