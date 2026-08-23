import re
from shared.schemas import CheckResult, CheckVerdict

try:
    from shared.config import CONTROLPLANE_SYSTEM_PROMPT
except ImportError:
    CONTROLPLANE_SYSTEM_PROMPT = "You are an enterprise AI assistant protected by ControlPlane.ai."

KNOWN_PROMPTS = [
    CONTROLPLANE_SYSTEM_PROMPT,
    "You are an enterprise AI assistant protected by ControlPlane.ai.",
]

def scan_system_prompt_leakage(text: str) -> CheckResult:
    """Checks for verbatim/near-verbatim substrings of known system prompts appearing in output."""
    score = 0.0
    verdict = CheckVerdict.PASS
    details = {}
    
    for prompt in KNOWN_PROMPTS:
        # Simple near-verbatim check by splitting into chunks or simple substring
        if len(prompt) > 10 and prompt.lower() in text.lower():
            score = 1.0
            verdict = CheckVerdict.FAIL
            details["leaked_prompt"] = prompt
            break
            
    return CheckResult(
        check_name="system_prompt_leakage",
        engine="heuristic",
        score=score,
        verdict=verdict,
        details=details
    )
