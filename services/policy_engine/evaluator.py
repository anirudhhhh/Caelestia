import sys
from pathlib import Path
from typing import Any, Dict

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from shared.schemas import (
    PolicyDecisionRequest, PolicyDecisionResponse, Decision,
    DecisionAction, RiskAssessment, RiskTier, CheckVerdict
)

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
        for p in self.policies:
            if p.get("use_case") == use_case and p.get("geography") == geography and p.get("check") == check_name:
                return p
        return {
            "block_threshold": self.defaults.get("block_threshold", 0.7),
            "flag_threshold": self.defaults.get("flag_threshold", 0.4),
            "on_timeout": self.defaults.get("on_timeout", "block")
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

            block_thresh = policy.get("block_threshold", 0.7)
            flag_thresh = policy.get("flag_threshold", 0.4)

            # Assign verdicts dynamically based on thresholds for robust handling
            if score >= block_thresh:
                check.verdict = CheckVerdict.FAIL
            elif score >= flag_thresh:
                check.verdict = CheckVerdict.WARN
            else:
                check.verdict = CheckVerdict.PASS

            if check.verdict == CheckVerdict.FAIL:
                return self._create_response(DecisionAction.BLOCK, f"Failed {check.check_name} check (score: {score:.2f} >= {block_thresh})", RiskTier.HIGH, score)
            
            if check.verdict == CheckVerdict.WARN:
                warn_count += 1
                reasons.append(f"Warning on {check.check_name} (score: {score:.2f})")
        
        # Compound logic
        if warn_count > 1:
            return self._create_response(DecisionAction.ESCALATE, f"Multiple warnings: {', '.join(reasons)}", RiskTier.MEDIUM, highest_score)
        elif warn_count == 1:
            return self._create_response(DecisionAction.FLAG, reasons[0], RiskTier.MEDIUM, highest_score)
        
        return self._create_response(DecisionAction.ALLOW, "All checks passed", RiskTier.LOW, highest_score)

    def _create_response(self, action: DecisionAction, reason: str, tier: RiskTier, confidence: float) -> PolicyDecisionResponse:
        return PolicyDecisionResponse(
            decision=Decision(
                action=action,
                reason=reason,
                policy_version=self.version,
                decided_by="policy_engine",
                confidence=confidence
            ),
            risk=RiskAssessment(
                tier=tier,
                confidence=confidence
            )
        )

def load_policies(data: Dict[str, Any], version: str) -> PolicyEvaluator:
    evaluator = PolicyEvaluator()
    evaluator.update_policies(data, version)
    return evaluator
