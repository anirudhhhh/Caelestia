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

HTTP_CLIENT: Optional[httpx.AsyncClient] = None

def get_http_client() -> httpx.AsyncClient:
    global HTTP_CLIENT
    if HTTP_CLIENT is None or HTTP_CLIENT.is_closed:
        HTTP_CLIENT = httpx.AsyncClient(
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
            timeout=httpx.Timeout(60.0, connect=5.0)
        )
    return HTTP_CLIENT

@app.on_event("startup")
async def startup_event():
    global HTTP_CLIENT
    HTTP_CLIENT = httpx.AsyncClient(
        limits=httpx.Limits(max_keepalive_connections=20, max_connections=100),
        timeout=httpx.Timeout(60.0, connect=5.0)
    )

@app.on_event("shutdown")
async def shutdown_event():
    global HTTP_CLIENT
    if HTTP_CLIENT and not HTTP_CLIENT.is_closed:
        await HTTP_CLIENT.aclose()

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
    return {"status": "ok", "service": "adapter"}

@app.post("/complete", response_model=AdapterResponse)
async def complete(req: AdapterRequest):
    logger.info(f"Completing request with model {req.model}")
    start_time = time.time()
    client = get_http_client()
    
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
            resp = await client.post(
                req.model,
                headers={"Content-Type": "application/json"},
                json=payload
            )
            resp.raise_for_status()
            data = resp.json()
            
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

    # Case 2: Direct Google Gemini API (if GEMINI_API_KEY is present and model is gemini/no OpenRouter key)
    if GEMINI_API_KEY and (not OPENROUTER_API_KEY or req.model.startswith("gemini-") or "gemini" in req.model and not req.model.startswith("google/")):
        try:
            gemini_model = req.model.replace("google/", "") if "/" in req.model else req.model
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={GEMINI_API_KEY}"
            
            # Format messages for Gemini API
            gemini_contents = []
            system_instruction = None
            for m in req.messages:
                role = m.get("role", "user")
                text = m.get("content", "")
                if role == "system":
                    system_instruction = {"parts": [{"text": text}]}
                else:
                    mapped_role = "user" if role == "user" else "model"
                    # Merge adjacent turns with identical role if any
                    if gemini_contents and gemini_contents[-1]["role"] == mapped_role:
                        gemini_contents[-1]["parts"][0]["text"] += f"\n\n{text}"
                    else:
                        gemini_contents.append({
                            "role": mapped_role,
                            "parts": [{"text": text}]
                        })
            
            # Gemini API requires the first turn to be 'user'
            while gemini_contents and gemini_contents[0]["role"] == "model":
                gemini_contents.pop(0)

            if not gemini_contents:
                gemini_contents = [{"role": "user", "parts": [{"text": "Hello"}]}]
            
            gemini_body: Dict[str, Any] = {"contents": gemini_contents}
            if system_instruction:
                gemini_body["systemInstruction"] = system_instruction
            if req.max_tokens or req.temperature:
                gemini_body["generationConfig"] = {}
                if req.max_tokens:
                    gemini_body["generationConfig"]["maxOutputTokens"] = req.max_tokens
                if req.temperature:
                    gemini_body["generationConfig"]["temperature"] = req.temperature

            resp = await client.post(url, json=gemini_body)
            resp.raise_for_status()
            data = resp.json()
            
            content = ""
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                content = "".join(p.get("text", "") for p in parts)
            
            usage_meta = data.get("usageMetadata", {})
            return AdapterResponse(
                content=content,
                finish_reason="stop",
                usage=Usage(
                    prompt_tokens=usage_meta.get("promptTokenCount", 0),
                    completion_tokens=usage_meta.get("candidatesTokenCount", 0)
                ),
                latency_ms=(time.time() - start_time) * 1000,
                provider_request_id=None
            )
        except httpx.HTTPStatusError as e:
            logger.error(f"Direct Gemini API error: {e.response.text}")
            if not OPENROUTER_API_KEY:
                raise HTTPException(status_code=e.response.status_code, detail=f"Gemini API error: {e.response.text}")
        except Exception as e:
            logger.error(f"Direct Gemini error: {e}")
            if not OPENROUTER_API_KEY:
                raise HTTPException(status_code=500, detail=str(e))

    # Case 3: Universal Multi-Model Execution via OpenRouter
    if not OPENROUTER_API_KEY:
        raise HTTPException(
            status_code=500,
            detail="Neither OPENROUTER_API_KEY nor GEMINI_API_KEY is configured. Please configure your .env file."
        )
        
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    
    try:
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
