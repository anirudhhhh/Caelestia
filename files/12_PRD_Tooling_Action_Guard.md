# PRD — Component 12: Tooling / Action Guard

## Purpose
The "TOOLING" box from the Round‑1 diagram, given real substance for Round 2: the brief specifically calls out that "AI agents that take actions (not just generate text) introduce compounding risk, where one questionable output can shape several downstream decisions." Text-output checking (components 04/05) is not sufficient once a model can call tools/APIs/take actions — this component gates the action itself, before it executes.

## Connections
- **Sits alongside:** the Router (02) / wherever an agent framework would normally execute a tool call.
- **Calls:** Policy & Governance Engine (07) for the allow/block/escalate decision on the proposed tool call specifically (distinct policy rules from text checks — e.g., "sending an email" and "issuing a refund" carry very different risk regardless of how clean the surrounding text looked).
- **Writes to:** Audit & Feedback Store (10) — every proposed tool call and its verdict, whether executed or not.

## Tech stack
- Implemented as a **middleware/interceptor** pattern rather than a standalone service with its own request path — it wraps whatever tool-calling mechanism the agent framework uses (e.g., a LangChain/LangGraph tool wrapper, or, if tools are exposed via MCP, an MCP server-side hook) so it can be dropped into different agent implementations without rearchitecting them.
- Same `InteractionEnvelope` schema, using the `tool_calls[]` field already defined in the flow doc.

## Implementation
1. Before a tool call executes, construct a `tool_call` record: `{tool_name, arguments, requesting_interaction_id}`.
2. Classify the tool call's **blast radius** using a small static registry maintained per integrated tool (not inferred from text): e.g., `read_only` (search, lookup) vs. `reversible_write` (draft an email, create a ticket) vs. `irreversible_action` (send an email, issue a payment, delete a record) — this registry is a config file, extended whenever a new tool is integrated.
3. Policy Engine (07) applies stricter thresholds by blast radius — e.g., `irreversible_action` tool calls always require either a very high confidence threshold or human escalation regardless of the surrounding text's risk score, since the brief's "compounding risk" point means even a low-risk-looking conversation shouldn't be allowed to trigger a high-blast-radius action unchecked.
4. For multi-step agent sessions, track **cumulative risk** across the session (e.g., three individually-low-risk tool calls that together constitute a sensitive workflow, like "look up customer" → "look up balance" → "issue refund") — sum/decay a running session risk score in the envelope's session context (pulled from Audit Store by `session_id`) rather than evaluating each call in total isolation.
5. On block/escalate: prevent the tool from executing at all (return a structured refusal to the agent framework, not just log it after the fact — logging after execution defeats the purpose for irreversible actions).

## Structure
```
action_guard/
  tool_registry.yaml           # tool_name -> blast_radius, description
  interceptor.py                # framework-specific wrapper (e.g., LangChain callback)
  session_risk.py                # cumulative risk tracking
  clients/
    policy_client.py
  tests/
    test_blast_radius_classification.py
    test_cumulative_session_risk.py
```

## Non-functional requirements
- Must execute genuinely **before** the tool call (in-process interception), not as an async audit — for irreversible actions, after-the-fact detection provides zero protection.

## Metrics emitted
`tool_calls_intercepted_total{tool_name, blast_radius, verdict}`, `cumulative_session_risk_score` (histogram), `irreversible_actions_blocked_total`.

## Failure modes
- Unknown tool (not in registry) → default to `irreversible_action`-level scrutiny (most conservative), never silently treat an unregistered tool as `read_only`.

## Build priority
**P2** for a full implementation, but even a **simulated version** (a mock agent that "calls" 2–3 fake tools with different blast radii, gated by this component) is a strong, cheap way to demonstrate the compounding-risk concept the brief explicitly asks teams to grapple with — worth including in some form even if the rest of the system is more built out.

## Assumptions
- Your demo includes at least one simulated multi-step agentic flow (not just single-turn Q&A) specifically to show this component earning its place — otherwise it's hard to justify separately from the Output Guard.
