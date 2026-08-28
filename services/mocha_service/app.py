import sys
import time
from pathlib import Path
from typing import Optional, List, Dict, Any

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Mocha Test Endpoint", description="Testing endpoint for Semantic Load Balancer and Gateway")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MOCHA_RESPONSE = {
    "content": "mochaaa",
    "response": "mochaaa",
    "message": {
        "role": "assistant",
        "content": "mochaaa"
    },
    "choices": [
        {
            "index": 0,
            "message": {
                "role": "assistant",
                "content": "mochaaa"
            },
            "finish_reason": "stop"
        }
    ],
    "model": "mocha-test-endpoint",
    "usage": {
        "prompt_tokens": 5,
        "completion_tokens": 1,
        "total_tokens": 6
    }
}

@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "mocha_service", "response": "mochaaa"}

@app.get("/")
async def root():
    return MOCHA_RESPONSE

@app.post("/")
async def root_post(req: Request):
    return MOCHA_RESPONSE

@app.post("/complete")
async def complete_post(req: Request):
    return MOCHA_RESPONSE

@app.post("/chat")
async def chat_post(req: Request):
    return MOCHA_RESPONSE

@app.post("/v1/chat/completions")
async def completions_post(req: Request):
    return MOCHA_RESPONSE

@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def catch_all(full_path: str, req: Request):
    return MOCHA_RESPONSE

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8099)
