# PRD — Component 02: AI Re-Router & Load Balancer

## Purpose
Understand what the user/application actually needs (semantically) and send the request to the best available enterprise model for that need — balancing cost, speed, current traffic/health, task complexity, and the risk tier the Policy Engine has already assigned. This is what turns "an enterprise runs many models" from a liability into an optimization surface.

## Connections
- **Upstream:** Input Guard (04) hands off the (allowed/edited) envelope.
- **Downstream:** Model Adapter Layer (03), which does the actual provider call.
- **Reads from:** AI Immune & Audit System (08) publishes live per-model health/latency/error-rate signals this component consumes to avoid routing to a degraded model; Policy Engine (07) for risk-tier-aware routing constraints (e.g., "high risk tier → only route to the two most-audited models").
- **Writes to:** Audit Store (10) — which model was requested vs. actually routed to, and why.

## Tech stack
- LiteLLM's built-in **Router** class as the execution engine (it already supports weighted routing, fallbacks, cooldowns on failing deployments, and cost/latency-based strategies) — don't reimplement retry/fallback/cooldown logic from scratch.
- Custom **intent classifier** on top: `sentence-transformers` (e.g., `all-MiniLM-L6-v2`, small and fast enough for real-time) to embed the incoming request, compared via cosine similarity against a small labeled set of example prompts per model "capability profile" (e.g., "good at code," "good at long-document reasoning," "cheapest for short FAQ answers").
- Local vector index: FAISS (in-process, no extra infra) or Qdrant if you want a persistent/updatable capability store.

## Implementation
1. Embed the incoming request text.
2. Compute similarity against each registered model's capability profile centroid → candidate ranking.
3. Filter candidates by: risk-tier constraint (from Policy Engine), current health (from Immune System's live signal, e.g., circuit-broken models removed), geography constraint (data residency).
4. Among remaining candidates, pick using a configurable scoring function:
   `score = w1*capability_fit + w2*(1/cost) + w3*(1/expected_latency) - w4*current_load`
   with weights configurable per `use_case` (e.g., customer-facing weights latency heavily; decision-support weights capability_fit heavily).
5. Route via LiteLLM Router to the chosen deployment; on provider error, LiteLLM's fallback list handles retry to the next-ranked candidate automatically.
6. Record the full ranking (not just the winner) into `model.routing_trace` in the envelope metadata — this is what lets you demo "why did it pick this model" convincingly to judges.

## Structure
```
router/
  capability_profiles.yaml     # per-model example prompts + declared cost/latency
  classifier/
    embed.py
    rank.py
  litellm_router_config.yaml   # fallback lists, cooldown settings
  tests/
    test_ranking_determinism.py
```

## Non-functional requirements
- Routing decision latency budget: < 30 ms P95 (embedding + rank), independent of model call latency.
- Must re-rank on every request (no sticky routing) unless `session_id` requests model continuity (e.g., a multi-turn conversation should generally stay on the same model unless it's unhealthy).

## Metrics emitted
`routing_decisions_total{use_case, model, reason}`, `routing_latency_ms`, `model_selected_vs_requested_mismatch_total`, `fallback_triggered_total{from_model, to_model}`.

## Failure modes
- All candidate models unhealthy → escalate to human / return a "service degraded" response rather than forcing a route to a known-bad model; this must be a Policy Engine decision, not a hardcoded router behavior.
- Classifier failure → fall back to a static default model per `use_case` (configured, not hardcoded in this service).

## Build priority
**P1.** The gateway can function with a single static model mapping for the initial demo; add semantic routing once the P0 slice works end to end — it's a strong "technical novelty" talking point but not required for the core mechanism to work.

## Assumptions
- You will simulate 3+ "enterprise models" for the demo (e.g., two real API-backed models at different price/quality points, one deliberately misconfigured/slow model to demonstrate the reroute/fallback behavior live).
