import re
from shared.schemas import CheckResult, CheckVerdict

def scan_toxicity(text: str) -> CheckResult:
    """Profanity/harmful content check."""
    # Simple heuristic fallback
    profanity_list = ["fuck", "shit", "bitch", "asshole"]
    pattern = re.compile(r'\b(' + '|'.join(profanity_list) + r')\b', re.IGNORECASE)
    
    matches = pattern.findall(text)
    if matches:
        return CheckResult(
            check_name="toxicity",
            engine="heuristic",
            score=1.0,
            verdict=CheckVerdict.FAIL,
            details={"matches": matches}
        )
        
    return CheckResult(
        check_name="toxicity",
        engine="heuristic",
        score=0.0,
        verdict=CheckVerdict.PASS
    )

def scan_sensitive_data(text: str) -> CheckResult:
    """Checks for leaked secrets, internal URLs, etc."""
    # Dummy check for secrets like passwords or AWS keys
    secret_patterns = [
        r'AKIA[0-9A-Z]{16}', # AWS Key
        r'internal-api\.controlplane\.ai',
    ]
    
    for pattern in secret_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            return CheckResult(
                check_name="sensitive_data",
                engine="heuristic",
                score=1.0,
                verdict=CheckVerdict.FAIL,
                details={"pattern_matched": pattern}
            )
            
    return CheckResult(
        check_name="sensitive_data",
        engine="heuristic",
        score=0.0,
        verdict=CheckVerdict.PASS
    )
