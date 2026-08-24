import re
import time
from . import ScannerBase
from shared.schemas import CheckResult, CheckVerdict

class ToxicityScanner(ScannerBase):
    def __init__(self):
        self.severe_words = {"hate", "kill", "murder", "fuck", "shit", "bitch", "asshole"}
        self.moderate_words = {"badword1", "badword2", "idiot", "bastard", "crap", "damn"}
        self.mild_words = {"dumb", "stupid", "trash", "fool", "annoying", "useless", "shut up", "loser"}

    async def scan(self, text: str, **kwargs) -> CheckResult:
        start = time.time()
        score = 0.0
        words = set(re.findall(r'\b\w+\b', text.lower()))
        
        severe_hits = words.intersection(self.severe_words)
        moderate_hits = words.intersection(self.moderate_words)
        mild_hits = words.intersection(self.mild_words)

        all_hits = severe_hits | moderate_hits | mild_hits

        if severe_hits:
            score = min(0.85 + (len(severe_hits) - 1) * 0.1, 1.0)
        elif moderate_hits:
            score = min(0.80 + (len(moderate_hits) - 1) * 0.1, 0.95)
        elif mild_hits:
            score = min(0.45 + (len(mild_hits) - 1) * 0.1, 0.70)
            
        latency_ms = (time.time() - start) * 1000
        return CheckResult(
            check_name="toxicity",
            engine="wordlist_fallback",
            score=round(score, 2),
            latency_ms=latency_ms,
            details={"matches": list(all_hits)} if all_hits else {}
        )