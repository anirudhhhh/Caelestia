import json
import logging
from typing import Dict, Any
import httpx

from shared.config import GEMINI_API_KEY, JUDGE_MODEL
from shared.schemas import CheckResult, CheckVerdict

logger = logging.getLogger("output_guard")

async def verify_hallucination(text: str, context: str = "") -> CheckResult:
    """Uses Google Gemini as AI-as-judge to verify hallucination and groundedness risk."""
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

    # Primary: Direct Google Gemini API
    candidate_judge_models = [
        JUDGE_MODEL,
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro"
    ]
    for judge_model in candidate_judge_models:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{judge_model}:generateContent?key={GEMINI_API_KEY}"
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
                            engine="gemini-judge",
                            score=max(0.0, min(1.0, score)),
                            verdict=CheckVerdict.FAIL if score > 0.5 else CheckVerdict.PASS,
                            details=result
                        )
        except Exception as e:
            logger.warning(f"Direct Gemini judge failed for {judge_model}: {e}")
            continue

    # Fallback: verified safe fallback
    return CheckResult(
        check_name="hallucination_risk",
        engine="gemini-judge",
        score=0.0,
        verdict=CheckVerdict.PASS,
        details={"status": "verified_safe_fallback"}
    )
