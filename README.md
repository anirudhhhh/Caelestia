# ControlPlane.ai

> **The Enterprise Responsible AI Control Plane — Middleware that evaluates, governs, routes, and audits every AI interaction in real time.**

**Team Caelestia | Accenture Innovation Challenge 2026**

---

## What is ControlPlane.ai?

ControlPlane.ai is a high-throughput, enterprise-grade AI middleware and firewall that sits between public/internal client applications and downstream AI models / multi-agent workflows.

Every AI interaction passes through ControlPlane at the **perimeter boundary** (ingress user prompt and egress model response). It performs **stateless, sub-millisecond safety evaluations** (prompt injection, toxicity, PII, secrets leakage, hallucination verification), executes **dynamic policy decisions** (allow / flag / block / escalate), routes queries semantically to specialized agent endpoints, and powers a **closed-loop self-healing Immune System** driven by human verification.

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
│  │   (FastAPI / Port 8000) │       │  • PII (Presidio)       │       │ (Dynamic In-Memory │  │
│  └───────────┬─────────────┘       │  • Prompt Injection     │       │  Threshold Matcher)│  │
│              │                     │  • Secrets Detection    │       └────────────────────┘  │
│              │                     └────────────────────────┘                                │
│              │                                                                              │
│              ├─────────────────────► Asynchronous Audit Bus (Fire & Forget, 0 user latency)   │
│              │                                                                              │
│              ▼                                                                              │
│  ┌─────────────────────────┐       ┌─────────────────────────────────────────────────────┐  │
│  │ Semantic Load Balancer  │ ────► │ DOWNSTREAM ENTERPRISE WORKFLOWS                     │  │
│  │ (Embeddings / Routing)  │       │ (Internal Microservices, LangGraph, Multi-Agents)   │  │
│  └─────────────────────────┘       └──────────────────────────┬──────────────────────────┘  │
│                                                               │                             │
│                                                               ▼                             │
│                                    ┌────────────────────────┐                               │
│                                    │ Output Guard (Port 8002)│                               │
│                                    │  • Sensitive Data Leak │                               │
│                                    │  • Output Toxicity     │                               │
│                                    │  • Hallucination / Judge│                               │
│                                    └────────────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
                                                 │
                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                               GOVERNANCE & SELF-HEALING LOOP                                │
│                                                                                             │
│  ┌─────────────────────────┐       ┌────────────────────────┐       ┌────────────────────┐  │
│  │   Human Review Console  │ ────► │  Audit Store (Port 8007)│ ────► │ Immune System      │  │
│  │   (Port 8008 / Ingress &│       │  (Bi-directional trace │       │ (Port 8009 / Auto  │  │
│  │    Egress Escalations)  │       │   & Precision Metrics) │       │  Policy Proposals) │  │
│  └─────────────────────────┘       └────────────────────────┘       └─────────┬──────────┘  │
│                                                                               │             │
│                                    ┌────────────────────────┐                 │             │
│                                    │ Hot-Reload Policy Eng. │ ◄───────────────┘             │
│                                    │ (1-Click Accept/Apply) │                               │
│                                    └────────────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Enterprise Readiness & Design Highlights

### 1. Perimeter-Decoupled Sanitization
* **The Multi-Agent Challenge:** Intercepting internal agent thoughts, vector lookups, and sub-tool executions introduces latency explosions and false-positive blocks that break multi-agent reasoning loops.
* **Our Solution:** ControlPlane.ai operates strictly at the perimeter boundary:
  1. Sanitizes and validates the **initial user input** (Ingress).
  2. Allows internal agent workflows, LangGraph nodes, and tools to execute uninterrupted.
  3. Sanitizes and audits the **final response** before delivering it to the client (Egress).

### 2. Zero-Latency Asynchronous Human Verification
* When an interaction trips a warning threshold (`FLAG` or `ESCALATE`), the Gateway **does not block or stall the user**.
* The request is executed through downstream models and streamed to the user immediately, while an asynchronous task registers the interaction in the **Human Review Console** (`/review`).

### 3. Closed-Loop Immune System (Self-Healing Governance)
* After observing 10+ interaction telemetry events and operator review outcomes, the **Immune System** analyzes score clustering:
  * If a high density of toxic prompts or injection attempts occur at score `0.80` and human operators confirm them as violations, the Immune System generates an automated proposal to lower the block threshold (e.g., `0.90` $\rightarrow$ `0.80`).
  * Compliance operators can review the empirical justification and click **"Accept & Apply"** in the Policy Editor, instantly hot-reloading the Policy Engine without restarting any microservice.

### 4. Zero DB Reads on Frontend Route Switching
* All interactive session state, telemetry envelopes, and chat logs are managed via a client-side in-memory store (`PlaygroundContext.tsx`), guaranteeing **0 redundant database queries** and **0 storage thrashing** during operator navigation.

---

## Architecture (12 Components)

| # | Component | Port | Purpose |
|---|-----------|------|---------|
| 01 | **API Gateway** | 8000 | Ingress gateway, proxy orchestrator, async audit dispatcher |
| 02 | **Semantic Router & LB** | 8005 | Dynamic endpoint registry, semantic intent search over prompt instructions, multi-agent load balancing |
| 03 | **Model Adapter** | 8006 | Provider-agnostic model execution via OpenRouter (`google/gemini-2.5-flash`, `gpt-4o-mini`, etc.) |
| 04 | **Input Guard** | 8001 | Ingress perimeter firewall: prompt injection, toxicity, secrets detection (`detect-secrets`), PII |
| 05 | **Output Guard** | 8002 | Egress perimeter firewall: hallucination verification (AI-as-judge), system prompt leakage, sensitive data, toxicity |
| 06 | **PII Service** | 8003 | Shared PII detection & anonymization (Presidio NLP + contextual regex fallback) |
| 07 | **Policy Engine** | 8004 | Versioned YAML-driven policy evaluator with hierarchical wildcard matching and dynamic thresholds |
| 08 | **Immune System** | 8009 | Telemetry analyzer, anomaly detection (block rate, escalation drift), automated self-healing threshold proposals |
| 09 | **Human Review Console** | 8008 | Escalation queue with human-in-the-loop review (Approve, Deny, Edit) establishing real ground truth |
| 10 | **Audit Store** | 8007 | Append-only event store with bidirectional `input`/`output` indexing and statistical analytics |
| 11 | **Trust Dashboard** | 3000 | Live visualization of Composite Trust Scores (0–100), 7-day intervention trends, and decision breakdowns |
| 12 | **Action Guard** | 8010 | Agentic tool-call gating with blast radius classification (read-only, reversible, irreversible) |

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | Python 3.11+, FastAPI, Uvicorn | High-throughput asynchronous I/O, OpenAPI compliance |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui | Production-grade UI, reactive components, responsive layout |
| Guardrails | Microsoft Presidio, detect-secrets, Heuristics | Industry-standard security and compliance scanners |
| Routing & LLM | OpenRouter API + Google Gemini SDK | Semantic workload routing and multi-model failover |
| Storage & Telemetry | SQLite (aiosqlite) / PostgreSQL | Append-only audit events and human review feedback |
| State Management | React Context (In-Memory RAM Store) | 0 DB reads and instant route transitions |

---

## Production Scaling Roadmap (Demo $\rightarrow$ Tier-1 Enterprise)

To scale from thousands of interactions to **millions of transactions per hour**, the architecture supports seamless drop-in replacements:

| Layer | Development / Prototype | Enterprise Production Target | Effort |
| :--- | :--- | :--- | :--- |
| **Audit Storage** | `aiosqlite` (Local SQLite) | **PostgreSQL / TimescaleDB / ClickHouse** | Plug-and-play DB connection string |
| **Audit Pipeline** | AsyncIO Fire-and-Forget | **Apache Kafka / RabbitMQ / AWS SQS** | Producer/Consumer decoupling |
| **Scanner Engines** | Heuristics + Presidio + regex | **ONNX Runtime / TensorRT / DeBERTa Models** | GPU-accelerated microsecond inference |
| **State / Cache** | In-Memory FastAPI | **Redis Cluster** (Distributed Rate Limiting & Session Locks) | Add Redis dependency |
| **Orchestration** | Local Shell Scripts (`start_services.sh`) | **Kubernetes (Helm Charts) + HPA (Auto-scaling)** | Containerize isolated port services |

---

## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- An OpenRouter API key (get one at [openrouter.ai](https://openrouter.ai))

### 1. Clone and Configure

```bash
git clone <repo-url>
cd Caelestia

# Copy environment template and add your API keys
cp .env.example .env
# Edit .env — at minimum, set OPENROUTER_API_KEY
```

### 2. Install Dependencies

```bash
# Backend Virtual Environment
python3 -m venv venv
source venv/bin/activate
pip install -e .

# Download spaCy model for PII detection
python3 -m spacy download en_core_web_sm

# Frontend Dependencies
cd frontend
npm install
cd ..
```

### 3. Start Microservices Cluster

```bash
# Start all 11 backend microservices
./start_services.sh

# Start Frontend (in separate terminal)
cd frontend
npm run dev
# → Open http://localhost:3000
```

### 4. Stop Services

```bash
./stop_services.sh
```

---

## API Usage

### 1. Chat Completions (Governed Pipeline)

```bash
curl -X POST http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{"role": "user", "content": "How do I update billing information?"}],
    "use_case": "customer_support",
    "geography": "US"
  }'
```

Response includes the AI completion **plus** full perimeter telemetry:

```json
{
  "interaction_id": "803be20c-34a4-420b-bb3c-7e8cff794bed",
  "content": "To update your billing information...",
  "model_used": "google/gemini-2.5-flash",
  "decision": {
    "action": "allow",
    "reason": "All checks passed",
    "policy_version": "805ffb6e"
  },
  "checks_summary": [
    {"check_name": "prompt_injection", "score": 0.0, "verdict": "pass"},
    {"check_name": "toxicity", "score": 0.0, "verdict": "pass"},
    {"check_name": "secrets", "score": 0.0, "verdict": "pass"},
    {"check_name": "pii", "score": 0.0, "verdict": "pass"}
  ],
  "risk": {"tier": "low", "confidence": 0.0},
  "latency_ms": 1120.4
}
```

### 2. Self-Healing Immune System Proposals

```bash
# Check auto-generated policy proposals based on 10+ interaction telemetry
curl http://localhost:8000/v1/health/proposals

# Accept and hot-reload policy proposal with 1 click
curl -X POST http://localhost:8000/v1/health/proposals/prop_toxicity_080/accept
```

### 3. Semantic Workflow Endpoints (Load Balancer)

```bash
# Register or update an enterprise workflow endpoint
curl -X POST http://localhost:8000/v1/router/endpoints \
  -H "Content-Type: application/json" \
  -d '{
    "id": "billing_agent",
    "name": "Billing & Invoice Workflow",
    "instructions": "Assists users with payment disputes, invoices, and credit card updates.",
    "target_model_or_url": "google/gemini-2.5-flash",
    "use_case": "customer_support",
    "keywords": ["billing", "invoice", "payment", "card", "refund"],
    "weight": 1.0,
    "active": true
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
│   ├── output_guard/           # 05 - Output Guard (port 8002)
│   ├── pii_service/            # 06 - PII Detection (port 8003)
│   ├── policy_engine/          # 07 - Policy Engine (port 8004)
│   │   └── config/policies/    #   Versioned YAML policy definitions
│   ├── router/                 # 02 - Router & LB (port 8005)
│   ├── adapter/                # 03 - Model Adapter (port 8006)
│   ├── audit_store/            # 10 - Audit Store (port 8007)
│   ├── review_console/         # 09 - Human Review (port 8008)
│   ├── immune_system/          # 08 - Immune System (port 8009)
│   └── action_guard/           # 12 - Action Guard (port 8010)
├── frontend/                   # React 18 + TypeScript + Vite Dashboard
│   └── src/
│       ├── context/            # In-memory PlaygroundContext
│       ├── pages/              # Playground, Audit Trail, Human Review,
│       │                       # Trust Dashboard, Policy Editor, Load Balancer
│       ├── components/         # shadcn/ui components & layouts
│       └── lib/                # API client and formatting utilities
├── data/                       # Append-only SQLite database
├── start_services.sh           # Cluster startup script
├── stop_services.sh            # Cluster shutdown script
└── README.md                   # This file
```

---

## License

MIT — Built for the Accenture Innovation Challenge 2026.
