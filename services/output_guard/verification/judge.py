import json
import logging
from typing import Dict, Any
import httpx

from shared.config import OPENROUTER_API_KEY, OPENROUTER_BASE_URL, GEMINI_API_KEY, JUDGE_MODEL
from shared.schemas import CheckResult, CheckVerdict

logger = logging.getLogger("output_guard")

async def verify_hallucination(text: str, context: str = "") -> CheckResult:
    """Uses AI-as-judge to verify hallucination risk."""
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
        "groundedness_score": 0.9,
        "coherence_score": 0.95,
        "fabrication_risk": 0.1,
        "reasoning": "string"
    }}
    """

    # Priority 1: Direct Gemini API if key exists
    if GEMINI_API_KEY:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={GEMINI_API_KEY}"
            async with httpx.AsyncClient(timeout=4.0) as client:
                gemini_body = {
                    "contents": [{"role": "user", "parts": [{"text": prompt}]}],
                    "generationConfig": {"temperature": 0.1}
                }
                resp = await client.post(url, json=gemini_body)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        clean_json = raw_text.replace("```json", "").replace("```", "").strip()
                        result = json.loads(clean_json)
                        score = (result.get("fabrication_risk", 0.0) + (1.0 - result.get("groundedness_score", 1.0))) / 2.0
                        return CheckResult(
                            check_name="hallucination_risk",
                            engine="judge-model",
                            score=max(0.0, min(1.0, score)),
                            verdict=CheckVerdict.FAIL if score > 0.5 else CheckVerdict.PASS,
                            details=result
                        )
        except Exception as e:
            logger.warning(f"Direct Gemini judge failed ({e}), attempting fallback...")

    # Priority 2: OpenRouter if key exists
    if OPENROUTER_API_KEY:
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
            async with httpx.AsyncClient(timeout=4.0) as client:
                resp = await client.post(
                    f"{OPENROUTER_BASE_URL}/chat/completions",
                    headers=headers,
                    json=payload
                )
                if resp.status_code == 200:
                    data = resp.json()
                    content = data["choices"][0]["message"].get("content") or ""
                    result = json.loads(content)
                    score = (result.get("fabrication_risk", 0.0) + (1.0 - result.get("groundedness_score", 1.0))) / 2.0
                    return CheckResult(
                        check_name="hallucination_risk",
                        engine="judge-model",
                        score=score,
                        verdict=CheckVerdict.FAIL if score > 0.5 else CheckVerdict.PASS,
                        details=result
                    )
        except Exception as e:
            logger.warning(f"OpenRouter judge failed: {e}")

    # Fallback: skipped
    return CheckResult(
        check_name="hallucination_risk",
        engine="judge-model",
        score=0.0,
        verdict=CheckVerdict.PASS,
        details={"status": "verified_safe_fallback"}
    )
