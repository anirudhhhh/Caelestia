# PRD — Component 07: Policy & Governance Engine

## Purpose
The actual "brain" of ControlPlane: takes the accumulated `checks[]` from Input/Output Guards and turns them into one governed decision — allow, edit, flag-for-review, block, or escalate — using configuration that varies by use case, geography, and risk appetite, with every decision traceable to the exact policy version that produced it. This is the direct implementation of the brief's "decision logic" and "governance" solutioning areas, and it's the component that makes the whole system *configurable* rather than hardcoded (which the brief specifically warns ages badly as regulations evolve).

## Connections
- **Called by:** Input Guard (04), Output Guard (05) — synchronously, in the request path.
- **Called by:** AI Immune & Audit System (08) — asynchronously, to propose/apply threshold adjustments from the feedback loop.
- **Calls:** Human Review Console (09) — to open an escalation.
- **Writes to:** Audit & Feedback Store (10) — every decision, with policy version.

## Tech stack
- Plain Python service (FastAPI) — deliberately **not** a heavyweight rules engine (e.g., not Drools/OPA) for the hackathon; a well-structured YAML-driven decision table plus a thin evaluator is enough to demonstrate configurability and is far easier to explain live to judges. (Mention Open Policy Agent/Rego as the production-grade evolution path in the deck, without building it now.)
- Config store: versioned YAML files checked into git for the demo (each change is a commit = an audit-friendly version), loaded into Postgres at deploy time for runtime lookup + fast diffing between versions.

## Implementation
1. Config schema, one row per `(use_case, geography, risk_tier, check_name)`:
   ```yaml
   - use_case: customer_support
     geography: US
     check: prompt_injection
     block_threshold: 0.85
     flag_threshold: 0.5
     on_timeout: allow_with_flag
   - use_case: decision_support
     geography: EU
     check: hallucination_risk
     block_threshold: 0.6
     flag_threshold: 0.3
     on_timeout: block
   ```
2. `POST /decide` takes the envelope's `checks[]` + `use_case` + `geography` → for each check, look up its thresholds, compute a verdict; combine per-check verdicts into one `risk.tier` and `decision.action` using a documented precedence rule (e.g., any single `block`-level check forces `block` regardless of others; multiple `flag`-level checks compound into `escalate` even if none individually crosses block).
3. Attach `decision.policy_version` = the config version hash used, so every decision is reproducible against the exact rules in force at the time — this is what answers "why was this decision made six weeks ago" for a compliance stakeholder.
4. On `escalate`: call Human Review Console (09) with the envelope and wait (async, non-blocking for the calling Guard beyond its latency budget — for real-time use cases, "escalate" means "respond with a safe holding message now, resolve asynchronously," not "block the response until a human replies").
5. Expose `POST /threshold-proposal` for the Immune & Audit System (08) to submit data-backed threshold change suggestions; changes are staged, never auto-applied — a human (config owner) approves via a simple diff view before a new policy version goes live. This keeps the feedback loop real without letting an automated system silently change what gets blocked.

## Structure
```
policy_engine/
  config/
    policies/                 # versioned YAML, one file per use_case/geography
  evaluator.py                # threshold lookup + precedence logic
  service.py
  clients/
    human_review_client.py
  tests/
    test_precedence_rules.py
    test_policy_version_reproducibility.py
```

## Non-functional requirements
- Decision latency < 10 ms P95 (pure lookup + arithmetic, no model calls) — this must never be the bottleneck.
- Config reload without service restart (watch the config directory or poll Postgres) so policy changes can be demoed live.

## Metrics emitted
`decisions_total{use_case, geography, action}`, `policy_version_active{use_case}`, `escalations_total{use_case, reason}`.

## Failure modes
- Unknown `use_case`/`geography` combination → default to the most conservative policy on file (block/escalate), never "allow by default" for unconfigured traffic.

## Security & compliance
- Policy config changes themselves should be attributable (who changed which threshold, when) — store as git history or a Postgres audit table with `changed_by`.

## Build priority
**P0.** This is the component that makes the system a *governed* checker rather than a pile of independent detectors — prioritize it right after the Gateway and one Guard.

## Assumptions
- For the demo, 2–3 `use_case`/`geography` combinations with visibly different thresholds is enough to prove configurability — you don't need the full regulatory matrix built out.
