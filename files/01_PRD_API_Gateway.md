# PRD — Component 01: API Gateway

## Purpose
Single ingress point for every AI interaction in the enterprise. Authenticates the caller, resolves which `use_case` and latency budget apply, opens the `InteractionEnvelope`, and orchestrates the pass-through to the Input Guard → Router → Adapter → Output Guard chain, returning the final (possibly edited/blocked) response to the calling application. This is the component that lets ControlPlane sit "on top of any model" without the application needing to know a checker exists.

## Connections
- **Upstream:** Application(s) — customer support UI, internal copilot, decision-support tool. Each registers a `client_id` mapped to one or more `use_case` values.
- **Downstream:** Input Guard (04) synchronously; on the return path, receives the final envelope from Output Guard (05) via the Policy Engine (07)'s decision.
- **Side calls:** Audit & Feedback Store (10) for envelope persistence (fire-and-forget, non-blocking); AI Immune & Audit System (08) scrapes `/metrics` from this service.

## Tech stack
- **Runtime:** LiteLLM Proxy (Python) as the base process — it already implements OpenAI-compatible ingress, provider routing, and a `pre_call`/`post_call`/`async_pre_call_hook` extension system.
- **Custom layer:** a thin FastAPI app in front of/alongside LiteLLM for auth, `use_case` resolution, and envelope construction, implemented as LiteLLM custom callback classes (`litellm.integrations.custom_logger.CustomLogger`) rather than a separate proxy hop, to avoid adding a network round trip per request.
- **Auth:** API key per client, stored hashed in Postgres; short-lived JWT optional for browser-based internal copilots.
- **Deployment:** Docker container, stateless, horizontally scalable behind a load balancer (or just multiple `docker compose` replicas for the prototype).

## Implementation
1. On request: validate API key → resolve `client_id` → look up `use_case` and `geography` from a config table (see Policy Engine, 07) → generate `interaction_id`/`session_id` → construct the input-direction `InteractionEnvelope`.
2. Call Input Guard (04) synchronously with the envelope, respecting the use case's Input Guard timeout slice (see flow doc §5).
3. On `decision.action == block`: return a policy-safe canned refusal immediately; do not call the model. Log to Audit Store and return.
4. On `allow`/`edit`: forward the (possibly edited) envelope to the Router (02).
5. Receive final response from Output Guard's decision (via Policy Engine); apply `edit` (e.g., redact PII spans) or `block` (templated refusal) as instructed; stream or return to the Application.
6. Every branch writes the final envelope to the Audit Store — including `allow`, so false-negative analysis later has a complete population to compare against.
7. Emit request/response as normal LiteLLM logging *plus* the ControlPlane-specific fields via a custom logging callback so both operational and compliance logs come from one code path.

## Structure (suggested repo layout)
```
gateway/
  config/litellm_config.yaml         # model list, routing strategy stub (real logic lives in 02)
  hooks/
    auth.py
    envelope.py                      # InteractionEnvelope builder/validator (pydantic model, shared package)
    input_guard_client.py
    output_guard_client.py
  app.py                             # FastAPI wrapper / LiteLLM entrypoint
  tests/
    test_auth.py
    test_envelope_roundtrip.py
```
Publish `envelope.py`'s pydantic model as a small shared package (`controlplane-schemas`) that every other component installs — this is what keeps 01–12 contract-compatible without a shared monorepo.

## Non-functional requirements
- P50 gateway overhead (excluding guard/model time) < 15 ms.
- Stateless; no in-memory session state beyond the single request (session continuity lives in the Audit Store, keyed by `session_id`).
- Must degrade gracefully: if Input Guard (04) is unreachable, **fail closed** for `decision-support`/regulated use cases (block, escalate to human) but **fail open with a loud flag** for low-risk customer-facing FAQ-type traffic, per use-case config in the Policy Engine — never a single global fail-open/closed switch.

## Metrics emitted
`requests_total{use_case, geography, action}`, `gateway_latency_ms` (histogram), `guard_unavailable_total`, `active_sessions`.

## Failure modes
- Input/Output Guard timeout → apply the use case's configured fallback action (see 07), always log the timeout itself as an event (not silently treated as "pass").
- Auth store unavailable → reject with 503, do not silently allow unauthenticated traffic.

## Security & compliance
- No raw PII should be logged at the Gateway layer beyond what's already in the envelope (which itself gets redacted by the PII service before persistence — see 06/10).
- Per-geography routing must be enforceable here too (e.g., EU traffic pinned to EU-hosted models) — read from the same config the Policy Engine uses.

## Build priority
**P0.** Nothing else in the system works without it; budget the first build day here plus the envelope schema.

## Assumptions
- Applications call ControlPlane's OpenAI-compatible endpoint instead of calling the model provider directly (this is what makes "sits on top of any model" true) — this needs one line of config on the application side, not a code change, since LiteLLM speaks the OpenAI wire format.
