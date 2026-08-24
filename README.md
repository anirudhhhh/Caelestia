# ControlPlane.ai

> **The Enterprise Responsible AI Control Plane — Real-time Middleware that Evaluates, Governs, Routes, and Audits Every AI Interaction.**

**Team Caelestia | Accenture Innovation Challenge 2026**

---

## 1. What is ControlPlane.ai?

**ControlPlane.ai** is a high-throughput, enterprise-grade AI governance middleware and security firewall that sits between public/internal client applications and downstream AI models / multi-agent workflows.

Every AI interaction passes through ControlPlane at the **perimeter boundary** (ingress user prompt and egress model response). It performs **stateless, sub-millisecond safety evaluations** (prompt injection, toxicity, PII, secrets leakage, hallucination verification), executes **dynamic policy decisions** (allow / flag / block / escalate), routes queries semantically to specialized agent endpoints, and powers a **closed-loop self-healing Immune System** calibrated by human verification.

```
                     ┌────────────────────────────────────────────────────────┐
                     │                   CLIENT PERIMETER                     │
                     │ (Web Apps, Mobile Clients, Public API Consumers)       │
                     └───────────────────────────┬────────────────────────────┘
                                                 │ HTTPS / gRPC
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                            CONTROLPLANE.AI MIDDLEWARE CLUSTER                               │
│                                                                                             │
│  ┌─────────────────────────┐       ┌────────────────────────┐       ┌────────────────────┐  │
│  │   Stateless Gateway     │ ────► │  Input Guard (Port 8001)│ ────► │ Policy Engine      │  │
│  │   (FastAPI / Port 8000) │       │  • PII (Presidio/Regex)│       │ (Port 8004 / Dyn.  │  │
│  │   [Shared HTTPX Pool]   │       │  • Prompt Injection     │       │  Threshold Matcher)│  │
│  └───────────┬─────────────┘       │  • Secrets / Credentials│       └────────────────────┘  │
│              │                     └────────────────────────┘                                │
│              │                                                                              │
│              ├─────────────────────► Asynchronous Audit Bus (Fire & Forget, 0 user latency)   │
│              │                                                                              │
│              ▼                                                                              │
│  ┌─────────────────────────┐       ┌─────────────────────────────────────────────────────┐  │
│  │ Semantic Load Balancer  │ ────► │ DOWNSTREAM ENTERPRISE WORKFLOWS                     │  │
│  │ (Port 8005 / Routing)   │       │ (Internal Microservices, LangGraph, Multi-Agents)   │  │
│  └─────────────────────────┘       └──────────────────────────┬──────────────────────────┘  │
│                                                               │                             │
│                                                               ▼                             │
│                                    ┌────────────────────────┐                               │
│                                    │ Output Guard (Port 8002)│                               │
│                                    │  • Sensitive Data Leak │                               │
│                                    │  • Output Toxicity     │                               │
│                                    │  • Hallucination /Judge│                               │
│                                    └────────────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
                                                 │
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                               GOVERNANCE & SELF-HEALING LOOP                                │
│                                                                                             │
│  ┌─────────────────────────┐       ┌────────────────────────┐       ┌────────────────────┐  │
│  │   Human Review Console  │ ────► │  Audit Store (Port 8007)│ ────► │ Immune System      │  │
│  │   (Port 8008 / Ingress &│       │  (Bi-directional trace │       │ (Port 8009 / Sigma │  │
│  │    Egress Escalations)  │       │   & Precision Metrics) │       │  Anomaly Analysis) │  │
│  └───────────┬─────────────┘       └────────────────────────┘       └─────────┬──────────┘  │
│              │                                                                │             │
│              │ (Operator Resolution)               ┌────────────────────────┐ │             │
│              ▼                                     │ Hot-Reload Policy Eng. │ ◄─────────────┘
│  ┌─────────────────────────┐                       │ (1-Click Accept/Apply) │
│  │  Playground Resolution  │                       └────────────────────────┘
│  │  (Live Client Update)   │
│  └─────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Enterprise Readiness & Architectural Highlights

### 1. Perimeter-Decoupled Sanitization (Zero Agent Interference)
* **The Multi-Agent Challenge:** Intercepting internal agent thoughts, vector lookups, and sub-tool executions introduces latency explosions and false-positive blocks that break multi-agent reasoning loops (e.g., LangGraph).
* **Our Solution:** ControlPlane.ai operates strictly at the perimeter boundary:
  1. Sanitizes and validates the **initial user input** (Ingress).
  2. Allows internal agent workflows, LangGraph nodes, and tools to execute uninterrupted.
  3. Sanitizes and audits the **final response** before delivering it to the client (Egress).

### 2. Zero-Latency Asynchronous Human Verification & Real-Time Resolution Loop
* When an interaction trips a warning threshold (`FLAG` or `ESCALATE`), the Gateway **does not block or stall the user**.
* The request is executed through downstream models and streamed to the user immediately, while an asynchronous task registers the interaction in the **Human Review Console** (`/review`).
* The **Playground** actively tracks the escalation in the background (`GET /v1/escalations/{interaction_id}`); when an operator approves, denies, or edits the message in Human Review, the conversation view automatically updates with the operator's decision.

### 3. Action Guard: Cumulative Session Risk & Blast Radius
* Controls autonomous agent tool execution via blast radius tiers: `READ_ONLY` (`+0.05`), `REVERSIBLE_WRITE` (`+0.25`), and `IRREVERSIBLE_ACTION` (`+0.50`).
* Tracks compounding risk across the conversation lifecycle (`0.0`–`1.0`), blocking high-blast actions when cumulative session risk exceeds configured safety thresholds ($> 0.70$).

### 4. Data-Driven Closed-Loop Immune System (Self-Healing Governance)
* After observing 10+ interaction telemetry events and operator review outcomes, the **Immune System** calculates true statistical distributions ($\mu$, $\sigma$, and score clustering):
  * E.g., if empirical analysis shows $83.3\%$ of flagged toxicity violations scored between $0.78$–$0.82$, it autonomously proposes lowering the block threshold from $0.90 \rightarrow 0.80$.
  * Compliance operators can review the statistical rationale and click **"Accept & Apply"** in the Policy Editor, instantly hot-reloading the Policy Engine without restarting any microservice.

### 5. High-Throughput Pooled HTTPX Architecture
* Every microservice maintains a lifespan-scoped connection pool (`max_keepalive_connections=20, max_connections=100`), eliminating per-request TCP handshakes and ensuring sub-10ms inter-service hops under enterprise load.

### 6. Zero DB Reads on Frontend Route Switching
* Interactive session state, telemetry envelopes, and chat logs are managed via a client-side in-memory store (`PlaygroundContext.tsx`), guaranteeing **0 redundant database queries** and **0 storage thrashing** during operator navigation.

---

## 3. Microservice Architecture (12 Components)

| # | Component | Port | Purpose |
|---|-----------|------|---------|
| 01 | **API Gateway** | `8000` | Ingress gateway, proxy orchestrator, async audit dispatcher |
| 02 | **Semantic Router & LB** | `8005` | Dynamic endpoint registry, semantic intent search over prompt instructions, multi-agent load balancing |
| 03 | **Model Adapter** | `8006` | Dual-provider model execution (Direct Google Gemini API + OpenRouter multi-model gateway) |
| 04 | **Input Guard** | `8001` | Ingress perimeter firewall: prompt injection, toxicity, secrets detection (`detect-secrets` + regex), PII |
| 05 | **Output Guard** | `8002` | Egress perimeter firewall: hallucination verification (AI-as-judge), system prompt leakage, sensitive data, toxicity |
| 06 | **PII Service** | `8003` | Shared PII detection & anonymization (Presidio NLP + contextual regex fallback) |
| 07 | **Policy Engine** | `8004` | Versioned YAML-driven policy evaluator with hierarchical wildcard matching and dynamic thresholds |
| 08 | **Immune System** | `8009` | Telemetry analyzer, statistical $\sigma$-anomaly detection, automated self-healing threshold proposals |
| 09 | **Human Review Console** | `8008` | Durable SQLite escalation queue with human-in-the-loop review (Approve, Deny, Edit) establishing ground truth |
| 10 | **Audit Store** | `8007` | Append-only event store with bidirectional `input`/`output` indexing and statistical analytics |
| 11 | **Action Guard** | `8010` | Agentic tool-call gating with cumulative session risk tracking and blast radius classification |
| 12 | **Trust Dashboard** | `3000` | Live visualization of Composite Trust Scores (0–100), 7-day intervention trends, and decision breakdowns |

---

## 4. LLM Providers: Gemini API Key vs. OpenRouter

ControlPlane.ai supports both **Direct Google Gemini API** access and **OpenRouter Multi-Model** access:

| Feature | Google Gemini API (`GEMINI_API_KEY`) | OpenRouter (`OPENROUTER_API_KEY`) |
| :--- | :--- | :--- |
| **Use Case** | Direct, native access to Google Gemini models (`gemini-2.5-flash`, `gemini-2.0-flash-001`, `gemini-1.5-pro`). | Access to 100+ AI models across multiple providers with a single API key and account. |
| **Supported Models** | Google Gemini family only. | OpenAI (`gpt-4o`, `gpt-4o-mini`), Anthropic (`claude-3.5-sonnet`), Meta (`llama-3.3-70b`), Google Gemini, Mistral. |
| **Latency & Hops** | Direct HTTP connection to Google AI Studio / Vertex AI (`generativelanguage.googleapis.com`). Zero intermediary hops. | Unified OpenAI-compatible proxy (`openrouter.ai/api/v1`). |
| **Billing & Free Tier** | Free tier available via Google AI Studio (up to 15 RPM free). | Unified pay-as-you-go credit balance across all foundation model vendors. |
| **Configuration in `.env`** | `GEMINI_API_KEY=AIzaSy...` | `OPENROUTER_API_KEY=sk-or-v1-...` |

> **Recommendation:** Set `OPENROUTER_API_KEY` for multi-model load balancing and router evaluations across GPT, Claude, and Llama. Set `GEMINI_API_KEY` for high-throughput, zero-markup Gemini execution.

---

## 5. Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Backend** | Python 3.11+, FastAPI, Uvicorn, AsyncIO | High-throughput asynchronous I/O, OpenAPI compliance, sub-10ms inter-service latency |
| **Frontend** | React 18, Vite, TypeScript, Tailwind CSS, Lucide Icons | Production-grade UI, reactive components, responsive layout |
| **Guardrails** | Microsoft Presidio, detect-secrets, Regex, AI-as-Judge | Defense-in-depth security, credential protection, and PII anonymization |
| **Routing & LLM** | OpenRouter API + Google Gemini SDK | Semantic workload routing, multi-model failover, custom HTTP endpoints |
| **Storage & Telemetry** | SQLite (`aiosqlite`) / PostgreSQL | Durable audit events, persistent review queue, and precision telemetry |
| **State Management** | React Context (In-Memory RAM Store) | 0 DB reads and instant route transitions |

---

## 6. Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- An OpenRouter API key ([openrouter.ai](https://openrouter.ai)) OR a Google Gemini API key ([aistudio.google.com](https://aistudio.google.com))

### 1. Clone & Configure

```bash
git clone <repo-url>
cd Caelestia

# Copy environment template
cp .env.example .env

# Edit .env to add your API key (OPENROUTER_API_KEY or GEMINI_API_KEY)
```

### 2. Install Dependencies

```bash
# Backend dependencies
python3 -m venv venv
source venv/bin/activate
pip install -e .

# Download spaCy model for PII entity recognition
python3 -m spacy download en_core_web_sm

# Frontend dependencies
cd frontend
npm install
cd ..
```

### 3. Start Microservices Cluster

```bash
# Start all 11 backend microservices in background
./start_services.sh

# Start Frontend (in a separate terminal)
cd frontend
npm run dev
# → Open http://localhost:3000
```

### 4. Stop Services

```bash
./stop_services.sh
```

---

## 7. API Usage Examples

### 1. Governed Chat Completions

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "Tell me how to configure enterprise SSO."}],
    "use_case": "customer_support",
    "geography": "US"
  }'
```

**Response with Perimeter Telemetry:**
```json
{
  "interaction_id": "803be20c-34a4-420b-bb3c-7e8cff794bed",
  "content": "To configure enterprise SSO, follow these steps...",
  "model_used": "google/gemini-2.5-flash",
  "decision": {
    "action": "allow",
    "reason": "All checks passed",
    "policy_version": "408786b9"
  },
  "checks_summary": [
    {"check_name": "prompt_injection", "score": 0.0, "verdict": "pass", "latency_ms": 0.1},
    {"check_name": "toxicity", "score": 0.0, "verdict": "pass", "latency_ms": 0.1},
    {"check_name": "secrets", "score": 0.0, "verdict": "pass", "latency_ms": 2.1},
    {"check_name": "pii", "score": 0.0, "verdict": "pass", "latency_ms": 15.4}
  ],
  "risk": {"tier": "low", "confidence": 0.0},
  "latency_ms": 1120.4
}
```

### 2. Action Guard Tool Execution

```bash
curl -X POST http://localhost:8000/v1/guard \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "session_user_42",
    "use_case": "customer_support",
    "interaction_id": "act_889",
    "tool_calls": [
      {"tool_name": "refund_customer", "blast_radius": "reversible_write", "arguments": {"amount": 50}}
    ]
  }'
```

### 3. Self-Healing Immune Proposals & 1-Click Hot Reload

```bash
# Fetch auto-generated data-driven proposals
curl http://localhost:8000/v1/health/proposals

# Accept and hot-reload policy in real-time
curl -X POST http://localhost:8000/v1/health/proposals/prop_toxicity_080/accept
```

---

## 8. Repository Structure

```
Caelestia/
├── shared/                     # Shared schemas & config
│   ├── schemas.py              # InteractionEnvelope + all Pydantic contracts
│   └── config.py               # Centralized configuration & environment loader
├── services/
│   ├── gateway/                # 01 - API Gateway (port 8000)
│   ├── input_guard/            # 04 - Input Guard (port 8001)
│   ├── output_guard/           # 05 - Output Guard (port 8002)
│   ├── pii_service/            # 06 - PII Detection (port 8003)
│   ├── policy_engine/          # 07 - Policy Engine (port 8004)
│   │   └── config/policies/    #   Versioned YAML policy definitions
│   ├── router/                 # 02 - Router & Load Balancer (port 8005)
│   ├── adapter/                # 03 - Model Adapter (port 8006)
│   ├── audit_store/            # 10 - Audit Store (port 8007)
│   ├── review_console/         # 09 - Human Review Console (port 8008)
│   ├── immune_system/          # 08 - Immune System (port 8009)
│   └── action_guard/           # 11 - Action Guard (port 8010)
├── frontend/                   # React 18 + TypeScript + Vite Dashboard (port 3000)
│   └── src/
│       ├── context/            # Pure in-memory PlaygroundContext (0 DB reads)
│       ├── pages/              # Playground, Audit Trail, Human Review,
│       │                       # Trust Dashboard, Policy Editor, Load Balancer
│       ├── components/         # shadcn/ui components & layouts
│       └── lib/                # API client and formatting utilities
├── data/                       # Append-only SQLite databases
├── start_services.sh           # Cluster startup script
├── stop_services.sh            # Cluster shutdown script
├── .env.example                # Fact-checked environment template
└── README.md                   # System documentation & PRD guide
```

---

## 9. License

MIT — Developed for the **Accenture Innovation Challenge 2026**.
