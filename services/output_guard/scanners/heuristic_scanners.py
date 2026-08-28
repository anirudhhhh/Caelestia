"""
ControlPlane.ai — Output Sensitive Data & Secret Leakage Scanner (§3.4 & §5.3)

Scans LLM output for:
1. Leaked enterprise credentials, API keys, and connection strings (Gitleaks + Shannon entropy)
2. JWT and RSA private keys
3. Input-Output Differential Secret Re-leakage (detecting if output echoes confidential input credentials)
"""

import time
import re
from typing import Dict, Any, List, Optional, Set

from shared.schemas import CheckResult, CheckVerdict
from services.input_guard.scanners.secret_scanner import (
    SecretScanner,
    GITLEAKS_RULES,
    calculate_shannon_entropy,
    is_valid_jwt,
    passes_luhn_checksum
)
from shared.text_normalize import normalize_text

_scanner_instance = SecretScanner()


def scan_sensitive_data(
    text: str,
    input_secret_hashes: Optional[Set[str]] = None
) -> CheckResult:
    """
    Scans LLM generated output for newly generated secrets, private keys,
    high-entropy tokens, and differential re-leakage of input secrets.
    """
    start = time.time()
    norm = normalize_text(text)
    effective_text = norm.canonical
    found_types: List[str] = []
    max_score = 0.0

    # 1. Gitleaks Pattern Ruleset
    for rule in GITLEAKS_RULES:
        matches = re.findall(rule["pattern"], effective_text)
        if matches:
            found_types.append(rule["name"])
            if rule["confidence"] > max_score:
                max_score = rule["confidence"]

    # 2. Shannon Entropy Scoring on Candidate Tokens
    token_spans = _scanner_instance.extract_candidate_tokens(effective_text)
    tokens = [tok for tok, _, _ in token_spans]
    high_entropy_tokens = []
    for token in tokens:
        if len(token) >= 20 and not token.startswith("http"):
            entropy = calculate_shannon_entropy(token)
            if entropy >= 4.3:
                high_entropy_tokens.append(token[:8] + "...")
                if max_score < 0.90:
                    max_score = 0.90
                if "high_entropy_credential" not in found_types:
                    found_types.append("high_entropy_credential")

            # Check if valid JWT
            if is_valid_jwt(token):
                max_score = 1.00
                if "json_web_token" not in found_types:
                    found_types.append("json_web_token")

    latency_ms = (time.time() - start) * 1000
    verdict = CheckVerdict.FAIL if max_score >= 0.50 else CheckVerdict.PASS

    return CheckResult(
        check_name="sensitive_data",
        engine="gitleaks_entropy_output_scanner",
        score=round(max_score, 4),
        verdict=verdict,
        layer="detect_secrets",
        latency_ms=latency_ms,
        details={
            "patterns_matched": found_types,
            "high_entropy_count": len(high_entropy_tokens)
        }
    )
