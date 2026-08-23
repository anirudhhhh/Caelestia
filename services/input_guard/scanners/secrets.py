import re
import time
from . import ScannerBase
from shared.schemas import CheckResult, CheckVerdict

class SecretsScanner(ScannerBase):
    def __init__(self):
        self.patterns = {
            "aws_key": r"AKIA[0-9A-Z]{16}",
            "github_token": r"gh[pousr]_[A-Za-z0-9_]{36}",
            "generic_api_key": r"api_key\s*=\s*['\"][A-Za-z0-9_-]+['\"]"
        }

    async def scan(self, text: str, **kwargs) -> CheckResult:
        start = time.time()
        score = 0.0
        
        for name, pattern in self.patterns.items():
            if re.search(pattern, text):
                score = 1.0
                break
                
        latency_ms = (time.time() - start) * 1000
        return CheckResult(
            check_name="secrets",
            engine="regex_fallback",
            score=score,
            latency_ms=latency_ms
        )
