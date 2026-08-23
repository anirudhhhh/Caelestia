# PRD — Component 03: Model Adapter Layer

## Purpose
Normalize every enterprise model — regardless of provider, hosting, or wire format — into one request/response shape the rest of ControlPlane speaks. This is what makes the whole system "sit on top of any model" and what respects the constraint that enterprises consume foundation models via API rather than owning them (no weight/logit access assumed).

## Connections
- **Upstream:** Router/Load Balancer (02) hands off the envelope plus the chosen model deployment.
- **Downstream:** the actual provider endpoint (OpenAI, Anthropic, Azure OpenAI, a self-hosted vLLM/OSS model, etc.).
- **Returns to:** Output Guard (05) with a normalized response object regardless of source provider.

## Tech stack
- LiteLLM's provider adapters, which already normalize 100+ providers to the OpenAI request/response schema — this component is largely **configuration**, not new code: a `litellm_config.yaml` model list with per-model provider credentials and parameters.
- Where a provider isn't supported out of the box (a proprietary in-house model, a legacy REST API), write a small custom adapter implementing LiteLLM's `CustomLLM` interface so it plugs into the same Router/fallback machinery as everything else.

## Implementation
1. Maintain a model registry (YAML or Postgres table) of every deployment: provider, credentials reference (never inline secrets — pull from a secrets manager/`.env`), declared cost per 1K tokens, declared max latency, capability tags (consumed by 02), geography/data-residency tag.
2. On call: translate the envelope's normalized request into the provider's native schema, call it with the use case's timeout, translate the native response back into the normalized response shape (`content`, `finish_reason`, `usage.tokens`, `latency_ms`, `provider_request_id` for traceability).
3. Never inspect or attempt to access model internals (logprobs beyond what the API exposes, attention, weights) — everything downstream (Output Guard, Immune System) must work from input/output text and whatever metadata the API legitimately returns. This is a hard constraint from the brief, not a nice-to-have.
4. Surface provider errors/timeouts as a typed error the Router's fallback logic can act on (already handled by LiteLLM if you use its native provider integrations; custom adapters must raise the same exception types).

## Structure
```
adapters/
  model_registry.yaml
  custom/
    legacy_model_adapter.py     # only needed for non-standard providers
  secrets/                      # gitignored; .env.example checked in instead
  tests/
    test_normalization_roundtrip.py
```

## Non-functional requirements
- Adapter overhead (translation, not the model call itself) < 5 ms P95.
- Credentials rotated without redeploying dependent services (read from secrets manager at call time or on a short TTL cache, not baked into images).

## Metrics emitted
`model_call_latency_ms{provider, model}`, `model_call_errors_total{provider, model, error_type}`, `tokens_used_total{provider, model, use_case}` (this feeds the cost axis of the original ControlPlane pitch directly).

## Failure modes
- Provider timeout/5xx → typed error to Router for fallback; Adapter itself does not decide fallback policy.
- Malformed/unexpected provider response → treat as a hallucination-adjacent failure and pass an explicit `adapter_error` flag into the envelope rather than passing through a broken response silently.

## Build priority
**P1**, but trivial if you build 01–03 as one LiteLLM-based process (recommended) — most of this is YAML configuration once real API keys for 2–3 providers are on hand.

## Assumptions
- At least one of the "enterprise models" in your demo is a real hosted API (not a mock), so the cost/latency numbers you show judges are genuine.
