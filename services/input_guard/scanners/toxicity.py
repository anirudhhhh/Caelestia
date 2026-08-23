import re
import time
from . import ScannerBase
from shared.schemas import CheckResult, CheckVerdict

class ToxicityScanner(ScannerBase):
    def __init__(self):
        self.bad_words = {"badword1", "badword2", "hate", "kill", "murder", "idiot"}

    async def scan(self, text: str, **kwargs) -> CheckResult:
        start = time.time()
        score = 0.0
        words = set(re.findall(r'\b\w+\b', text.lower()))
        
        overlap = words.intersection(self.bad_words)
        if overlap:
            # Simple heuristic
            score = min(len(overlap) * 0.3, 1.0)
            
        latency_ms = (time.time() - start) * 1000
        return CheckResult(
            check_name="toxicity",
            engine="wordlist_fallback",
            score=score,
            latency_ms=latency_ms
        )
