import re
import time
from . import ScannerBase
from shared.schemas import CheckResult, CheckVerdict

class PromptInjectionScanner(ScannerBase):
    def __init__(self):
        self.high_patterns = [
            r"ignore previous instructions",
            r"disregard (all |any )?previous",
            r"you are now (an? )?unrestricted",
            r"jailbreak",
            r"dan mode",
            r"developer mode enabled",
            r"forget (all |everything|your instructions)",
            r"override system instructions"
        ]
        self.medium_patterns = [
            r"system prompt",
            r"reveal (your |the )?(system |developer )?instructions",
            r"print (out |the )?(first|system|hidden)",
            r"repeat (all |everything )?(above|from start)",
            r"base64 encode (your |the )?system"
        ]
        self.mild_patterns = [
            r"bypass safety",
            r"unfiltered mode",
            r"ignore restrictions",
            r"roleplay without rules"
        ]

    async def scan(self, text: str, **kwargs) -> CheckResult:
        start = time.time()
        score = 0.0
        text_lower = text.lower()
        matched = []
        
        for pattern in self.high_patterns:
            if re.search(pattern, text_lower):
                score = max(score, 0.95)
                matched.append(pattern)
                
        for pattern in self.medium_patterns:
            if re.search(pattern, text_lower):
                score = max(score, 0.75)
                matched.append(pattern)

        for pattern in self.mild_patterns:
            if re.search(pattern, text_lower):
                score = max(score, 0.45)
                matched.append(pattern)
                
        latency_ms = (time.time() - start) * 1000
        return CheckResult(
            check_name="prompt_injection",
            engine="regex_fallback",
            score=round(score, 2),
            latency_ms=latency_ms,
            details={"matched_patterns": matched} if matched else {}
        )
