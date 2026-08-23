import re
import time
from . import ScannerBase
from shared.schemas import CheckResult, CheckVerdict

class PromptInjectionScanner(ScannerBase):
    def __init__(self):
        self.patterns = [
            r"ignore previous instructions",
            r"you are now",
            r"disregard",
            r"system prompt",
            r"forget everything"
        ]

    async def scan(self, text: str, **kwargs) -> CheckResult:
        start = time.time()
        score = 0.0
        text_lower = text.lower()
        
        for pattern in self.patterns:
            if re.search(pattern, text_lower):
                score = 0.9  # High probability of injection
                break
                
        latency_ms = (time.time() - start) * 1000
        return CheckResult(
            check_name="prompt_injection",
            engine="regex_fallback",
            score=score,
            latency_ms=latency_ms
        )
