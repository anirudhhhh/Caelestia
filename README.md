# ControlPlane.ai

> **A Responsible AI Control Plane — Middleware that evaluates, governs, and audits every AI interaction in real time.**

**Team Caelestia | Accenture Innovation Challenge 2026 — Round 2 Prototype**

---

## What is ControlPlane.ai?

ControlPlane.ai is a middleware layer that sits between enterprise applications and their AI models. Every AI interaction — whether a customer support chatbot, an internal copilot, or a decision-support tool — passes through ControlPlane before reaching the model and again before reaching the user.

It performs **real-time safety checks** (prompt injection, toxicity, PII leakage, hallucination detection), makes **governed decisions** (allow / edit / flag / block / escalate) based on configurable policies that vary by use case, geography, and risk appetite, and maintains a **complete audit trail** with feedback loops that improve detection quality over time.

### Core Idea

> **"The control plane for responsible AI — not a one-size-fits-all filter, but a configurable, auditable decision layer that enterprises can tune to their specific risk tolerance."**

```
Application → ControlPlane Gateway → Input Guard → Router → AI Model
                                                              ↓
Application ← ControlPlane Gateway ← Output Guard ← Model Response
                    ↕                      ↕
              Policy Engine ←→ Audit Store → Human Review
                    ↕                           ↕
              Immune System → Trust Dashboard ← Feedback Loop
```

---

## Architecture (12 Components)

| # | Component | Port | Purpose |
|---|-----------|------|---------|
| 01 | **API Gateway** | 8000 | Single ingress point, orchestrates the full pipeline |
| 02 | **Router & Load Balancer** | 8005 | Semantic intent classification, multi-model routing |
| 03 | **Model Adapter** | 8006 | Provider-agnostic model calls (OpenRouter / Gemini) |
| 04 | **Input Guard** | 8001 | Pre-model: prompt injection, toxicity, secrets, PII |
| 05 | **Output Guard** | 8002 | Post-model: hallucination, leakage, toxicity, PII |
| 06 | **PII Service** | 8003 | Shared PII detection & anonymization (Presidio) |
| 07 | **Policy Engine** | 8004 | YAML-driven decision logic, configurable per use case |
| 08 | **Immune System** | 8009 | System-level anomaly detection, drift monitoring |
| 09 | **Human Review Console** | 8008 | Escalation queue with approve/deny/edit actions |
| 10 | **Audit Store** | 8007 | Append-only event store for every interaction |
| 11 | **Trust Dashboard** | — | FP/FN rates, trust scores, coverage metrics (frontend) |
| 12 | **Action Guard** | 8010 | Tool/action call gating with blast radius classification |

### How it Maps to the Problem Statement

| Problem Statement Requirement | Our Solution |
|-------------------------------|--------------|
| Detection techniques | Input Guard (prompt injection, toxicity, secrets) + Output Guard (hallucination via AI-as-judge, PII, system prompt leakage) + PII Service (Presidio) |
| Decision logic | Policy Engine: configurable thresholds per (use_case, geography, check), tiered responses (allow/edit/flag/block/escalate) |
| Architecture | Gateway as pre/post gate, Guards run checks in parallel, fire-and-forget audit logging to protect latency |
| Governance | YAML-driven policy configs, versioned (every decision traceable to exact policy version), geography-aware |
| Feedback loops | Human Review outcomes → labeled data → Immune System → threshold proposals → Policy Engine |
| Metrics & monitoring | Trust Dashboard (FP/FN rates, trust score, coverage), Immune System (anomaly detection) |
| Multi-turn / agentic risk | Action Guard (blast radius classification, cumulative session risk tracking) |
| Different risk tolerance | Latency budgets and policy thresholds vary by use case (customer_support vs. internal_copilot vs. decision_support) |

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | Python 3.11+, FastAPI | Async, auto-generated OpenAPI docs |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui | Modern, fast, production-quality UI |
| Guardrails | llm-guard, Microsoft Presidio | Industry-standard, maintained |
| LLM Access | OpenRouter API (100+ models) + Google Gemini | One API key for multi-model routing |
| Database | SQLite (prototype) / PostgreSQL (production) | Append-only audit store |
| Charts | Recharts | Interactive data visualization |

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- An OpenRouter API key (get one at [openrouter.ai](https://openrouter.ai))
- (Optional) A Google Gemini API key

### 1. Clone and configure

```bash
git clone <repo-url>
cd Caelestia

# Copy environment template and add your API keys
cp .env.example .env
# Edit .env — at minimum, set OPENROUTER_API_KEY
```

### 2. Install Python dependencies

```bash
# Create a virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install all dependencies
pip install -e .

# Download spaCy model for PII detection (optional, has regex fallback)
python -m spacy download en_core_web_sm
```

### 3. Start backend services

```bash
# Start all 11 services at once
./start_services.sh

# Or start individual services:
# PYTHONPATH=. python -m uvicorn services.gateway.app:app --port 8000
# PYTHONPATH=. python -m uvicorn services.input_guard.app:app --port 8001
# etc.
```

### 4. Start frontend

```bash
cd frontend
npm install
npm run dev
# → Open http://localhost:3000
```

### 5. Stop services

```bash
./stop_services.sh
```

---

## Configuration

### Environment Variables (.env)

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENROUTER_API_KEY` | OpenRouter API key for model access | *required* |
| `GEMINI_API_KEY` | Google Gemini API key (optional) | — |
| `DEFAULT_MODEL` | Default model for requests | `google/gemini-2.0-flash-001` |
| `JUDGE_MODEL` | Model used for AI-as-judge verification | `google/gemini-2.0-flash-001` |
| `AVAILABLE_MODELS` | Comma-separated list of models for routing | `google/gemini-2.0-flash-001,...` |
| `LOG_LEVEL` | Logging level | `INFO` |

### Policy Configuration

Policies are defined in `services/policy_engine/config/policies/default.yaml`. Each rule specifies:

```yaml
- use_case: customer_support    # Which AI use case
  geography: US                 # Which geography
  check: prompt_injection       # Which safety check
  block_threshold: 0.85         # Score above this → BLOCK
  flag_threshold: 0.5           # Score above this → FLAG/WARN
  on_timeout: allow_with_flag   # What to do if the check times out
```

Different use cases have different thresholds:
- **customer_support** (US): More permissive (lower risk, higher latency tolerance)
- **decision_support** (EU): Very strict (GDPR, regulated workflows)
- **internal_copilot** (US): Moderate thresholds

---

## API Usage

### Chat Completions (Main Endpoint)

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "messages": [{"role": "user", "content": "What is machine learning?"}],
    "use_case": "customer_support",
    "geography": "US"
  }'
```

Response includes the AI response **plus** full safety analysis:

```json
{
  "interaction_id": "uuid",
  "content": "Machine learning is...",
  "decision": {
    "action": "allow",
    "reason": "All checks passed",
    "policy_version": "abc123",
    "confidence": 0.12
  },
  "checks_summary": [
    {"check_name": "prompt_injection", "score": 0.05, "verdict": "pass"},
    {"check_name": "toxicity", "score": 0.02, "verdict": "pass"},
    {"check_name": "pii", "score": 0.0, "verdict": "pass"}
  ],
  "risk": {"tier": "low", "confidence": 0.12},
  "latency_ms": 1234.5
}
```

### Action Execution Guard

```bash
curl -X POST http://localhost:8000/v1/actions/execute \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-api-key" \
  -d '{
    "tool_calls": [
      {"tool_name": "issue_refund", "arguments": {"amount": 500}}
    ],
    "session_id": "session-uuid",
    "use_case": "customer_support"
  }'
```

---

## Project Structure

```
Caelestia/
├── shared/                     # Shared schemas & config
│   ├── schemas.py              # InteractionEnvelope + all data contracts
│   └── config.py               # Environment config, service URLs
├── services/
│   ├── gateway/                # 01 - API Gateway (port 8000)
│   ├── input_guard/            # 04 - Input Guard (port 8001)
│   │   └── scanners/           #   Prompt injection, toxicity, secrets
│   ├── output_guard/           # 05 - Output Guard (port 8002)
│   │   ├── scanners/           #   System prompt leakage, heuristics
│   │   └── verification/       #   AI-as-judge hallucination detection
│   ├── pii_service/            # 06 - PII Detection (port 8003)
│   ├── policy_engine/          # 07 - Policy Engine (port 8004)
│   │   └── config/policies/    #   YAML policy definitions
│   ├── router/                 # 02 - Router & LB (port 8005)
│   │   └── config/             #   Model capability profiles
│   ├── adapter/                # 03 - Model Adapter (port 8006)
│   ├── audit_store/            # 10 - Audit Store (port 8007)
│   ├── review_console/         # 09 - Human Review (port 8008)
│   ├── immune_system/          # 08 - Immune System (port 8009)
│   └── action_guard/           # 12 - Action Guard (port 8010)
├── frontend/                   # React dashboard
│   └── src/
│       ├── pages/              # Playground, Audit Trail, Human Review,
│       │                       # Trust Dashboard, Policy Editor, System Health
│       ├── components/         # Shared UI components
│       └── lib/                # API client, utilities
├── data/                       # SQLite database (auto-created)
├── files/                      # Original PRD documents
├── docker-compose.yml          # Production-like deployment
├── Dockerfile                  # Backend container image
├── pyproject.toml              # Python dependencies
├── start_services.sh           # Start all services
├── stop_services.sh            # Stop all services
├── .env.example                # Environment template
└── README.md                   # This file
```

---

## Key Design Decisions

### 1. Triangulation Over Verification (Hallucination Detection)
The brief says "there is often no reliable, real-time ground truth." Instead of pretending we can verify claims, we **triangulate** — combine heuristic scanners, AI-as-judge, and retrieval verification (when a corpus exists) into a composite `hallucination_risk` score. We report verification **coverage** honestly.

### 2. Policy Engine as the Single Decision Point
No Guard makes allow/block decisions — they only detect and report scores. The Policy Engine is the **sole** decision-maker, ensuring all decisions are governed by one auditable, configurable rule set. This is what makes the system a "control plane" rather than a collection of filters.

### 3. Config as Data, Not Code
Thresholds, latency budgets, and per-geography rules live in versioned YAML, not hardcoded. Every decision records which policy version produced it, so historical decisions can be reproduced and explained.

### 4. Fail-Closed vs. Fail-Open is a Per-Use-Case Decision
- Decision-support (regulated) → fail **closed** (block on any scanner failure)
- Customer-facing FAQ → fail **open with flag** (don't break the user experience for a scanner outage)

### 5. Feedback Loop Architecture
Human reviewers label escalated interactions as "flag was correct" or "false positive." This becomes the **only real ground truth** in the system. The Immune System uses these labels to compute FP/FN rates and propose threshold adjustments (human-approved, never auto-applied).

### 6. Action Guard for Agentic Risk
Text-checking isn't enough when AI agents can take actions. The Action Guard classifies every tool call by **blast radius** (read_only → reversible_write → irreversible_action) and applies stricter scrutiny for high-blast-radius actions, tracking **cumulative session risk** across multi-step workflows.

---

## Assumptions

- Enterprise consumes models via API (no weight/logit access) — all checking is input/output layer only
- 3 use cases: customer support (real-time, 800ms budget), internal copilot (2.5s), decision support (10s, batch/regulated)
- Tens of thousands of interactions/week across use cases combined
- All upstream data sources treated as untrusted by default
- OpenRouter provides access to multiple models via a single API key

---

## Production Path (What We'd Do Next)

| Prototype | Production |
|-----------|------------|
| SQLite | PostgreSQL + AWS QLDB for tamper evidence |
| In-memory queues | Redis Streams / RabbitMQ |
| Script-based deployment | Kubernetes + Helm charts |
| YAML policy files | Open Policy Agent (OPA) / Rego |
| Single-process services | Horizontally scaled containers |
| Manual anomaly thresholds | ML-based time-series anomaly detection (Prophet) |
| Regex PII fallback | Full spaCy + custom NER models per language |

---

## License

MIT — built for Accenture Innovation Challenge 2026
