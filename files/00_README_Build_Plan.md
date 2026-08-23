# ControlPlane.ai — Round 2 Prototype Documentation Set
**Team Caelestia | Accenture Innovation Challenge 2026**

This folder is the engineering handoff package for Round 2. It expands the Round‑1 architecture (Application → Gateway → AI Firewall → AI Re‑Router & Load Balancer → Enterprise Models, wrapped by the AI Immune & Audit System, with a Human Review escalation path) into ten buildable components, each with its own PRD written so it can be handed directly to an agentic coding tool (Claude Code, Cursor, Devin, etc.) with minimal extra interpretation.

## How this package is organized

| # | File | Component | Maps to Round‑1 diagram |
|---|---|---|---|
| — | `00_System_Flow_and_Architecture.md` | End‑to‑end flow, sequence diagrams, shared data contract | Whole diagram |
| 01 | `01_PRD_API_Gateway.md` | API Gateway | "GATEWAY" |
| 02 | `02_PRD_Router_LoadBalancer.md` | AI Re‑Router & Load Balancer | "AI Re‑Router & Load Balancer" |
| 03 | `03_PRD_Model_Adapter_Layer.md` | Model Adapter Layer | "Via Adapters" → Enterprise Models |
| 04 | `04_PRD_Input_Guard.md` | AI Firewall — Input Guard | "AI FIREWALL" (request side) |
| 05 | `05_PRD_Output_Guard_Verification.md` | AI Firewall — Output Guard & Verification | "AI FIREWALL" (response side) |
| 06 | `06_PRD_PII_Entity_Detection.md` | PII / Entity Detection Service | shared sub-service, not drawn separately in R1 |
| 07 | `07_PRD_Policy_Governance_Engine.md` | Policy & Governance Engine | implicit decision logic behind the Firewall |
| 08 | `08_PRD_Immune_Audit_System.md` | AI Immune & Audit System | "AI Immune & Audit System" |
| 09 | `09_PRD_Human_Review_Console.md` | Human Review & Escalation Console | "Human Review (Approve/Deny)" |
| 10 | `10_PRD_Audit_Feedback_Store.md` | Audit & Feedback Event Store | new — backs governance, audit trail, feedback loop |
| 11 | `11_PRD_Metrics_Trust_Dashboard.md` | Metrics & Trust Dashboard | new — the "skeptical stakeholder" reporting layer |
| 12 | `12_PRD_Tooling_Action_Guard.md` | Tooling / Action Guard | "TOOLING" |

`Tooling` in the original diagram is kept as its own component (`12`) because Round 2 explicitly calls out agentic, multi-step actions as a distinct, compounding risk — it deserves its own gate rather than being folded into the text-based Firewall.

## Why the architecture consolidates around one gateway framework

A from-scratch API gateway, router, load balancer, and multi-provider adapter is a lot of undifferentiated plumbing to hand-build in a hackathon window. We recommend building components 01–03 as **one deployable unit**: a **LiteLLM Proxy** instance (open-source, Python, purpose-built as an LLM gateway/router/cost-tracker with a pre-call/post-call hook system) configured and extended with custom hooks, rather than three services built from zero. This is reflected in each of those PRDs — they describe three logical components with clear boundaries, but 01–03 can physically ship as one process for the prototype. This is a legitimate engineering choice (start from the highest-leverage open-source primitive, add proprietary logic where it differentiates you), not a shortcut to be hidden from judges — say so explicitly in your demo.

Guardrail logic (components 04–06) is similarly recommended to sit on **`llm-guard`** (prompt injection, jailbreak, toxicity, PII, secret leakage scanners) and **Microsoft Presidio** (PII/entity detection specifically), rather than writing every detector from scratch. Where the problem statement rewards genuine novelty — semantic routing, risk-tiered decision logic, drift/anomaly detection, the feedback loop — the PRDs below specify custom implementation, because that's where your team's differentiation and technical novelty score should go.

## Suggested build priority (for a limited hackathon window)

| Priority | Components | Why |
|---|---|---|
| **P0 — demo backbone** | 01 Gateway, 04 Input Guard, 05 Output Guard, 06 PII Detection, 07 Policy Engine, 10 Audit Store | This alone proves the core mechanism: request → checked → decided → logged. It is a complete, demoable vertical slice. |
| **P1 — depth & narrative** | 02 Router/LB, 03 Adapter Layer, 08 Immune & Audit System, 09 Human Review Console | Shows multi-model, multi-use-case handling and the human-in-the-loop story the judges will ask about. |
| **P2 — polish, if time remains** | 11 Metrics Dashboard, 12 Tooling/Action Guard | Strong to *talk through* even if only partially built or simulated with canned data — the problem statement explicitly says a limited/simulated scope is acceptable. |

If you have to cut scope, cut breadth of detectors (e.g., ship 2 solid checks instead of 6 shallow ones) before you cut the decision-logic → audit-trail loop — the loop is the actual "ControlPlane" idea; the individual detectors are replaceable implementation details.

## Engineering practices that apply across every component

- **Contract-first:** every component reads/writes the shared `InteractionEnvelope` JSON object defined in `00_System_Flow_and_Architecture.md`. Agree on this schema before writing service code — it's what lets components be built in parallel by different teammates.
- **Everything is a service behind a health check.** Each component exposes `GET /healthz` and `GET /metrics` (Prometheus format) from minute one — this is what lets 08 and 11 exist at all.
- **Fail closed vs. fail open is a per-component decision, stated explicitly** in that component's PRD — don't let it default silently. As a rule: safety checks fail *closed* (block/escalate) on internal error for the "responsibility" axis, but fail *open* (allow, but flag loudly) for the "performance/cost" axis, so an outage doesn't take down every AI use case in the enterprise.
- **Config as data, not code.** Risk thresholds, per-use-case latency budgets, and per-geography rules live in versioned YAML/JSON config (component 07), never hard-coded in service logic — this is the difference between a demo and something that "would generalize for broader adoption," which the brief explicitly asks for.
- **Structured logging + correlation IDs.** Every log line carries `interaction_id`; this is what makes the audit trail and the human review console usable.
- **Latency budgets are enforced with timeouts, not hoped for.** Every check declares its own timeout; the Policy Engine decides what happens on timeout (skip vs. block) per risk tier.
- **Testing:** unit tests per detector with a small labeled fixture set (adversarial prompts, known-hallucination pairs, PII samples) is worth more in a judged demo than end-to-end test coverage — it lets you show precision/recall numbers live.
- **Secrets/config:** `.env` + a secrets manager stub (even a local `.env.example` + Doppler/Vault mention) — enterprises will ask about this even in a hackathon.
- **Version everything that affects a decision:** detector model version, policy config version, and prompt/judge-model version all get written into the audit record (component 10) — without this, you cannot explain *why* a historical decision was made, which is the first question a compliance stakeholder asks.

## Suggested tech stack (single table, detail in each PRD)

| Layer | Choice | Why |
|---|---|---|
| Services | Python 3.11+, FastAPI, `async`/`await` | One language across the team; FastAPI gives OpenAPI docs for free, which doubles as inter-service contracts |
| Gateway/Router/Adapter | LiteLLM Proxy | Purpose-built for exactly this; hook system for custom guardrails |
| Guardrail libraries | `llm-guard`, Microsoft `presidio-analyzer`/`presidio-anonymizer` | Real, maintained, cover most of the "detection techniques" list out of the box |
| Semantic routing | `sentence-transformers` + FAISS/Qdrant | Lightweight, local, no extra infra dependency for a hackathon |
| Event/queue | Redis Streams | One infra dependency serves pub/sub, queues, and caching |
| Storage | PostgreSQL (audit/feedback), Redis (hot state) | Postgres append-only tables are enough for a tamper-evident-enough demo ledger |
| Observability | OpenTelemetry → Prometheus → Grafana | Industry-standard, free, and gives you a live dashboard to show judges |
| Human review UI | React + Vite + Tailwind (shadcn/ui) | Fast to build, looks credible |
| Deployment | Docker Compose (single `docker-compose.yml` for all services) | Kubernetes is not worth the setup cost for a hackathon prototype; say "would move to k8s/managed services at production scale" in the deck instead of building it |

## Suggested Claude Skills / plugin for building this

Anthropic's catalog has an **Engineering** plugin (architecture decisions, code review, incident response, technical documentation) that lines up well with turning these PRDs into shipped services — worth adding before you start handing these documents to Claude Code.
