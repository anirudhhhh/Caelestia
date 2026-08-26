"""
ControlPlane.ai — Guardrails ML Microservice (Port 8011)

Provides L2 contextual ML classification (toxicity & prompt injection)
and L3 semantic vector similarity search over attack corpora.
Also supports real-time ingestion of confirmed human review attacks.
"""

import sys
from pathlib import Path
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from shared.config import setup_logging
from services.guardrails_ml.classifiers import ContextualToxicityClassifier, PromptInjectionClassifier
from services.guardrails_ml.vector_store import get_vector_store

logger = setup_logging("guardrails_ml")
app = FastAPI(title="Guardrails ML Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

toxicity_classifier = ContextualToxicityClassifier()
injection_classifier = PromptInjectionClassifier()
vector_store = get_vector_store()

class ClassificationRequest(BaseModel):
    text: str
    use_case: Optional[str] = "customer_support"
    geography: Optional[str] = "US"

class CorpusAddRequest(BaseModel):
    text: str
    pattern_type: Optional[str] = "confirmed_review"
    source: Optional[str] = "human_review"

@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "guardrails_ml"}

@app.get("/status")
async def status():
    return {
        "status": "healthy",
        "service": "guardrails_ml",
        "corpus_size": len(vector_store.corpus),
        "dimension": vector_store.dimension
    }

@app.post("/classify/toxicity")
async def classify_toxicity(req: ClassificationRequest):
    result = toxicity_classifier.predict(req.text)
    return result

@app.post("/classify/injection")
async def classify_injection(req: ClassificationRequest):
    result = injection_classifier.predict(req.text)
    return result

@app.post("/similarity/attack-corpus")
async def similarity_attack_corpus(req: ClassificationRequest):
    result = vector_store.search_similar_attacks(req.text, top_k=3)
    return result

@app.post("/similarity/toxicity")
async def similarity_toxicity(req: ClassificationRequest):
    result = vector_store.search_similar_toxicity(req.text, top_k=3)
    return result

@app.post("/similarity/secrets")
async def similarity_secrets(req: ClassificationRequest):
    result = vector_store.search_similar_secrets(req.text, top_k=3)
    return result

@app.post("/similarity/policy")
async def similarity_policy(req: ClassificationRequest):
    result = vector_store.search_similar_policy(req.text, top_k=3)
    return result

@app.post("/corpus/add")
async def add_to_corpus(req: CorpusAddRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    result = vector_store.add_attack_pattern(req.text, req.pattern_type, req.source)
    logger.info(f"Ingested confirmed attack into vector store: {result['id']}")
    return result
