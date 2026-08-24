import re
import tempfile
import time
from shared.schemas import CheckResult, CheckVerdict

try:
    from detect_secrets import SecretsCollection
    from detect_secrets.settings import default_settings
    HAS_DETECT_SECRETS = True
except ImportError:
    HAS_DETECT_SECRETS = False

# Full synchronized toxicity wordlists by severity
SEVERE_WORDS = {"hate", "kill", "murder", "fuck", "shit", "bitch", "asshole"}
MODERATE_WORDS = {"badword1", "badword2", "idiot", "bastard", "crap", "damn"}
MILD_WORDS = {"dumb", "stupid", "trash", "fool", "annoying", "useless", "shut up", "loser"}

def scan_toxicity(text: str) -> CheckResult:
    """Synchronized toxicity scanner for LLM output."""
    words = set(re.findall(r'\b\w+\b', text.lower()))
    
    severe_hits = words.intersection(SEVERE_WORDS)
    moderate_hits = words.intersection(MODERATE_WORDS)
    mild_hits = words.intersection(MILD_WORDS)

    all_hits = severe_hits | moderate_hits | mild_hits
    score = 0.0

    if severe_hits:
        score = min(0.85 + (len(severe_hits) - 1) * 0.1, 1.0)
    elif moderate_hits:
        score = min(0.80 + (len(moderate_hits) - 1) * 0.1, 0.95)
    elif mild_hits:
        score = min(0.45 + (len(mild_hits) - 1) * 0.1, 0.70)
        
    return CheckResult(
        check_name="toxicity",
        engine="wordlist_sync",
        score=round(score, 2),
        verdict=CheckVerdict.FAIL if score >= 0.8 else (CheckVerdict.WARN if score >= 0.4 else CheckVerdict.PASS),
        details={"matches": list(all_hits)} if all_hits else {}
    )

def scan_sensitive_data(text: str) -> CheckResult:
    """Scans LLM output for leaked secrets, API keys, and sensitive tokens using detect-secrets."""
    score = 0.0
    found_types = []

    # 1. detect-secrets scanner
    try:
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.txt', delete=True) as temp:
            temp.write(text)
            temp.flush()
            secrets = SecretsCollection()
            with default_settings():
                secrets.scan_file(temp.name)
            result_json = secrets.json()
            for file_secrets in result_json.values():
                if file_secrets:
                    score = 1.0
                    found_types.extend(s.get("type", "unknown") for s in file_secrets)
    except Exception:
        pass

    # 2. Regex fallback for known patterns
    secret_patterns = [
        (r'AKIA[0-9A-Z]{16}', "AWS Access Key"),
        (r'xox[baprs]-[0-9a-zA-Z]{10,48}', "Slack Token"),
        (r'sk_[live|test]_[0-9a-zA-Z]{24,32}', "Stripe Secret Key"),
        (r'-----BEGIN [A-Z]+ PRIVATE KEY-----', "Private Key"),
        (r'internal-api\.controlplane\.ai', "Internal API Endpoint"),
    ]
    
    for pattern, secret_type in secret_patterns:
        if re.search(pattern, text, re.IGNORECASE):
            score = 1.0
            if secret_type not in found_types:
                found_types.append(secret_type)
            
    return CheckResult(
        check_name="sensitive_data",
        engine="detect_secrets_heuristic",
        score=score,
        verdict=CheckVerdict.FAIL if score > 0 else CheckVerdict.PASS,
        details={"pattern_matched": found_types} if found_types else {}
    )
