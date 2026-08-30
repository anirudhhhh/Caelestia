"""
ControlPlane.ai — End-to-End Verification Test for 4 PRD AI Workflow Services
Tests both direct microservice endpoints and intelligent routing via the API Gateway Load Balancer.
"""

import time
import httpx
import json

GREEN = "\033[92m"
RED = "\033[91m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
BOLD = "\033[1m"
RESET = "\033[0m"

DIRECT_TESTS = [
    {
        "name": "General Query (Direct)",
        "url": "http://localhost:8021/query",
        "payload": {"query": "Explain recursion with a brief example."},
        "expected_status": "success",
        "expected_service": "general_query"
    },
    {
        "name": "Email Service (Direct)",
        "url": "http://localhost:8022/query",
        "payload": {"query": "Send an email to john@example.com saying the meeting is at 4 PM."},
        "expected_status": "success",
        "expected_service": "email",
        "expected_recipient": "john@example.com"
    },
    {
        "name": "Email Service - Missing Recipient (Direct)",
        "url": "http://localhost:8022/query",
        "payload": {"query": "Send an email saying hello to everyone."},
        "expected_status": "error",
        "expected_service": "email"
    },
    {
        "name": "Leave Approval - Auto Approved (Direct)",
        "url": "http://localhost:8023/query",
        "payload": {"query": "I need leave for 2 days."},
        "expected_status": "success",
        "expected_decision": "AUTO_APPROVED"
    },
    {
        "name": "Leave Approval - Manager Approval (Direct)",
        "url": "http://localhost:8023/query",
        "payload": {"query": "I want leave from September 2 to September 5."},
        "expected_status": "success",
        "expected_decision": "MANAGER_APPROVAL_REQUIRED"
    },
    {
        "name": "Leave Approval - Rejected (Direct)",
        "url": "http://localhost:8023/query",
        "payload": {"query": "I need leave for 9 days next month."},
        "expected_status": "success",
        "expected_decision": "REJECTED"
    },
    {
        "name": "Weather Service - Boston (Direct)",
        "url": "http://localhost:8024/query",
        "payload": {"query": "What's the weather in Boston right now?"},
        "expected_status": "success",
        "expected_service": "weather"
    }
]

ROUTED_GATEWAY_TESTS = [
    {
        "name": "Gateway Router -> General Query",
        "payload": {
            "messages": [{"role": "user", "content": "What is quantum computing?"}],
            "use_case": "general_query",
            "geography": "US"
        },
        "expected_workflow": "General Query Service"
    },
    {
        "name": "Gateway Router -> Email Service",
        "payload": {
            "messages": [{"role": "user", "content": "Send an email to rahul@company.com that the project deadline has been extended"}],
            "use_case": "email_service",
            "geography": "US"
        },
        "expected_workflow": "Email Service"
    },
    {
        "name": "Gateway Router -> Email Service (Missing Recipient)",
        "payload": {
            "messages": [{"role": "user", "content": "Send an email saying that the meeting has been cancelled"}],
            "use_case": "email_service",
            "geography": "US"
        },
        "expected_workflow": "Email Service",
        "expected_substring": "Recipient email could not be identified"
    },
    {
        "name": "Gateway Router -> Leave Approval (4 Days)",
        "payload": {
            "messages": [{"role": "user", "content": "Can I take 4 days off next week for personal work?"}],
            "use_case": "leave_approval",
            "geography": "US"
        },
        "expected_workflow": "Leave Approval Service"
    },
    {
        "name": "Gateway Router -> Weather Service",
        "payload": {
            "messages": [{"role": "user", "content": "Tell me the current temperature in New York right now."}],
            "use_case": "weather_service",
            "geography": "US"
        },
        "expected_workflow": "Weather Service"
    }
]


def run_tests():
    print(f"\n{CYAN}{'='*80}{RESET}")
    print(f"{CYAN}{BOLD}🎯 VERIFYING 4 PRD AI WORKFLOW SERVICES (DIRECT & ROUTED){RESET}")
    print(f"{CYAN}{'='*80}{RESET}\n")

    client = httpx.Client(timeout=25.0)
    passed = 0
    total = len(DIRECT_TESTS) + len(ROUTED_GATEWAY_TESTS)

    print(f"{YELLOW}{BOLD}--- Phase 1: Direct Component Service APIs ---{RESET}")
    for test in DIRECT_TESTS:
        name = test["name"]
        url = test["url"]
        payload = test["payload"]
        try:
            resp = client.post(url, json=payload)
            data = resp.json()
            status = data.get("status")

            is_ok = (status == test.get("expected_status"))
            if is_ok and "expected_decision" in test:
                is_ok = (data.get("data", {}).get("decision") == test["expected_decision"])
            if is_ok and "expected_recipient" in test:
                is_ok = (data.get("recipient") == test["expected_recipient"])

            if is_ok:
                passed += 1
                print(f"{GREEN}[PASS]{RESET} {BOLD}{name:<45}{RESET} -> Status: {status}")
                if "data" in data:
                    print(f"       Data: {json.dumps(data['data'])}")
                elif "message" in data:
                    print(f"       Msg:  {data['message']} (Recipient: {data.get('recipient')})")
                elif "response" in data:
                    print(f"       Resp: {data['response'][:75]}...")
                elif "error" in data:
                    print(f"       Expected Error: {data['error']}")
            else:
                print(f"{RED}[FAIL]{RESET} {BOLD}{name:<45}{RESET} -> Got: {data}")

        except Exception as e:
            print(f"{RED}[ERR] {name:<45} -> Connection error: {e}{RESET}")

    print(f"\n{YELLOW}{BOLD}--- Phase 2: End-to-End Gateway Vector Semantic Routing ---{RESET}")
    for test in ROUTED_GATEWAY_TESTS:
        name = test["name"]
        payload = test["payload"]
        try:
            resp = client.post("http://localhost:8000/v1/chat/completions", json=payload)
            data = resp.json()
            wf = data.get("workflow", "")
            action = data.get("decision", {}).get("action", "")

            is_ok = (test["expected_workflow"].lower() in wf.lower() or wf.lower() in test["expected_workflow"].lower()) and action in ("allow", "flag")
            if is_ok and "expected_substring" in test:
                is_ok = (test["expected_substring"].lower() in (data.get("content") or "").lower())
            if is_ok:
                passed += 1
                print(f"{GREEN}[PASS]{RESET} {BOLD}{name:<45}{RESET} -> Routed: {wf} (Action: {action.upper()})")
                content_preview = (data.get("content") or "")[:80].replace("\n", " ")
                print(f"       Output Preview: {content_preview}...")
            else:
                print(f"{RED}[FAIL]{RESET} {BOLD}{name:<45}{RESET} -> Expected: {test['expected_workflow']} | Got: {wf} (Action: {action})")
                print(f"       Response: {json.dumps(data, indent=2)[:200]}")

        except Exception as e:
            print(f"{RED}[ERR] {name:<45} -> Gateway error: {e}{RESET}")

    print(f"\n{CYAN}{'-'*80}{RESET}")
    if passed == total:
        print(f"{GREEN}{BOLD}✅ ALL {passed}/{total} WORKFLOW SCENARIOS PASSED WITH 100% SUCCESS!{RESET}")
    else:
        print(f"{YELLOW}⚠  {passed}/{total} scenarios passed.{RESET}")
    print(f"{CYAN}{'='*80}{RESET}\n")


if __name__ == "__main__":
    run_tests()
