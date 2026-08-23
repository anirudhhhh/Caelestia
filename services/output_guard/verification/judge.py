import json
import logging
from typing import Dict, Any
import httpx

from shared.config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL, JUDGE_MODEL
from shared.schemas import CheckResult, CheckVerdict

logger = logging.getLogger("output_guard")

async def verify_hallucination(text: str, context: str = "") -> CheckResult:
    """Uses AI-as-judge to verify hallucination risk."""
    if not OPENROUTER_API_KEY:
        logger.warning("No OpenRouter API key found, skipping judge verification.")
        return CheckResult(
            check_name="hallucination_risk",
            engine="judge-model",
            score=0.0,
            verdict=CheckVerdict.SKIPPED,
            details={"error": "missing API key"}
        )
        
    prompt = f"""
    You are an AI judge verifying the safety and factual accuracy of an AI assistant's response.
    Rate the following response based on:
    1. Groundedness (is it grounded in context?)
    2. Coherence (does it make sense?)
    3. Fabrication risk (does it contain likely fabricated details?)
    
    Context: {context}
    Response: {text}
    
    Output ONLY a JSON object with this schema:
    {{
        "groundedness_score": float (0-1),
        "coherence_score": float (0-1),
        "fabrication_risk": float (0-1),
        "reasoning": string
    }}
    """
    
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": JUDGE_MODEL,
        "messages": [
            {"role": "system", "content": "You are a JSON-only response evaluator."},
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"}
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{OPENROUTER_BASE_URL}/chat/completions",
                headers=headers,
                json=payload
            )
            resp.raise_for_status()
            
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            
            # Parse JSON
            result = json.loads(content)
            
            # Combine signals: higher fabrication risk -> higher hallucination risk
            # Lower groundedness -> higher hallucination risk
            score = (result.get("fabrication_risk", 0.0) + (1.0 - result.get("groundedness_score", 1.0))) / 2.0
            
            verdict = CheckVerdict.FAIL if score > 0.5 else CheckVerdict.PASS
            
            return CheckResult(
                check_name="hallucination_risk",
                engine="judge-model",
                score=score,
                verdict=verdict,
                details=result
            )
            
    except Exception as e:
        logger.error(f"Error calling judge model: {e}")
        return CheckResult(
            check_name="hallucination_risk",
            engine="judge-model",
            score=0.0,
            verdict=CheckVerdict.SKIPPED,
            details={"error": str(e)}
        )
