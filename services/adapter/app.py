import sys
import time
from pathlib import Path
from typing import Optional, List, Dict, Any

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import httpx
from fastapi.middleware.cors import CORSMiddleware
from shared.config import setup_logging, OPENROUTER_API_KEY, OPENROUTER_BASE_URL, GEMINI_API_KEY

logger = setup_logging("adapter")
app = FastAPI(title="Model Adapter")

if not OPENROUTER_BASE_URL or not OPENROUTER_BASE_URL.startswith(("http://", "https://")):
    logger.error(f"OPENROUTER_BASE_URL is missing or malformed: {OPENROUTER_BASE_URL!r}")
    raise RuntimeError(
        f"OPENROUTER_BASE_URL must be a full URL (e.g. https://openrouter.ai/api/v1), "
        f"got {OPENROUTER_BASE_URL!r}. Check your .env file."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AdapterRequest(BaseModel):
    model: str
    messages: List[Dict[str, Any]]
    max_tokens: Optional[int] = 1000
    temperature: Optional[float] = 1.0

class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0

class AdapterResponse(BaseModel):
    content: str
    finish_reason: str
    usage: Usage
    latency_ms: float
    provider_request_id: Optional[str] = None

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.post("/complete", response_model=AdapterResponse)
async def complete(req: AdapterRequest):
    logger.info(f"Completing request with model {req.model}")
    start_time = time.time()
    
    payload = {
        "model": req.model,
        "messages": req.messages,
    }
    if req.max_tokens is not None:
        payload["max_tokens"] = req.max_tokens
    if req.temperature is not None:
        payload["temperature"] = req.temperature
        
    # Case 1: External HTTP agent or microservice endpoint
    if req.model.startswith(("http://", "https://")):
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(
                    req.model,
                    headers={"Content-Type": "application/json"},
                    json=payload
                )
                resp.raise_for_status()
                data = resp.json()
                
                # Extract text content supporting various formats
                if isinstance(data, dict):
                    content = (
                        (data.get("choices") or [{}])[0].get("message", {}).get("content")
                        or data.get("content")
                        or data.get("response")
                        or data.get("message")
                        or str(data)
                    )
                else:
                    content = str(data)
                    
                return AdapterResponse(
                    content=content,
                    finish_reason="stop",
                    usage=Usage(prompt_tokens=0, completion_tokens=0),
                    latency_ms=(time.time() - start_time) * 1000,
                    provider_request_id=None
                )
        except httpx.HTTPStatusError as e:
            logger.error(f"External service HTTP error: {e.response.text}")
            raise HTTPException(status_code=e.response.status_code, detail=f"External endpoint returned {e.response.status_code}: {e.response.text}")
        except Exception as e:
            logger.error(f"External endpoint error: {e}")
            raise HTTPException(status_code=502, detail=f"Failed to communicate with external endpoint: {str(e)}")

    # Case 2: Standard LLM model via OpenRouter
    if not OPENROUTER_API_KEY:
        raise HTTPException(status_code=500, detail="OpenRouter API key not configured")
        
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                headers=headers,
                json=payload
            )
            resp.raise_for_status()
            data = resp.json()
            
            content = data["choices"][0]["message"].get("content") or ""
            finish_reason = data["choices"][0].get("finish_reason", "unknown")
            usage_data = data.get("usage", {})
            
            return AdapterResponse(
                content=content,
                finish_reason=finish_reason,
                usage=Usage(
                    prompt_tokens=usage_data.get("prompt_tokens", 0),
                    completion_tokens=usage_data.get("completion_tokens", 0)
                ),
                latency_ms=(time.time() - start_time) * 1000,
                provider_request_id=data.get("id")
            )
            
    except httpx.HTTPStatusError as e:
        logger.error(f"Provider error: {e.response.text}")
        raise HTTPException(status_code=e.response.status_code, detail=f"Provider error: {e.response.text}")
    except Exception as e:
        logger.error(f"Adapter error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
