export type UseCase =
  | "customer_support"
  | "internal_copilot"
  | "decision_support";
export type Geography = "US" | "EU" | "IN";
export type Direction = "input" | "output";
export type RiskTier = "low" | "medium" | "high";
export type CheckVerdict = "pass" | "warn" | "fail" | "error";
export type DecisionAction = "allow" | "block" | "flag" | "escalate";
export type BlastRadius = "low" | "medium" | "high";

export interface Payload {
  role?: string;
  content: string;
  metadata?: Record<string, any>;
  attachments?: any[];
}

export interface ToolCall {
  name: string;
  arguments: string;
}

export interface CheckResult {
  check_name: string;
  engine: string;
  verdict: CheckVerdict;
  score: number;
  details?: Record<string, any>;
  latency_ms: number;
}

export interface RiskAssessment {
  tier: RiskTier;
  confidence: number;
  blast_radius: BlastRadius;
  reasoning: string;
}

export interface Decision {
  action: DecisionAction;
  reason: string;
  confidence: number;
  policy_version: string;
}

export interface InteractionEnvelope {
  interaction_id: string;
  timestamp: string;
  use_case: UseCase;
  geography: Geography;
  direction: Direction;
  payload: Payload;
  checks: CheckResult[];
  risk_assessment: RiskAssessment;
  decision: Decision;
  latency_breakdown: Record<string, number>;
  model_used?: string;
}

export interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  use_case: UseCase;
  geography: Geography;
  model?: string;
  session_id?: string;
  max_tokens?: number;
}

export interface ChatResponse {
  interaction_id: string;
  session_id: string;
  content: string;
  model_used?: string;
  decision: Decision;
  checks_summary: CheckResult[];
  risk: Pick<RiskAssessment, "tier" | "confidence">;
  latency_ms: number;
  tool_results: Record<string, any>[];
}

export interface EscalationItem {
  interaction_id: string;
  session_id?: string;
  direction?: Direction | string;
  use_case: UseCase;
  geography?: Geography;
  risk_tier: RiskTier;
  escalation_reason: string;
  time_in_queue?: number;
  created_at?: string;
  status: "pending" | "in_review" | "resolved";
  resolution?: "approve" | "deny" | "edit_approve" | string;
  resolved_by?: string;
  resolved_at?: string;
  resolution_reason?: string;
  was_original_flag_correct?: boolean;
  edited_content?: string;
  payload?: Payload;
  checks?: CheckResult[];
  interaction?: InteractionEnvelope;
}

export type ReviewAction = "approve" | "deny" | "edit_approve";

export interface AnomalyAlert {
  id: string;
  severity: "low" | "medium" | "high";
  metric: string;
  current_value: number;
  baseline_value: number;
  timestamp: string;
}

export interface ThresholdProposal {
  id: string;
  proposal_id?: string;
  use_case?: string;
  geography?: string;
  check_name: string;
  current_threshold: number;
  proposed_threshold: number;
  reason?: string;
  justification?: string;
  status?: string;
}

export interface AuditEvent {
  interaction_id: string;
  timestamp: string;
  use_case: UseCase;
  geography: Geography;
  direction: Direction;
  decision_action: DecisionAction;
  risk_tier: RiskTier;
  interaction: InteractionEnvelope;
}

export interface HumanOutcome {
  action: ReviewAction;
  reason: string;
  was_original_flag_correct: boolean;
  timestamp: string;
}

export interface PolicyRule {
  id?: string;
  use_case: UseCase | "*";
  geography: Geography | "*";
  check_name: string;
  block_threshold: number;
  flag_threshold: number;
  on_timeout: "allow" | "block";
}

export interface WorkflowEndpoint {
  id: string;
  name: string;
  instructions: string;
  target_model_or_url: string;
  use_case: UseCase | "general" | string;
  keywords: string[];
  weight: number;
  active: boolean;
}

export interface RoutingCandidate {
  endpoint?: string;
  id?: string;
  name?: string;
  model?: string;
  target?: string;
  score: number;
  reason?: string;
  matched_keywords?: string[];
  use_case?: string;
}
