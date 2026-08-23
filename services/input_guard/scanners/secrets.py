import time
import tempfile
from . import ScannerBase
from shared.schemas import CheckResult, CheckVerdict
from detect_secrets import SecretsCollection
from detect_secrets.settings import default_settings

class SecretsScanner(ScannerBase):
    def __init__(self):
        # compiles all the regexes and entropy models in memory, eliminating the cold start.
        with default_settings():
            pass

    async def scan(self, text: str, **kwargs) -> CheckResult:
        start = time.time()
        score = 0.0
        
        # Write the payload to an in-memory temp file for the scanner
        with tempfile.NamedTemporaryFile(mode='w+', delete=True) as temp:
            temp.write(text)
            temp.flush()
            
            secrets = SecretsCollection()
            with default_settings():
                secrets.scan_file(temp.name)
            
            if secrets.json().get("results"):
                score = 1.0
                
        latency_ms = (time.time() - start) * 1000
        return CheckResult(
            check_name="secrets",
            engine="detect_secrets",
            score=score,
            latency_ms=latency_ms
        )