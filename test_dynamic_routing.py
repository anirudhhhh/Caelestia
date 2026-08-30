"""
ControlPlane.ai — Verification Test for Dynamic Per-Message Semantic Routing
Ensures that subsequent messages in a session are dynamically vector-routed
and NEVER stuck to previous workflow services (e.g. Weather -> General Query).
"""

import uuid
import httpx
import json

GATEWAY_URL = "http://localhost:8000/v1/chat/completions"

GREEN = "\033[92m"
RED = "\033[91m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

def run():
    client = httpx.Client(timeout=20.0)
    session_id = str(uuid.uuid4())
    print(f"\n{CYAN}{'='*80}{RESET}")
    print(f"{CYAN}{BOLD}🎯 VERIFYING PER-TURN DYNAMIC SEMANTIC ROUTING (ZERO SESSION STICKINESS){RESET}")
    print(f"{CYAN}{'='*80}{RESET}\n")

    turns = [
        ("Turn 1 (Weather)", "What is the weather in Boston right now?", "Weather Service"),
        ("Turn 2 (Accenture Question)", "how many people work in accenture?", "General Query Service"),
        ("Turn 3 (Email)", "Send an email to rahul@company.com that the deadline is extended", "Email Service"),
        ("Turn 4 (Leave Request)", "I need 4 days off next week for personal work", "Leave Approval Service"),
        ("Turn 5 (General Question)", "tell me about quantum computing", "General Query Service"),
    ]

    for label, prompt, expected_wf in turns:
        payload = {
            "messages": [{"role": "user", "content": prompt}],
            "session_id": session_id,
            "model": "auto"
        }
        resp = client.post(GATEWAY_URL, json=payload).json()
        wf = resp.get("workflow", "")
        content = resp.get("content", "")
        action = resp.get("decision", {}).get("action", "")

        is_ok = (expected_wf.lower() in wf.lower() or wf.lower() in expected_wf.lower())
        mark = f"{GREEN}[PASS]{RESET}" if is_ok else f"{RED}[FAIL]{RESET}"
        print(f"{mark} {BOLD}{label:<30}{RESET} -> Routed to: {BOLD}{wf}{RESET} (Action: {action.upper()})")
        print(f"       Preview: {content[:80].replace(chr(10), ' ')}...")
        assert is_ok, f"Expected {expected_wf}, got {wf}"

    print(f"\n{GREEN}{BOLD}✅ MULTI-TURN DYNAMIC ROUTING VERIFIED: Each turn was dynamically routed to the correct service!{RESET}\n")

if __name__ == "__main__":
    run()
