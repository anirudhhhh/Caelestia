import sys
from pathlib import Path

# Adjust path to import shared modules
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from shared.schemas import CheckResult, CheckVerdict

class ScannerBase:
    async def scan(self, text: str, **kwargs) -> CheckResult:
        raise NotImplementedError
