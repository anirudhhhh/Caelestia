# ControlPlane.ai — Master Project Architecture & Context Specification

> **The Enterprise Responsible AI Control Plane — Real-time Middleware that Evaluates, Governs, Routes, and Audits Every AI Interaction.**
> **Team Caelestia | Accenture Innovation Challenge 2026**

---

## 1. System Overview & Core Philosophy

ControlPlane.ai is an enterprise-grade AI governance middleware and security firewall positioned at the network boundary between client applications and downstream large language models (LLMs) or autonomous multi-agent workflows.

### Architectural Principles
1. **Perimeter-Decoupled Boundary Inspection:**
   ControlPlane inspects interactions strictly at ingress (user prompt) and egress (model response). It never intercepts internal agent chain-of-thought, intermediate LangGraph tool steps, or sub-agent scratchpads, eliminating false-positive blocks and latency explosions.
2. **Strict Separation of Detection vs. Decision:**
   Scanners and neural ML classifiers act purely as stateless feature extractors (returning continuous calibrated scores $0.0 \dots 1.0$). A centralized, hot-reloading Policy Engine evaluates enterprise rules, risk tiers, and use-case thresholds to render `ALLOW`, `FLAG`, `BLOCK`, or `ESCALATE` decisions.
3. **Zero Plaintext Secret Storage:**
   Enterprise secrets and proprietary keys are never stored in plaintext. Ingress and egress text are evaluated against Gitleaks signatures, Shannon entropy thresholds ($H \ge 4.30$ bits/char), and salted HMAC-SHA256 fingerprints.
4. **Policy-Gated PII Passing (Zero Forced Redaction):**
   Forced tokenization/redaction (replacing text with placeholders like `[EMAIL_1]`) was eliminated to prevent downstream workflow failures. Permitted PII passes raw and intact when authorized by policy. Prohibited PII (e.g. SSNs, payment cards, Indian PAN/Aadhaar) triggers an immediate, deterministic perimeter block.
5. **Asynchronous Zero-Latency Human Review & Closed-Loop Immune System:**
   Flagged interactions are streamed to clients with warning badges without blocking execution, while asynchronously registering an escalation in the Review Console. Operator resolutions feed ground truth into the self-healing Immune System to optimize threshold boundaries ($\mu \pm k\sigma$) and seed 384-d vector embeddings.

---

## 2. Microservice Topology & Port Map

ControlPlane.ai runs as a 12-microservice distributed cluster with a React 18 frontend:

| Port | Service Name | Entrypoint File | Primary Role & Core Technology |
|---|---|---|---|
| `8000` | **API Gateway** | `services/gateway/app.py` | Ingress proxy orchestrator, async audit dispatcher, OpenAI-compatible `/v1/chat/completions`. |
| `8001` | **Input Guard** | `services/input_guard/app.py` | 4-Stage Ingress Firewall (L0 Normalization, L1 Lexicon, L2 Neural ML, L3 Vector Store). |
| `8002` | **Output Guard** | `services/output_guard/app.py` | 5-Layer Egress Firewall (Secrets generation, System prompt leakage, Toxicity, PII). |
| `8003` | **PII Service** | `services/pii_service/app.py` | Microsoft Presidio NER + Regex Recognizers (EMAIL, PHONE, ADDRESS, SSN, PAN, AADHAAR, CARDS). |
| `8004` | **Policy Engine** | `services/policy_engine/app.py` | Hot-reloading declarative YAML compiler (`policies.yaml`), SHA-256 versioning, multi-tenant rules. |
| `8005` | **Semantic Router & LB** | `services/router/app.py` | 384-d Vector Semantic Index (`all-MiniLM-L6-v2`) + BM25 hybrid matching + geographic residency. |
| `8006` | **Model Adapter** | `services/adapter/app.py` | Dual-provider executor (Native Google Gemini 3.6 Flash API + OpenRouter failover + synthetic). |
| `8007` | **Audit Store** | `services/audit_store/app.py` | Append-only cryptographically hashed ledger (`merkle_root`, `previous_hash`, SQLite). |
| `8008` | **Review Console** | `services/review_console/app.py` | Escalation triage queue for human-in-the-loop verification (Approve, Deny, Edit). |
| `8009` | **Immune System** | `services/immune_system/app.py` | Telemetry statistical analyzer, $\sigma$-anomaly detector, automated threshold self-healing proposals. |
| `8010` | **Action Guard** | `services/action_guard/app.py` | Autonomous agent tool-call gating with cumulative session risk tracking and blast radius tiers. |
| `8011` | **Guardrails ML** | `services/guardrails_ml/app.py` | Neural sequence classifier runtime, 384-d attack vector store, continuous calibrated softmax. |
| `3000` | **Frontend Dashboard** | `frontend/` | React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui dashboard. |

---

## 3. Defense-in-Depth Firewall Architecture

### Ingress Pipeline (Input Guard - Port 8001)
```
Input Prompt -> [L0: Unicode NFKC / Homoglyph / AST Unpack]
             -> [L1: Aho-Corasick / Fast Keyword Match] (<1ms)
             -> [L2: Fine-Tuned Transformer Sequence Classifier] (5-15ms)
             -> [L3: 384-d Dense Vector Cosine Similarity Search] (2-5ms)
             -> Policy Engine Decision
```

1. **Layer 0 — Canonical Text Normalization:**
   * Unicode NFKC normalization, homoglyph translation (`1gn0re` $\rightarrow$ `ignore`), zero-width space stripping.
   * Base64 / Hex / URL decoding.
   * AST code string unrolling (e.g. `'ig' + 'nore ' + 'rules'`).
2. **Layer 1 — Deterministic Fast Patterns:**
   * Multi-tier Aho-Corasick pattern matcher detecting instruction overrides, DAN triggers, delimiter injections (`</system_instruction>`, ```` ```system ````).
3. **Layer 2 — Neural Sequence Classification:**
   * Bidirectional encoder transformer (`models/prompt_injection_deberta` and `models/toxicity_roberta`).
   * Evaluates cognitive jailbreaks, roleplay bypasses, and reframed hostility in a single forward pass.
   * Emits calibrated softmax probabilities $P(\text{class}) \in [0.0, 1.0]$.
4. **Layer 3 — Semantic Attack Vector Store:**
   * 384-dimensional dense vector embeddings (`sentence-transformers/all-MiniLM-L6-v2`).
   * Real-time cosine similarity against seed attack corpus and dynamically ingested human-reviewed zero-days.

### Egress Pipeline (Output Guard - Port 8002)
1. **Output Secrets & Differential Re-Leak Detection:**
   * Gitleaks pattern matching for AWS keys (`AKIA...`), OpenAI keys (`sk-proj-...`), GitHub PATs (`ghp_...`), Slack tokens, Stripe secrets, RSA private keys, Database URIs.
   * Shannon Entropy calculation on candidate tokens ($\ge 20$ chars, $H \ge 4.30$ bits/char).
   * 3-part Base64URL JWT verification and Luhn algorithm ($mod\ 10$) validation.
   * Input-Output Differential Re-leak: detects if the LLM repeats confidential input credentials.
2. **Multi-Tier System Prompt Leakage Scanner:**
   * **Canary Tripwires:** Recognizes synthetic canary tokens (e.g. `[CP-CANARY-...]`).
   * **Semantic Cosine Similarity:** Splits active session `system_prompt` and model output into proposition sentences, measuring dense vector similarity ($\ge 0.80$).
   * **Longest Common Subsequence (LCS):** Matches consecutive token reuse ($\ge 6$ words).
   * **Sliding 4-Gram Jaccard Matrix:** Computes n-gram overlap against system instructions.
   * **Meta-Exfiltration Intent:** Catches phrase prefixes like `"My developer instructions are: ..."`.

---

## 4. Machine Learning Models & 5-Fold Cross-Validation

The project includes an in-house native PyTorch training suite (`train/`):

### Model Specifications
* **Base Architecture:** `sentence-transformers/all-MiniLM-L6-v2` (6 layers, 384 hidden dimensions, 12 attention heads, ~22.7M parameters).
* **Inference Hardware:** Apple Silicon Metal Performance Shaders (`MPS`) / CUDA / CPU with auto-detection.
* **Inference Latency:** P50 $< 8\text{ms}$, P99 $< 80\text{ms}$.

### 5-Fold Stratified Cross-Validation Benchmark Results

```
=====================================================================================
5-FOLD CV METRIC          | PROMPT INJECTION (Mean ± Std) | CONTEXTUAL TOXICITY (Mean ± Std)
-------------------------------------------------------------------------------------
Accuracy                  |   91.6% ±  5.4%               |   96.9% ±  3.8%
Precision                 |   91.6% ±  8.5%               |   93.8% ±  7.6%
Recall                    |   94.0% ±  8.0%               |  100.0% ±  0.0%
F1 Score                  |   0.9222 ± 0.0476             |   0.9664 ± 0.0413
ROC-AUC                   |   0.9867                     |   1.0000
Total CV Time (5 Folds)   |   49.2s                       |   33.3s
=====================================================================================
```

* **Contextual Technical Disambiguation:** 0% False Positive Rate on technical DevOps/SQL commands (`kill -9 PID`, `drop table`, `terminate worker`, `destroy cluster`, `abort transaction`) and idioms (`To Kill a Mockingbird`, `Killer Bunnies`, `Killer feature`).

---

## 5. Primary Data Schemas & Contracts

All services communicate via Pydantic schemas in `shared/schemas.py`:

### InteractionEnvelope (Core Wire Protocol)
```python
class InteractionEnvelope(BaseModel):
    interaction_id: str
    session_id: str
    use_case: UseCase          # customer_support | internal_copilot | decision_support
    geography: Geography        # US | EU | IN
    direction: Direction        # input | output
    payload: Payload            # role, content
    model: ModelConfig          # requested, routed_to, provider, temperature
    decision: Decision          # action, reason, policy_version, decided_by, confidence
    risk: RiskAssessment        # tier, score, factors
    checks: list[CheckResult]   # check_name, engine, score, verdict, latency_ms, details
    tool_calls: list[ToolCall]  # tool_name, arguments, blast_radius, guard_verdict
    metadata: dict[str, Any]
```

### CheckResult & Decision Verdicts
```python
class CheckVerdict(str, Enum):
    PASS = "pass"
    WARN = "warn"
    FAIL = "fail"

class DecisionAction(str, Enum):
    ALLOW = "allow"
    FLAG = "flag"
    BLOCK = "block"
    ESCALATE = "escalate"
```

---

## 6. Commands & Verification Guide

### 1. Start / Stop Services
```bash
./start_services.sh       # Boots 12 microservices with warmup
./stop_services.sh        # Clean shutdown and port release
```

### 2. Run Automated Firewall Test Suite
```bash
python3 test_firewall.py  # Runs 10 core verification scenarios (100% pass)
```

### 3. Run ML Training & Benchmarks
```bash
python3 train/train_full_kfold.py        # 5-Fold Stratified Cross Validation
python3 train/train_prompt_injection.py  # Prompt Injection training only
python3 train/train_toxicity.py          # Toxicity training only
python3 train/evaluate_guardrails.py     # Evaluation Benchmark
```

### 4. Docker Deployment
```bash
docker compose up --build -d             # Boots entire cluster + Frontend
docker compose down                      # Teardown
```

### 5. High-Concurrency Load Testing (Locust)
```bash
locust -f load_test/locustfile.py        # Web UI on http://localhost:8089
```

---

## 7. Deferred & Future Roadmap Items

1. **Hallucination & Groundedness Detection (Explicitly Deferred):**
   * PRD Specification: 3-state NLI claim verification engine (`SUPPORTED`, `CONTRADICTED`, `UNVERIFIED`) against in-band RAG evidence chunks. Currently on hold per design decisions.
2. **Large-Scale External Parquet Dataset Fine-Tuning:**
   * Optional scaling to 100k+ sample external datasets on cloud GPU clusters.
