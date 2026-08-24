"""
ControlPlane.ai — Shared Data Contracts (InteractionEnvelope)

This is THE interface contract every component reads/writes.
Agree on this schema before writing service code — it's what lets
components 01–12 be built in parallel.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ─── Enums ────────────────────────────────────────────────────────────────────

class UseCase(str, Enum):
    CUSTOMER_SUPPORT = "customer_support"
    INTERNAL_COPILOT = "internal_copilot"
    DECISION_SUPPORT = "decision_support"


class Geography(str, Enum):
    US = "US"
    EU = "EU"
    IN = "IN"
    UK = "UK"
    GLOBAL = "GLOBAL"


class Direction(str, Enum):
    INPUT = "input"
    OUTPUT = "output"


class PayloadRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"


class RiskTier(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class CheckVerdict(str, Enum):
    PASS = "pass"
    WARN = "warn"
    FAIL = "fail"
    SKIPPED = "skipped"


class DecisionAction(str, Enum):
    ALLOW = "allow"
    EDIT = "edit"
    FLAG = "flag"
    BLOCK = "block"
    ESCALATE = "escalate"
    REROUTE = "reroute"


class ToolGuardVerdict(str, Enum):
    ALLOW = "allow"
    BLOCK = "block"
    ESCALATE = "escalate"


class BlastRadius(str, Enum):
    READ_ONLY = "read_only"
    REVERSIBLE_WRITE = "reversible_write"
    IRREVERSIBLE_ACTION = "irreversible_action"


# ─── Sub-models ───────────────────────────────────────────────────────────────

class Payload(BaseModel):
    """The actual content being checked — user message, assistant response, or tool output."""
    role: PayloadRole
    content: str
    attachments: list[dict[str, Any]] = Field(default_factory=list)


class ModelInfo(BaseModel):
    """Tracks which model was requested vs. actually used, for audit trail."""
    requested: Optional[str] = None
    routed_to: Optional[str] = None
    provider: Optional[str] = None
    adapter_version: str = "1.0.0"
    routing_trace: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Full candidate ranking for 'why did it pick this model' explainability"
    )


class RiskAssessment(BaseModel):
    """Risk tier and confidence — written ONLY by the Policy Engine."""
    tier: RiskTier = RiskTier.LOW
    confidence: float = 0.0


class CheckResult(BaseModel):
    """Result of a single safety check (prompt injection, toxicity, PII, hallucination, etc.)."""
    check_name: str = Field(
        ...,
        description="e.g. prompt_injection, toxicity, pii, hallucination, brand_safety, secret_leakage"
    )
    engine: str = Field(
        ...,
        description="e.g. llm-guard, presidio, judge-model, retrieval-verify, custom"
    )
    engine_version: str = "1.0.0"
    score: float = Field(0.0, ge=0.0, le=1.0)
    verdict: CheckVerdict = CheckVerdict.PASS
    latency_ms: float = 0.0
    details: dict[str, Any] = Field(default_factory=dict)


class Decision(BaseModel):
    """
    The governed decision — allow/edit/flag/block/escalate.
    Written ONLY by the Policy Engine (07). No other component should set this.
    """
    action: DecisionAction = DecisionAction.ALLOW
    reason: str = ""
    policy_version: str = ""
    decided_by: str = Field(
        "policy_engine",
        description="'policy_engine' or 'human:<user_id>'"
    )
    confidence: float = 0.0


class ToolCall(BaseModel):
    """A tool/action call made by an AI agent — gated by the Action Guard (12)."""
    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    blast_radius: BlastRadius = BlastRadius.READ_ONLY
    guard_verdict: ToolGuardVerdict = ToolGuardVerdict.ALLOW
    guard_reason: str = ""


# ─── Main Envelope ────────────────────────────────────────────────────────────

class InteractionEnvelope(BaseModel):
    """
    The core data contract for ControlPlane.ai.

    Every component reads and/or writes this object.
    It flows through the entire pipeline:
    App → Gateway → Input Guard → Router → Adapter → Model → Output Guard → Gateway → App

    Both input-side and output-side checks write into checks[];
    they don't overwrite each other.
    """
    # Identifiers
    interaction_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    parent_interaction_id: Optional[str] = None

    # Context
    use_case: UseCase = UseCase.CUSTOMER_SUPPORT
    geography: Geography = Geography.US
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    latency_budget_ms: int = 800

    # Direction & content
    direction: Direction = Direction.INPUT
    payload: Payload

    # Model routing info
    model: ModelInfo = Field(default_factory=ModelInfo)

    # Risk & checks — populated by Guards, decided by Policy Engine
    risk: RiskAssessment = Field(default_factory=RiskAssessment)
    checks: list[CheckResult] = Field(default_factory=list)

    # Decision — set ONLY by Policy Engine
    decision: Decision = Field(default_factory=Decision)

    # Tool/action calls — populated by agent frameworks, gated by Action Guard
    tool_calls: list[ToolCall] = Field(default_factory=list)

    # Extensible metadata
    metadata: dict[str, Any] = Field(default_factory=dict)


# ─── API Request/Response Models ─────────────────────────────────────────────

class ChatMessage(BaseModel):
    """Standard chat message for the Gateway API (OpenAI-compatible shape)."""
    role: str = "user"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    model: Optional[str] = None
    use_case: UseCase = UseCase.CUSTOMER_SUPPORT
    geography: Geography = Geography.US
    session_id: Optional[str] = None
    stream: bool = False
    max_tokens: Optional[int] = None
    tool_calls: list[ToolCall] = Field(default_factory=list)

class ChatResponse(BaseModel):
    """Response from the Gateway API."""
    interaction_id: str
    session_id: str
    content: str
    model_used: Optional[str] = None
    decision: Decision
    checks_summary: list[dict[str, Any]] = Field(default_factory=list)
    risk: RiskAssessment = Field(default_factory=RiskAssessment)
    latency_ms: float = 0.0
    tool_results: list[dict[str, Any]] = Field(default_factory=list)


# ─── PII Service Models ──────────────────────────────────────────────────────

class PIIDetectRequest(BaseModel):
    text: str
    geography: Geography = Geography.US
    entity_types: Optional[list[str]] = None


class PIIEntity(BaseModel):
    entity_type: str
    start: int
    end: int
    score: float


class PIIDetectResponse(BaseModel):
    entities: list[PIIEntity]
    latency_ms: float


class PIIAnonymizeRequest(BaseModel):
    text: str
    geography: Geography = Geography.US
    action: str = "redact"  # redact | mask | hash | synthetic


class PIIAnonymizeResponse(BaseModel):
    anonymized_text: str
    entities_found: list[PIIEntity]
    latency_ms: float


# ─── Policy Engine Models ────────────────────────────────────────────────────

class PolicyDecisionRequest(BaseModel):
    interaction_id: str
    use_case: UseCase
    geography: Geography
    direction: Direction
    checks: list[CheckResult]
    tool_calls: list[ToolCall] = Field(default_factory=list)


class PolicyDecisionResponse(BaseModel):
    decision: Decision
    risk: RiskAssessment
    checks: list[CheckResult] = Field(default_factory=list)


# ─── Human Review Models ─────────────────────────────────────────────────────

class EscalationItem(BaseModel):
    interaction_id: str
    session_id: str
    direction: Direction = Direction.INPUT
    use_case: UseCase
    geography: Geography
    risk_tier: RiskTier
    escalation_reason: str
    checks: list[CheckResult]
    payload: Payload
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    status: str = "pending"  # pending | in_review | resolved


class ReviewAction(BaseModel):
    interaction_id: Optional[str] = None   
    reviewer_id: str = "demo_reviewer"     
    action: str  # approve | deny | edit_approve
    was_original_flag_correct: bool
    reason: str
    edited_content: Optional[str] = None


# ─── Audit Store Models ──────────────────────────────────────────────────────

class AuditEvent(BaseModel):
    interaction_id: str
    session_id: str
    direction: str
    use_case: str
    geography: str
    envelope: dict[str, Any]
    decision_action: Optional[str] = None
    policy_version: Optional[str] = None
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class HumanOutcome(BaseModel):
    interaction_id: str
    reviewer_id: str
    action: str
    was_original_flag_correct: bool
    reason: str
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


# ─── Immune System Models ────────────────────────────────────────────────────

class AnomalyAlert(BaseModel):
    alert_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    metric_name: str
    model: Optional[str] = None
    use_case: Optional[str] = None
    current_value: float
    baseline_mean: float
    baseline_std: float
    sigma_breach: float
    severity: str = "warning"  # warning | critical
    action_taken: Optional[str] = None
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


class ThresholdProposal(BaseModel):
    proposal_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    use_case: UseCase
    geography: Geography
    check_name: str
    current_threshold: float
    proposed_threshold: float
    justification: str
    supporting_data: dict[str, Any] = Field(default_factory=dict)
    status: str = "pending"  # pending | approved | rejected
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )


# ─── Latency Budget Helpers ──────────────────────────────────────────────────

LATENCY_BUDGETS: dict[UseCase, dict[str, int]] = {
    UseCase.CUSTOMER_SUPPORT: {
        "total": 800,
        "input_guard": 150,
        "routing": 20,
        "model_call": 600,
        "output_guard": 80,
        "headroom": 40,
    },
    UseCase.INTERNAL_COPILOT: {
        "total": 2500,
        "input_guard": 150,
        "routing": 30,
        "model_call": 2000,
        "output_guard": 250,
        "headroom": 70,
    },
    UseCase.DECISION_SUPPORT: {
        "total": 10000,
        "input_guard": 500,
        "routing": 50,
        "model_call": 6000,
        "output_guard": 3000,
        "headroom": 450,
    },
}


DEFAULT_MAX_TOKENS: dict[UseCase, int] = {
    UseCase.CUSTOMER_SUPPORT: 500,
    UseCase.INTERNAL_COPILOT: 1500,
    UseCase.DECISION_SUPPORT: 4000,
}

def get_default_max_tokens(use_case: UseCase) -> int:
    return DEFAULT_MAX_TOKENS.get(use_case, 500)

def get_latency_budget(use_case: UseCase, stage: str) -> int:
    """Get the latency budget in ms for a specific pipeline stage."""
    return LATENCY_BUDGETS.get(use_case, LATENCY_BUDGETS[UseCase.CUSTOMER_SUPPORT]).get(stage, 100)
