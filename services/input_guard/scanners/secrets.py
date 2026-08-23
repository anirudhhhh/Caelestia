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
        found_types = []

        # Write the payload to an in-memory temp file for the scanner
        with tempfile.NamedTemporaryFile(mode='w+', suffix='.txt', delete=True) as temp:
            temp.write(text)
            temp.flush()

            secrets = SecretsCollection()
            with default_settings():
                secrets.scan_file(temp.name)

            # detect_secrets returns { "/path/to/file": [ {type, ...}, ... ] }
            # NOT { "results": [...] } — iterate values to find any hits
            result_json = secrets.json()
            for file_secrets in result_json.values():
                if file_secrets:
                    score = 1.0
                    found_types.extend(s.get("type", "unknown") for s in file_secrets)

        latency_ms = (time.time() - start) * 1000
        return CheckResult(
            check_name="secrets",
            engine="detect_secrets",
            score=score,
            verdict=CheckVerdict.FAIL if score > 0 else CheckVerdict.PASS,
            latency_ms=latency_ms,
            details={"secret_types": found_types} if found_types else {}
        )