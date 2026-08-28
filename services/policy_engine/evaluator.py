import sys
from pathlib import Path
from typing import Any, Dict

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from shared.config import setup_logging
from shared.schemas import (
    PolicyDecisionRequest, PolicyDecisionResponse, Decision,
    DecisionAction, RiskAssessment, RiskTier, CheckVerdict
)

logger = setup_logging("policy_evaluator")

class PolicyEvaluator:
    def __init__(self):
        self.policies = []
        self.defaults = {}
        self.version = "empty"

    def update_policies(self, data: Dict[str, Any], version: str):
        self.policies = data.get("policies", [])
        self.defaults = data.get("defaults", {
            "block_threshold": 0.7,
            "flag_threshold": 0.4,
            "on_timeout": "block"
        })
        self.version = version

    def get_policy(self, use_case: str, geography: str, check_name: str) -> Dict[str, Any]:
        # Support check name aliases across input and output guards
        aliases = [check_name]
        if check_name == "sensitive_data":
            aliases.append("secrets")
        elif check_name == "secrets":
            aliases.append("sensitive_data")
        elif check_name == "system_prompt_leakage":
            aliases.append("prompt_injection")

        for alias in aliases:
            # 1. Exact match (use_case + geography + check)
            for p in self.policies:
                p_check = p.get("check") or p.get("check_name")
                if p.get("use_case") == use_case and p.get("geography") == geography and p_check == alias:
                    return p
            # 2. Wildcard geography (use_case + * + check)
            for p in self.policies:
                p_check = p.get("check") or p.get("check_name")
                if p.get("use_case") == use_case and p.get("geography") in ("*", None) and p_check == alias:
                    return p
            # 3. Wildcard use_case (* + geography + check)
            for p in self.policies:
                p_check = p.get("check") or p.get("check_name")
                if p.get("use_case") in ("*", None) and p.get("geography") == geography and p_check == alias:
                    return p
            # 4. Global wildcard (* + * + check)
            for p in self.policies:
                p_check = p.get("check") or p.get("check_name")
                if p.get("use_case") in ("*", None) and p.get("geography") in ("*", None) and p_check == alias:
                    return p

        # 5. Default fallback
        return {
            "block_threshold": float(self.defaults.get("block_threshold", 0.85)),
            "flag_threshold": float(self.defaults.get("flag_threshold", 0.4)),
            "on_timeout": self.defaults.get("on_timeout", "allow_with_flag")
        }

    def evaluate(self, req: PolicyDecisionRequest) -> PolicyDecisionResponse:
        highest_score = 0.0
        warn_count = 0
        reasons = []

        for check in req.checks:
            policy = self.get_policy(req.use_case.value, req.geography.value, check.check_name)
            
            if check.verdict == CheckVerdict.SKIPPED:
                if policy.get("on_timeout") == "block":
                    return self._create_response(DecisionAction.BLOCK, f"Timeout on {check.check_name}", RiskTier.HIGH, 1.0)
                elif policy.get("on_timeout") == "allow_with_flag":
                    warn_count += 1
                    reasons.append(f"Timeout on {check.check_name}")
                continue

            score = check.score
            highest_score = max(highest_score, score)

            block_thresh = float(policy.get("block_threshold", 0.85))
            flag_thresh = float(policy.get("flag_threshold", 0.4))

            # Assign verdicts dynamically based on thresholds for robust handling
            if score >= block_thresh:
                check.verdict = CheckVerdict.FAIL
            elif score >= flag_thresh:
                check.verdict = CheckVerdict.WARN
            else:
                check.verdict = CheckVerdict.PASS

            logger.info(f"[{req.interaction_id}] Policy evaluated: use_case={req.use_case.value} geo={req.geography.value} check={check.check_name} (score={score:.2f}, block_thresh={block_thresh}, verdict={check.verdict.value})")

            if check.verdict == CheckVerdict.FAIL:
                trigger_layer = check.layer or check.engine or "L1_lexicon"
                if check.check_name == "pii" and check.details.get("blocked_pii"):
                    reason_msg = f"Blocked by enterprise PII policy: prohibited PII detected ({', '.join(check.details['blocked_pii'])})"
                else:
                    reason_msg = f"Failed {check.check_name} check (score: {score:.2f} >= {block_thresh})"
                return self._create_response(
                    DecisionAction.BLOCK,
                    reason_msg,
                    RiskTier.HIGH,
                    score,
                    checks=req.checks,
                    blocked_by_layer=trigger_layer
                )
            
            if check.verdict == CheckVerdict.WARN:
                warn_count += 1
                warn_layer = check.layer or check.engine or "L1_lexicon"
                reasons.append((f"Warning on {check.check_name} (score: {score:.2f})", warn_layer))
        
        # Compound logic
        if warn_count > 1:
            layers_str = ", ".join(r[1] for r in reasons)
            reasons_str = ", ".join(r[0] for r in reasons)
            return self._create_response(DecisionAction.ESCALATE, f"Multiple warnings: {reasons_str}", RiskTier.MEDIUM, highest_score, checks=req.checks, blocked_by_layer=reasons[0][1])
        elif warn_count == 1:
            return self._create_response(DecisionAction.FLAG, reasons[0][0], RiskTier.MEDIUM, highest_score, checks=req.checks, blocked_by_layer=reasons[0][1])
        
        return self._create_response(DecisionAction.ALLOW, "All checks passed", RiskTier.LOW, highest_score, checks=req.checks)

    def _create_response(self, action: DecisionAction, reason: str, tier: RiskTier, confidence: float, checks: list = None, blocked_by_layer: str = None) -> PolicyDecisionResponse:
        return PolicyDecisionResponse(
            decision=Decision(
                action=action,
                reason=reason,
                policy_version=self.version,
                decided_by="policy_engine",
                blocked_by_layer=blocked_by_layer,
                confidence=confidence
            ),
            risk=RiskAssessment(
                tier=tier,
                confidence=confidence
            ),
            checks=checks or []
        )

def load_policies(data: Dict[str, Any], version: str) -> PolicyEvaluator:
    evaluator = PolicyEvaluator()
    evaluator.update_policies(data, version)
    return evaluator
