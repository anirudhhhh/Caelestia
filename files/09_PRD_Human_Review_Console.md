# PRD — Component 09: Human Review & Escalation Console

## Purpose
The literal "Human Review (Approve/Deny)" box from Round 1: a queue and UI where escalated interactions land, a reviewer sees the full context and the exact checks/scores that triggered escalation, and their decision both resolves that interaction and produces a labeled training/tuning example for the feedback loop.

## Connections
- **Called by:** Policy & Governance Engine (07) on `escalate`; AI Immune & Audit System (08) for anomaly alerts that need human judgment.
- **Reads from:** Audit & Feedback Store (10) for full interaction context/history.
- **Writes to:** Audit & Feedback Store (10) — the human's outcome label; Policy Engine (07) — resume signal for interactions that were held pending review.

## Tech stack
- Backend: FastAPI + Redis (a simple priority queue: `ZADD` by escalation timestamp/severity, `BRPOP`-style worker pull for reviewers).
- Frontend: React + Vite + Tailwind (shadcn/ui components — table/queue view, detail drawer, diff view for "what would change if I approve the edit").
- Auth: simple role-based login (reviewer vs. admin who can also approve policy threshold changes proposed by component 08).

## Implementation
1. Queue view: list of pending escalations sorted by severity/age, each showing `use_case`, `risk.tier`, the specific `checks[]` that triggered escalation, and time-in-queue (SLA visibility matters — an escalation queue that silently grows is its own failure mode).
2. Detail view: full envelope (redacted per the PII service's anonymization, unless the reviewer has elevated clearance to see raw content for genuinely ambiguous cases), including recent conversation turns for context (multi-turn risk).
3. Reviewer actions: **Approve** (release the original response), **Deny** (send the canned-safe response instead), **Edit & Approve** (manually redact/adjust and release) — every action requires a one-line reason, stored alongside the label.
4. On any action, write an outcome record: `{interaction_id, reviewer_id, action, was_original_flag_correct: true|false, reason, timestamp}` — `was_original_flag_correct` is the single most valuable field in the whole system, since it's the ground-truth label the brief says otherwise doesn't exist in real time.
5. Separate view for Immune System (08) anomaly alerts and Policy Engine (07) threshold-change proposals — same queue mechanics, different action set (acknowledge/dismiss, approve/reject threshold diff).

## Structure
```
review_console/
  backend/
    queue.py
    routes/
      escalations.py
      threshold_proposals.py
  frontend/
    src/pages/QueueView.tsx
    src/pages/DetailView.tsx
    src/pages/ThresholdReview.tsx
  tests/
    test_queue_ordering.py
```

## Non-functional requirements
- Queue must show age/SLA breach clearly (e.g., anything escalated > 15 minutes without action gets visually flagged) — an invisible backlog defeats the purpose of human oversight.
- Real-time-ish updates (short polling or WebSocket) so multiple reviewers don't duplicate work on the same item.

## Metrics emitted
`escalations_pending`, `escalation_resolution_time_seconds`, `reviewer_actions_total{action}`, `flag_accuracy_rate` (computed from `was_original_flag_correct` — feed straight into 11's dashboard).

## Failure modes
- No reviewer available / queue backing up → this is itself an anomaly the Immune System should detect (queue depth as a monitored metric) and alert on.

## Build priority
**P1** — build a minimal version (even a simple admin table with approve/deny buttons) once escalation exists in the Policy Engine; polish the UI last.

## Assumptions
- One or two team members role-play "reviewer" during the demo to show the approve/deny flow live.
