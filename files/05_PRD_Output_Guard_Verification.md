# PRD — Component 05: AI Firewall — Output Guard & Verification

## Purpose
The hardest and most differentiating component: catch a model response that is confidently wrong (hallucination), leaks the system prompt or other sensitive internal data, is unsafe/off-brand, or leaks PII the model itself introduced (e.g., fabricating a person's SSN). The brief is explicit that "there is often no reliable, real-time ground truth" — this PRD treats that as the central design constraint rather than assuming a solved detector exists.

## Connections
- **Upstream:** Model Adapter Layer (03) hands off the raw model response.
- **Calls:** PII / Entity Detection Service (06); an "AI-as-judge" model call (via the same Model Adapter/Router, tagged as an internal system call so it doesn't recurse into the Firewall itself); optionally a retrieval verification store if the use case has reference documents (e.g., internal knowledge assistant grounded in a document set).
- **Calls:** Policy & Governance Engine (07) with results.
- **Writes to:** Audit & Feedback Store (10).

## Tech stack
- `llm-guard` output scanners: `NoRefusal`, `Sensitive` (secondary PII/secret pass), `Toxicity`, `MaliciousURLs`, `FactualConsistency`/`Relevance` scanners as a first pass.
- **Retrieval verification** (when the use case has a document corpus — internal knowledge assistant, decision support): embed the response's factual claims and check entailment/similarity against retrieved source chunks (`sentence-transformers` + the same vector store used for RAG, or a lightweight NLI model like `cross-encoder/nli-deberta-v3` for entailment scoring) — this only works where ground truth documents exist, which the brief acknowledges is not always the case.
- **AI-as-judge**: a second, cheaper/faster model call with a structured prompt asking it to rate the response's groundedness, coherence with the conversation, and likely-fabrication risk on a defined rubric, returning structured JSON (use function-calling/structured output, not free text, so the score is machine-parseable).
- Combine judge + retrieval + heuristic scanners into a single `hallucination_risk` composite score rather than treating any one signal as ground truth — this directly addresses "no reliable ground truth" by using **triangulation instead of verification**.

## Implementation
1. Receive envelope (`direction=output`) with the raw model response.
2. Run in parallel: `llm-guard` output scanners, PII scan (via 06), system-prompt-leakage check (a scanner that checks for verbatim/near-verbatim substrings of the known system prompt appearing in the output — simple and effective).
3. If a document corpus exists for this `use_case`: run retrieval verification; else skip and rely on judge + heuristics only, explicitly noting `retrieval_verification: "not_applicable"` in the envelope (never silently treat "no corpus" the same as "verified clean").
4. Run AI-as-judge only for `medium`/`high` risk tiers or when heuristic scanners are inconclusive — it's the most expensive check, reserve it accordingly (this is the "lightweight checks for routine requests, deeper verification only when needed" mechanism from the brief).
5. Combine signals into `hallucination_risk` and pass full `checks[]` to Policy Engine for the actual allow/edit/flag/block/escalate decision.
6. For multi-turn/agentic sessions, also evaluate against the **conversation so far** (pull recent turns from the Audit Store by `session_id`), since a single turn can look fine in isolation but compound risk across turns — this directly addresses the brief's "multi-turn conversations... introduce compounding risk" point.

## Structure
```
output_guard/
  scanners/
    system_prompt_leakage.py
    heuristic_output_scanners.py     # wraps llm-guard output scanners
  verification/
    retrieval_verify.py
    judge_prompt.py                   # structured-output judge prompt + schema
  clients/
    pii_client.py
    policy_client.py
    session_history_client.py
  fixtures/
    known_hallucination_pairs.jsonl   # for precision/recall demo
  tests/
    test_judge_output_schema.py
```

## Non-functional requirements
- Output budget per flow doc §5 (80/250/3000 ms by use case) — the judge-model call is the long pole; only invoke it within budget for use cases that can afford it (decision-support), and rely on heuristics-only for real-time customer-facing traffic, explicitly trading recall for latency there (state this tradeoff in the demo — it's exactly the "deliberately tuned, not solved away" tradeoff the brief asks about).

## Metrics emitted
`output_checks_total{check_name, verdict}`, `hallucination_risk_score` (histogram), `judge_invocations_total{use_case}`, `retrieval_verification_coverage_ratio` (fraction of responses where a corpus was even available to check against — an honest metric to show a skeptical stakeholder).

## Failure modes
- Judge model itself unavailable → fall back to heuristics-only, flag the response's confidence as lower rather than pretending full coverage occurred.

## Build priority
**P0** for heuristic scanners + PII; judge/retrieval verification is the strongest **P1** technical-novelty piece — even a simplified version (one hallucination example caught live) is a strong demo moment.

## Assumptions
- You'll construct a small labeled set of known-hallucinated vs. known-accurate responses ahead of the demo to report precision/recall honestly rather than claiming an unverified accuracy number.
