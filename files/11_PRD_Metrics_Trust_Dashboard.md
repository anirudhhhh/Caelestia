# PRD — Component 11: Metrics & Trust Dashboard

## Purpose
Answer the brief's explicit question — "how would you define, measure, and report false positive/negative rates and overall system trustworthiness to a skeptical stakeholder" — with an actual screen, not a claim. This is also the component most likely to win over judges quickly, since it makes the whole system's value legible in one glance.

## Connections
- **Reads from:** Prometheus (live operational metrics from every component), Audit & Feedback Store (10, for historical/labeled data), AI Immune & Audit System (08, for anomaly history).

## Tech stack
- **Grafana** on top of the existing Prometheus instance for the operational half (latency, throughput, block rates, model health) — fastest path to a credible-looking live dashboard, minimal custom code.
- A small custom **React** page for the "trust" half that Grafana can't express well: false positive/negative rate (computed from `human_outcomes.was_original_flag_correct`), per-use-case risk breakdown, and a plain-language "what changed since last week" summary — this is the part worth hand-building since it's your narrative, not generic infra monitoring.

## Implementation
1. Grafana panels (operational): requests/min by use case, P50/P95 latency by stage (gateway/guard/model), block/flag/escalate rate over time, cost (tokens) by model, per-model health/error rate.
2. Custom trust page, backed by a small FastAPI read endpoint querying the Audit Store:
   - **False positive rate** = `human_outcomes` where `action=approve` (human overturned a flag) ÷ total flagged.
   - **False negative rate** = a *sampled* metric — periodically (or on judge request) sample a set of `allow` decisions for manual spot-review, since by definition you don't automatically know what you missed; report this explicitly as a *sampled estimate*, not a hard number — overstating precision here is exactly the kind of overconfidence the whole product is meant to prevent.
   - **Trust score** — a simple, explainable weighted composite (e.g., `1 - (weighted FP rate + weighted FN estimate)`) per use case, trended over time, with the weighting formula shown on-screen rather than hidden — explainability of the metric itself matters as much as the metric.
3. A "coverage" indicator: percentage of responses where retrieval verification was actually applicable (from component 05's `retrieval_verification_coverage_ratio`) — showing the limits of your own system honestly is a credibility signal to a skeptical stakeholder, not a weakness to hide.

## Structure
```
dashboard/
  grafana/
    provisioning/dashboards/controlplane.json
  trust_api/
    routes/metrics.py
  frontend/
    src/pages/TrustDashboard.tsx
  tests/
    test_fp_fn_calculation.py
```

## Non-functional requirements
- Dashboard queries must not hit the live request path — read replicas or simply query the Audit Store's read API, never the Gateway.

## Metrics emitted
(This component primarily *displays* metrics rather than emitting new ones; its own `/healthz` and query latency should still be tracked.)

## Failure modes
- Insufficient human-labeled data to compute a meaningful FP rate yet → show sample size alongside the rate ("FP rate: 12% (n=8) — low confidence") rather than a bare percentage that implies more certainty than the data supports.

## Build priority
**P2**, but high demo value — even a half-built version (Grafana defaults + one custom trust number) is worth showing; this is the component judges will screenshot.

## Assumptions
- You will generate enough synthetic/demo traffic before presenting to have non-trivial numbers on these charts — a dashboard with zero data points doesn't land.
