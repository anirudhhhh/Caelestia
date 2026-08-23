# PRD — Component 10: Audit & Feedback Event Store

## Purpose
The system of record: every `InteractionEnvelope`, every decision, every human outcome label, stored append-only so that (a) any past decision can be explained and reproduced, (b) the feedback loop has real labeled data to learn from, and (c) the Metrics Dashboard has something to query. This is the component that turns "governance" from a claim into something a compliance stakeholder can actually audit.

## Connections
- **Written to by:** every component (Input/Output Guard, Policy Engine, Router, Human Review Console).
- **Read by:** Human Review Console (09, for context), AI Immune & Audit System (08, for feedback/labels), Metrics & Trust Dashboard (11).

## Tech stack
- **PostgreSQL**, one primary append-only table (`interaction_events`) plus a `human_outcomes` table, linked by `interaction_id`. Postgres, not a specialized ledger DB, is the right call for a hackathon — genuinely tamper-evident ledgers (e.g., AWS QLDB) are worth naming as the production path, not worth integrating now.
- Optional lightweight tamper-evidence for the demo: a nightly job that computes a hash chain over the day's rows (`row_hash = sha256(row_data + previous_row_hash)`) and stores the chain head — enough to show "we thought about tamper evidence" without building a blockchain.
- Redis Streams as a write buffer in front of Postgres if write volume becomes a bottleneck (unlikely at hackathon scale — start with direct writes, add the buffer only if profiling shows a need).

## Implementation
1. Schema:
   ```sql
   CREATE TABLE interaction_events (
     id BIGSERIAL PRIMARY KEY,
     interaction_id UUID NOT NULL,
     session_id UUID NOT NULL,
     direction TEXT NOT NULL,
     use_case TEXT NOT NULL,
     geography TEXT NOT NULL,
     envelope JSONB NOT NULL,        -- full InteractionEnvelope, PII already redacted upstream
     decision_action TEXT,
     policy_version TEXT,
     created_at TIMESTAMPTZ DEFAULT now()
   );
   CREATE TABLE human_outcomes (
     id BIGSERIAL PRIMARY KEY,
     interaction_id UUID NOT NULL REFERENCES interaction_events(interaction_id),
     reviewer_id TEXT NOT NULL,
     action TEXT NOT NULL,
     was_original_flag_correct BOOLEAN,
     reason TEXT,
     created_at TIMESTAMPTZ DEFAULT now()
   );
   ```
2. `interaction_events` is **insert-only** — no updates, no deletes, enforced at the application layer (and ideally a Postgres `REVOKE UPDATE, DELETE` on the table for the service role).
3. Index on `(interaction_id)`, `(use_case, created_at)`, and a GIN index on `envelope` for ad-hoc querying by check name/verdict (Metrics Dashboard needs this).
4. Provide a small internal query API (`GET /interactions/{id}`, `GET /interactions?use_case=&since=&action=`) rather than letting every component query Postgres directly — keeps the schema change surface to one place.

## Structure
```
audit_store/
  migrations/
  service.py                 # thin query API
  jobs/
    hash_chain.py
  tests/
    test_append_only_enforcement.py
```

## Non-functional requirements
- Write latency off the critical path — every writer should fire-and-forget (async write, or write to a local queue) so a slow audit write never adds to a user-facing response's latency.
- Retention policy configurable per `geography` (e.g., some jurisdictions require shorter retention of certain data categories) — a config flag per geography controlling redaction/deletion eligibility, even if the actual scheduled-deletion job is a stub for the hackathon.

## Metrics emitted
`audit_writes_total{status}`, `audit_write_latency_ms`, `hash_chain_verification_status`.

## Failure modes
- Store unavailable → writers should buffer briefly and retry rather than dropping events silently; if buffer overflows, that itself must be an alertable condition (this is the one place data loss is unacceptable).

## Security & compliance
- Access to raw `envelope` JSONB should be role-restricted (reviewers see redacted views by default per component 09; only specific compliance roles see raw).

## Build priority
**P0** — every other component's "write to audit" step depends on this existing early, even as a minimal single table.

## Assumptions
- For the demo, a simple `psql` query or a small internal admin page showing "explain this decision" for a given `interaction_id` is a strong, concrete way to prove the audit trail actually works, rather than just asserting it exists.
