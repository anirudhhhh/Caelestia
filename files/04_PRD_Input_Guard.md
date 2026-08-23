# PRD — Component 04: AI Firewall — Input Guard

## Purpose
Scan every inbound user/application message before it reaches a model: prompt injection, jailbreak attempts, toxicity, PII, and other harmful payloads. This is the request-side half of the "AI FIREWALL" box in the Round‑1 diagram.

## Connections
- **Upstream:** API Gateway (01) calls this synchronously, in the request's critical path.
- **Calls:** PII / Entity Detection Service (06) for PII-specific scanning (shared with Output Guard rather than duplicated).
- **Calls:** Policy & Governance Engine (07) with `checks[]` results to get back a `decision`.
- **Writes to:** Audit & Feedback Store (10), fire-and-forget.

## Tech stack
- **`llm-guard`** (Python, actively maintained, ProtectAI) as the primary scanner library — it ships input scanners for prompt injection, jailbreak, toxicity, secrets, and topic/ban-substring filtering, each returning a score and pass/fail, which maps directly onto the envelope's `checks[]` shape.
- FastAPI microservice wrapping the scanners so they can run independently of the Gateway process and be scaled separately (scanning is more CPU/GPU-bound than the Gateway itself).
- Optional: a small fine-tuned/prompted classifier (using a fast, cheap model) as a secondary jailbreak detector for prompts that pass `llm-guard`'s heuristics but look suspicious by an LLM-as-judge pass — reserved for `medium`/`high` risk tiers only, to protect latency budgets on low-risk traffic.

## Implementation
1. Receive envelope (`direction=input`).
2. Run scanners **in parallel** (asyncio.gather), each respecting an individual timeout drawn from the use case's Input Guard latency slice (flow doc §5):
   - `prompt_injection` (llm-guard `PromptInjection`)
   - `toxicity` (llm-guard `Toxicity`)
   - `secrets`/`ban_substrings` (llm-guard) — catches attempts to smuggle credentials or known-bad strings
   - `pii` — delegate to component 06, don't reimplement
3. Append each result to `checks[]` with `engine`, `engine_version`, `score`, `verdict`, `latency_ms`.
4. Call Policy Engine (07) with the accumulated checks + `use_case` + `risk_tier` (initial guess); receive back `decision`.
5. If `decision.action == edit`: apply the specific edit (e.g., PII redaction spans from component 06) to `payload.content` before forwarding.
6. Never make the allow/block/escalate call itself — that's the Policy Engine's job; this component only detects and reports.

## Structure
```
input_guard/
  scanners/
    prompt_injection.py
    toxicity.py
    secrets.py
  service.py                  # FastAPI app
  clients/
    pii_client.py
    policy_client.py
  fixtures/                   # labeled adversarial prompt set for testing
    injection_examples.jsonl
    toxic_examples.jsonl
  tests/
    test_scanner_precision_recall.py
```

## Non-functional requirements
- Per flow doc §5: 60 ms budget for customer-facing traffic, 150 ms for internal copilot, 500 ms for decision-support — scanners must be individually timeoutable so a slow scanner doesn't blow the whole budget; a scanner that times out reports `verdict: "skipped"`, not `"pass"`.
- Horizontally scalable/stateless; scanner models loaded once at startup, not per request.

## Metrics emitted
`input_checks_total{check_name, verdict}`, `input_check_latency_ms{check_name}`, `input_blocked_total{use_case, reason}`.

## Failure modes
- Scanner crash → `verdict: "skipped"` + alert to Immune System (08); Policy Engine's per-use-case config decides whether a skipped safety check blocks or allows (default: block for `high` risk tier, allow-with-flag for `low`).

## Security & compliance
- Raw prompt text should not be logged in plaintext application logs — only the Audit Store (10), which has its own access controls, holds full envelope content; service-level logs should log `interaction_id` and verdicts only.

## Build priority
**P0.**

## Assumptions
- The bias/hallucination detection called out in the brief is largely an **output-side** concern (component 05) since bias in a *user's input* is a toxicity/harassment problem, already covered here; don't duplicate hallucination scanning on the input side.
