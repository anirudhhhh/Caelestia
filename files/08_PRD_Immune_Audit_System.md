# PRD — Component 08: AI Immune & Audit System

## Purpose
The system-level watcher from the Round‑1 diagram: continuously observes the whole pipeline (not a single request) for anomalies and quality degradation — latency creep, cost spikes, accuracy/hallucination-rate drift, rising failure rates on a specific model or detector — and reacts by flagging, triggering a rollback/reroute, or pushing an escalation, faster than a human watching dashboards manually could.

## Connections
- **Reads:** Prometheus metrics from every other component (`/metrics` endpoints); the Audit & Feedback Store (10) for historical/labeled outcome data.
- **Writes:** rollback/reroute commands to the Router (02) (e.g., temporarily deprioritize or remove a model from the candidate pool); threshold-change proposals to the Policy Engine (07); alerts to the Human Review Console (09); its own findings back into the Audit Store for the Metrics Dashboard (11) to display.

## Tech stack
- **Prometheus** for metric scraping/storage (every component already emits metrics per its own PRD); **Grafana** for visualization, reused by component 11.
- Anomaly detection: start simple and defensible — **rolling z-score / EWMA (exponentially weighted moving average)** on each key metric (latency, cost/token, block rate, hallucination_risk distribution, per-model error rate) rather than a black-box ML model you can't explain live. Escalate to a proper time-series model (e.g., Facebook `Prophet` or a simple seasonal decomposition) only if time allows and the demo benefits from showing seasonality-aware detection.
- Implementation: a Python service (APScheduler or a simple asyncio loop) polling Prometheus's query API every N seconds, computing rolling statistics, comparing against configurable sigma thresholds.

## Implementation
1. Poll each tracked metric on an interval (e.g., every 30s): `model_call_latency_ms`, `hallucination_risk_score` distribution, `decisions_total{action=block}` rate, `tokens_used_total` (cost proxy), `model_call_errors_total`.
2. Maintain a rolling baseline (mean/stddev over a trailing window, e.g., 1 hour) per `(metric, model, use_case)` combination.
3. Flag when a fresh value exceeds `baseline_mean ± k*stddev` (k configurable, default 3) — this is deliberately explainable arithmetic, not an opaque model, which matters when you have to defend a false alarm to the same "skeptical stakeholder" the brief mentions.
4. On sustained anomaly (N consecutive breaches, to avoid single-sample noise): 
   - Latency/error-rate anomaly on a specific model → send a "deprioritize" command to the Router (02), which lowers that model's routing weight or removes it from the pool for a cooldown period (rollback-to-healthier-model behavior).
   - Rising block/hallucination rate on a specific `use_case` → alert Human Review Console (09) and propose a threshold review to Policy Engine (07), rather than auto-changing policy.
5. Every anomaly event (detected, action taken, and later — resolved/false-alarm, once a human confirms) is written to the Audit Store, which is exactly the "feedback loop" data the Policy Engine's threshold proposals are built from.

## Structure
```
immune_system/
  monitors/
    baseline_tracker.py
    anomaly_rules.py
  actions/
    router_deprioritize.py
    policy_proposal.py
    human_alert.py
  service.py
  tests/
    test_ewma_thresholds.py
```

## Non-functional requirements
- This component is explicitly **not** on the request-serving critical path — it can run with seconds-to-minutes of lag; do not let it become a synchronous dependency of the Gateway/Guards.

## Metrics emitted
`anomalies_detected_total{metric, model, use_case}`, `rollback_actions_total{model}`, `false_alarm_rate` (computed once humans label anomaly outcomes via the Review Console).

## Failure modes
- Metrics backend (Prometheus) unavailable → this component simply has no signal; it must not silently claim "all healthy" — expose its own `last_successful_scrape_at` metric so its own downtime is itself observable.

## Build priority
**P1.** Build the metrics emission into every other component from day one (cheap, do it as you build each service); build the anomaly-detection loop itself once the P0 slice is stable enough to generate real metric traffic to detect anomalies in.

## Assumptions
- For the demo, you can manually induce an anomaly (e.g., artificially slow down or error out one mock "enterprise model") to trigger a visible rollback live, rather than waiting for organic drift.
