import re
import time
import tempfile
from . import ScannerBase
from shared.schemas import CheckResult, CheckVerdict

try:
    from detect_secrets import SecretsCollection
    from detect_secrets.settings import default_settings
    HAS_DETECT_SECRETS = True
except ImportError:
    HAS_DETECT_SECRETS = False

KNOWN_SECRET_PATTERNS = {
    "openai_api_key": r"sk-[a-zA-Z0-9]{20,}",
    "google_api_key": r"AIza[0-9A-Za-z-_]{35}",
    "github_token": r"gh[pous]_[0-9a-zA-Z]{36}",
    "slack_token": r"xox[baprs]-[0-9a-zA-Z]{10,48}",
    "aws_access_key": r"AKIA[0-9A-Z]{16}",
    "generic_api_key": r"(?:api[_-]?key|access[_-]?token|secret[_-]?key)\s*[:=]\s*['\"]?[a-zA-Z0-9_\-]{16,}['\"]?",
    "private_key": r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----",
}

class SecretsScanner(ScannerBase):
    def __init__(self):
        if HAS_DETECT_SECRETS:
            try:
                with default_settings():
                    pass
            except Exception:
                pass

    async def scan(self, text: str, **kwargs) -> CheckResult:
        start = time.time()
        score = 0.0
        found_types = []

        # 1. detect-secrets scan if available
        if HAS_DETECT_SECRETS:
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

        # 2. Known secret regex patterns
        for secret_name, pattern in KNOWN_SECRET_PATTERNS.items():
            if re.search(pattern, text, re.IGNORECASE):
                score = 1.0
                if secret_name not in found_types:
                    found_types.append(secret_name)

        latency_ms = (time.time() - start) * 1000
        return CheckResult(
            check_name="secrets",
            engine="detect_secrets" if HAS_DETECT_SECRETS else "regex_secrets",
            score=score,
            verdict=CheckVerdict.FAIL if score > 0 else CheckVerdict.PASS,
            latency_ms=latency_ms,
            details={"secret_types": found_types} if found_types else {}
        )