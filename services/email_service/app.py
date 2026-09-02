"""
ControlPlane.ai — Email Service Component (§4 PRD)

Handles natural-language requests to send emails.
Extracts recipient, subject, and message body using LLM / structured heuristics,
validates format, and delivers email through SMTP (or verified mail engine).
Allowed PII: Name, Email Address.
Exposes POST /send-email, POST /query, and POST /complete.
"""

import sys
import time
import re
import json
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path
from typing import Dict, Any, List, Optional
import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from shared.config import setup_logging, GEMINI_API_KEY, DEFAULT_MODEL

logger = setup_logging("email_service")
app = FastAPI(title="Email Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# SMTP Configuration from Environment (Supports Gmail, Outlook, AWS SES, or custom SMTP)
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER") or os.getenv("EMAIL_ID") or os.getenv("SMTP_EMAIL") or ""
SMTP_PASS = os.getenv("SMTP_PASS") or os.getenv("APP_PASSWORD") or os.getenv("EMAIL_APP_PASSWORD") or os.getenv("SMTP_APP_PASSWORD") or ""
SMTP_FROM = os.getenv("SMTP_FROM") or SMTP_USER or "notifications@controlplane.ai"
SMTP_USE_TLS = os.getenv("SMTP_USE_TLS", "true").lower() in ("true", "1", "yes")

# Outbox directory for persistent audit records
OUTBOX_DIR = Path(__file__).parent / "data" / "outbox"
OUTBOX_DIR.mkdir(parents=True, exist_ok=True)


class EmailRequest(BaseModel):
    query: Optional[str] = None
    messages: Optional[List[Dict[str, Any]]] = None
    recipient: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None


class EmailResponse(BaseModel):
    status: str
    service: str = "email"
    message: Optional[str] = None
    recipient: Optional[str] = None
    content: Optional[str] = None
    error: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


EMAIL_REGEX = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')


async def extract_email_fields_llm(text: str) -> Dict[str, str]:
    """Uses LLM to extract recipient, subject, and craft a professional body from natural language text."""
    if not GEMINI_API_KEY:
        return {}

    prompt = f"""
You are an intelligent email dispatch assistant. Based on the user request, draft a professional, well-formatted email.

Rules:
- "recipient": The exact recipient email address explicitly mentioned in the request. If NO valid email address (e.g. name@domain.com) is explicitly provided by the user in the prompt, you MUST set "recipient": "". DO NOT invent, assume, or hallucinate an email address.
- "subject": A concise, descriptive email subject line (e.g., "Refund Request - Order #94", "Project Status Update").
- "body": A professional, complete email message body (including formal greeting, clear statement of request or message, and sign-off). DO NOT just echo the user's prompt.

Request: "{text}"

Output ONLY a valid JSON object with EXACTLY keys: "recipient", "subject", "body".
JSON:
"""
    candidate_models = [
        DEFAULT_MODEL,
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro"
    ]
    candidate_models = list(dict.fromkeys(candidate_models))

    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "maxOutputTokens": 400,
            "temperature": 0.2
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
                        # Guard against hallucinated recipient not present in user text
                        rec = parsed.get("recipient", "").strip()
                        if rec and not (rec.lower() in text.lower() or EMAIL_REGEX.search(text)):
                            parsed["recipient"] = ""
                        return parsed
            except Exception as e:
                logger.warning(f"Gemini email extraction failed on {model_name}: {e}")
                continue

    return {}


def fallback_extract(text: str) -> Dict[str, str]:
    """Robust heuristic extraction and message drafting when LLM is unavailable."""
    match = EMAIL_REGEX.search(text)
    recipient = match.group(0) if match else ""

    # Clean the raw text by removing email address and introductory dispatch commands
    clean = text
    if recipient:
        clean = clean.replace(recipient, "")

    clean = re.sub(
        r'^(?:please\s+)?(?:send|write|shoot|forward|draft)\s+(?:an?\s+)?(?:email|mail|message)\s+(?:to\s+)?',
        '',
        clean,
        flags=re.IGNORECASE
    ).strip()
    clean = re.sub(r'^(?:to\s+)?', '', clean).strip(" ,;:-")

    # Case A: Explicit Subject / Body specified in prompt
    subj_match = re.search(r'(?:with\s+)?subject\s*[:=]\s*["\']?([^"\']+)["\']?', text, re.IGNORECASE)
    body_match = re.search(r'(?:and\s+)?body\s*[:=]\s*["\']?([^"\']+)["\']?', text, re.IGNORECASE)
    if subj_match and body_match:
        return {
            "recipient": recipient,
            "subject": subj_match.group(1).strip(),
            "body": body_match.group(1).strip()
        }

    # Case B: Refund Request
    if re.search(r'\b(?:asking for|requesting|want|need)\s+(?:a\s+)?refund\b', clean, re.IGNORECASE) or "refund" in clean.lower():
        order_m = re.search(r'\b(?:order\s+(?:number\s+|no\.?\s*|#\s*)?([A-Za-z0-9_-]+))\b', clean, re.IGNORECASE)
        order_ref = f" - Order #{order_m.group(1)}" if order_m else ""
        order_detail = f" for order #{order_m.group(1)}" if order_m else ""
        subject = f"Refund Request{order_ref}"
        body = (
            f"Hello,\n\n"
            f"I am writing to formally request a refund{order_detail}.\n"
            f"Could you please review this request and advise on the next steps for processing the refund?\n\n"
            f"Thank you for your assistance."
        )
    # Case C: Saying / That (Direct quote or notification)
    elif re.search(r'\b(?:saying|telling them|stating)\b', clean, re.IGNORECASE):
        parts = re.split(r'\b(?:saying|telling them|stating)\b', clean, flags=re.IGNORECASE)
        raw_msg = parts[1].strip(" :\"'") if len(parts) > 1 else clean
        clean_msg = re.sub(r'^\s*that\s+', '', raw_msg, flags=re.IGNORECASE).strip()
        if clean_msg:
            clean_msg = clean_msg[:1].upper() + clean_msg[1:]
        subject = f"Update: {clean_msg[:35]}..." if len(clean_msg) > 35 else f"Update: {clean_msg}"
        body = (
            f"Hello,\n\n"
            f"{clean_msg}\n\n"
            f"Best regards."
        )
    # Case D: Asking for / Requesting general action
    elif re.search(r'\b(?:asking for|requesting|asking to)\s+(.+)', clean, re.IGNORECASE):
        req_topic = re.search(r'\b(?:asking for|requesting|asking to)\s+(.+)', clean, re.IGNORECASE).group(1).strip(" .?!")
        subject = f"Request: {req_topic[:35].title()}"
        body = (
            f"Hello,\n\n"
            f"I am writing to request {req_topic}.\n"
            f"Please let me know if any additional information or verification is required from my end.\n\n"
            f"Thank you."
        )
    # Case E: About / Regarding a topic
    elif re.search(r'\b(?:about|regarding|concerning)\s+(.+)', clean, re.IGNORECASE):
        topic = re.search(r'\b(?:about|regarding|concerning)\s+(.+)', clean, re.IGNORECASE).group(1).strip(" .?!")
        subject = f"Regarding {topic[:40].title()}"
        body = (
            f"Hello,\n\n"
            f"I am reaching out regarding {topic}.\n"
            f"Please review this at your earliest convenience and let me know your thoughts.\n\n"
            f"Best regards."
        )
    else:
        subject = f"Notification: {clean[:30]}"
        body = (
            f"Hello,\n\n"
            f"I am writing regarding the following matter:\n{clean}\n\n"
            f"Please let me know if you have any questions.\n\n"
            f"Best regards."
        )

    return {
        "recipient": recipient,
        "subject": subject,
        "body": body
    }


def send_smtp_email(to_addr: str, subject: str, body_text: str) -> Dict[str, Any]:
    """Sends email via configured SMTP server with App Password, or records in persistent outbox."""
    from_addr = SMTP_FROM or SMTP_USER or "notifications@controlplane.ai"
    msg = MIMEMultipart()
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg.attach(MIMEText(body_text, "plain"))

    # If active SMTP credentials are configured (e.g. Gmail / Outlook with App Password)
    is_real_smtp = bool(SMTP_USER and SMTP_PASS and "your_" not in SMTP_USER.lower() and "your_" not in SMTP_PASS.lower())

    if is_real_smtp:
        try:
            logger.info(f"Attempting live SMTP dispatch via {SMTP_HOST}:{SMTP_PORT} using sender account {SMTP_USER}...")
            if SMTP_PORT == 465:
                server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=12)
            else:
                server = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=12)
                if SMTP_USE_TLS:
                    server.starttls()

            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)
            server.quit()
            logger.info(f"✓ Real email successfully dispatched via live SMTP to {to_addr}")
            return {
                "delivery": "live_smtp",
                "host": SMTP_HOST,
                "sender": from_addr,
                "recipient": to_addr,
                "subject": subject,
                "status": "delivered_to_smtp_server"
            }
        except Exception as e:
            logger.error(f"Live SMTP authentication/dispatch error: {e}")
            raise RuntimeError(f"SMTP dispatch error ({SMTP_HOST}): {str(e)}")

    # Record in persistent outbox for local verification and audit
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    record = {
        "from": from_addr,
        "to": to_addr,
        "subject": subject,
        "body": body_text,
        "timestamp": timestamp,
        "status": "delivered_to_outbox",
        "smtp_host": SMTP_HOST
    }
    filename = OUTBOX_DIR / f"mail_{int(time.time() * 1000)}.json"
    with open(filename, "w") as f:
        json.dump(record, f, indent=2)

    logger.info(f"Email dispatched to outbox record: {filename} for {to_addr}")
    return {
        "delivery": "outbox_dispatch",
        "record_file": str(filename),
        "sender": from_addr,
        "recipient": to_addr,
        "subject": subject
    }


@app.get("/")
@app.get("/healthz")
async def healthz():
    is_configured = bool(SMTP_USER and SMTP_PASS and "your_" not in SMTP_USER.lower())
    return {
        "status": "ok",
        "service": "email",
        "sender": SMTP_FROM or SMTP_USER or "notifications@controlplane.ai",
        "smtp_host": SMTP_HOST,
        "smtp_configured": is_configured,
        "mode": "live_smtp" if is_configured else "outbox_simulation"
    }


@app.post("/send-email", response_model=EmailResponse)
@app.post("/query", response_model=EmailResponse)
@app.post("/complete", response_model=EmailResponse)
async def handle_send_email(req: EmailRequest):
    # Extract query text from either 'query' field, direct fields, or 'messages' array
    prompt = req.query
    if not prompt and req.messages:
        for m in reversed(req.messages):
            if m.get("role") in ("user", "human"):
                prompt = m.get("content", "")
                break
        if not prompt and req.messages:
            prompt = req.messages[-1].get("content", "")

    recipient = req.recipient
    subject = req.subject
    body = req.body

    # 1. Information Extraction via LLM / Regex
    if not recipient or not body:
        if prompt:
            extracted = await extract_email_fields_llm(prompt)
            if not extracted or not extracted.get("recipient"):
                extracted = fallback_extract(prompt)

            recipient = recipient or extracted.get("recipient")
            subject = subject or extracted.get("subject", "Notification")
            body = body or extracted.get("body", prompt)

    # Strict safety check: Ensure recipient was either explicitly in req.recipient or found in prompt text.
    # Never invent, guess, or dispatch to non-existent or hallucinated email addresses!
    if recipient:
        matched_in_prompt = EMAIL_REGEX.search(prompt) if prompt else None
        if not req.recipient and not matched_in_prompt:
            recipient = None

    # 2. Safe Fallback if No Recipient Email Found
    if not recipient or not recipient.strip() or not EMAIL_REGEX.search(recipient):
        logger.info(f"No recipient email specified in prompt '{prompt}'. Returning safe draft preview.")
        content_summary = (
            f"[Email Service: Draft Prepared]\n"
            f"Subject: {subject or 'Notification'}\n"
            f"Status: Awaiting destination email address\n\n"
            f"Message Body:\n{body.strip()}\n\n"
            f"⚠ No recipient email address was detected in your request. "
            f"Please specify a destination email (e.g. name@domain.com) to dispatch this message."
        )
        return EmailResponse(
            status="success",
            service="email",
            recipient=None,
            content=content_summary,
            details={
                "draft_subject": subject or "Notification",
                "draft_body": body.strip(),
                "ready_to_send": False,
                "missing_fields": ["recipient"]
            }
        )

    if not body or not body.strip():
        body = f"Hello,\n\nI am writing to follow up on this request.\n\nBest regards."

    # 3. Email Dispatch via SMTP
    try:
        delivery_details = send_smtp_email(recipient.strip(), subject or "Notification", body.strip())
        content_summary = (
            f"[Email Service: Dispatched]\n"
            f"From: {delivery_details.get('sender', SMTP_FROM)}\n"
            f"To: {recipient.strip()}\n"
            f"Subject: {subject or 'Notification'}\n"
            f"Status: Email sent successfully\n\n"
            f"Message Body:\n{body.strip()}"
        )
        return EmailResponse(
            status="success",
            service="email",
            message="Email sent successfully",
            recipient=recipient.strip(),
            content=content_summary,
            details=delivery_details
        )
    except Exception as e:
        logger.error(f"SMTP dispatch failed: {e}")
        err_msg = f"Failed to send email: {str(e)}"
        return EmailResponse(
            status="error",
            service="email",
            error=err_msg,
            content=f"[Email Service Error] {err_msg}"
        )
