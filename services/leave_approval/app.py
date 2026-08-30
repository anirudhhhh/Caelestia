"""
ControlPlane.ai — Leave Approval Service Component (§5 PRD)

Demonstrates a workflow combining LLM-based information extraction with
deterministic business rule evaluation.
Extracts number of leave days from natural language and computes approval decision.
Business Rules:
- Leave Days <= 2  -> AUTO_APPROVED
- Leave Days 3-5   -> MANAGER_APPROVAL_REQUIRED
- Leave Days > 5   -> REJECTED
Exposes POST /request-leave, POST /query, and POST /complete.
"""

import sys
import time
import re
import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from shared.config import setup_logging, GEMINI_API_KEY, DEFAULT_MODEL

logger = setup_logging("leave_approval")
app = FastAPI(title="Leave Approval Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class LeaveRequest(BaseModel):
    query: Optional[str] = None
    messages: Optional[List[Dict[str, Any]]] = None
    leave_days: Optional[int] = None
    reason: Optional[str] = None


class LeaveDecisionData(BaseModel):
    leave_days: int
    decision: str
    message: str


class LeaveResponse(BaseModel):
    status: str
    service: str = "leave_approval"
    data: Optional[LeaveDecisionData] = None
    content: Optional[str] = None
    error: Optional[str] = None


async def extract_leave_days_llm(text: str) -> Optional[int]:
    """Uses LLM to extract integer count of leave days from natural language text."""
    if not GEMINI_API_KEY:
        return None

    prompt = f"""
Extract the total number of requested leave days (as a single integer) from this user request.
Count calendar or working days requested (e.g., "September 2 to September 5" = 4 days, "a week" = 5 or 7 days, "2 days" = 2).
Output ONLY a JSON object with this EXACT key:
{{"leave_days": <integer_number>}}

Request: "{text}"

JSON:
"""
    candidate_models = [
        DEFAULT_MODEL,
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-flash-lite-latest",
        "gemini-3.5-flash"
    ]
    candidate_models = list(dict.fromkeys(candidate_models))

    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "maxOutputTokens": 100,
            "temperature": 0.0
        }
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        for model_name in candidate_models:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={GEMINI_API_KEY}"
            try:
                resp = await client.post(url, json=body)
                if resp.status_code == 200:
                    data = resp.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        raw_text = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "")
                        clean_json = raw_text.replace("```json", "").replace("```", "").strip()
                        parsed = json.loads(clean_json)
                        if "leave_days" in parsed and isinstance(parsed["leave_days"], (int, float)):
                            return int(parsed["leave_days"])
            except Exception as e:
                logger.warning(f"Gemini leave extraction failed on {model_name}: {e}")
                continue

    return None


def fallback_extract_days(text: str) -> Optional[int]:
    """Deterministic fallback parsing for numbers and duration expressions."""
    text_lower = text.lower()

    # Number words
    word_map = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
        "a week": 5, "one week": 5, "two weeks": 10, "a month": 20
    }
    for phrase, count in word_map.items():
        if phrase in text_lower:
            return count

    # Digit followed by days
    match = re.search(r'\b(\d+)\s*(?:day|days|working\s+days)\b', text_lower)
    if match:
        return int(match.group(1))

    # "tomorrow and day after" / "tomorrow and the day after"
    if "tomorrow and" in text_lower and "day after" in text_lower:
        return 2
    if "tomorrow" in text_lower or "today" in text_lower or "one day" in text_lower:
        return 1

    # Date range e.g. "September 2 to September 5" or "2nd to 5th"
    range_match = re.search(r'(\d+)(?:st|nd|rd|th)?\s*(?:to|-|until|through)\s*(\d+)(?:st|nd|rd|th)?', text_lower)
    if range_match:
        start_d = int(range_match.group(1))
        end_d = int(range_match.group(2))
        if end_d >= start_d:
            return (end_d - start_d) + 1

    # Any standalone number
    any_num = re.search(r'\b(\d+)\b', text_lower)
    if any_num:
        return int(any_num.group(1))

    return None


def evaluate_leave_rules(leave_days: int) -> Tuple[str, str]:
    """
    Deterministic rule engine:
    - leave_days <= 2 -> AUTO_APPROVED
    - leave_days 3-5  -> MANAGER_APPROVAL_REQUIRED
    - leave_days > 5  -> REJECTED
    """
    if leave_days <= 2:
        decision = "AUTO_APPROVED"
        message = f"Leave request for {leave_days} day{'s' if leave_days != 1 else ''} is automatically approved."
    elif leave_days <= 5:
        decision = "MANAGER_APPROVAL_REQUIRED"
        message = f"Leave request for {leave_days} days requires manager approval."
    else:
        decision = "REJECTED"
        message = f"Leave request for {leave_days} days exceeds single-request limit and is rejected."

    return decision, message


@app.get("/")
@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "leave_approval"}


@app.post("/request-leave", response_model=LeaveResponse)
@app.post("/query", response_model=LeaveResponse)
@app.post("/complete", response_model=LeaveResponse)
async def handle_leave_request(req: LeaveRequest):
    # Extract query text from either 'query' field or 'messages' array
    prompt = req.query
    if not prompt and req.messages:
        for m in reversed(req.messages):
            if m.get("role") in ("user", "human"):
                prompt = m.get("content", "")
                break
        if not prompt and req.messages:
            prompt = req.messages[-1].get("content", "")

    leave_days = req.leave_days

    # 1. Information Extraction via LLM / Fallback
    if leave_days is None:
        if prompt:
            leave_days = await extract_leave_days_llm(prompt)
            if leave_days is None:
                leave_days = fallback_extract_days(prompt)

    # 2. Validation
    if leave_days is None or leave_days <= 0:
        logger.warning(f"Leave extraction failed for prompt: '{prompt}'")
        return LeaveResponse(
            status="error",
            service="leave_approval",
            error="Could not determine the requested number of leave days"
        )

    # 3. Deterministic Business Rules
    decision, message = evaluate_leave_rules(leave_days)

    content_summary = (
        f"[Leave Approval Desk: Decision]\n"
        f"Requested Days: {leave_days}\n"
        f"Decision: {decision}\n"
        f"Verdict Message: {message}"
    )

    return LeaveResponse(
        status="success",
        service="leave_approval",
        data=LeaveDecisionData(
            leave_days=leave_days,
            decision=decision,
            message=message
        ),
        content=content_summary
    )
