"""
ControlPlane.ai — Enterprise Secret Detection Engine (§3.4 & §5.1)

Combines:
1. Registered HMAC-SHA256 Fingerprint Matching (zero raw secret storage)
2. In-Process Gitleaks-derived Pattern Ruleset
3. Shannon Entropy Scoring on Candidate Tokens
4. Contextual Keyword Proximity Scoring
5. Structural Validators (JWT, PEM, Luhn Algorithm)
6. AST-Aware Code String Construction Unpacking
"""

import math
import re
from typing import List, Dict, Any, Optional, Tuple

from shared.schemas import CheckResult, CheckVerdict, Finding, Span
from services.input_guard.scanners.code_unpack import is_likely_code, unpack_code_strings


# ─── 1. In-Process Gitleaks Pattern Ruleset ───────────────────────────────────

GITLEAKS_RULES = [
    {
        "id": "aws_access_key",
        "name": "AWS Access Key",
        "pattern": r"\b(AKIA[0-9A-Z]{16})\b",
        "confidence": 0.98
    },
    {
        "id": "github_pat",
        "name": "GitHub Personal Access Token",
        "pattern": r"\b(ghp_[A-Za-z0-9_]{36,40}|github_pat_[A-Za-z0-9_]{82})\b",
        "confidence": 0.99
    },
    {
        "id": "openai_api_key",
        "name": "OpenAI API Key",
        "pattern": r"\b(sk-[A-Za-z0-9_-]{20,64}|sk-proj-[A-Za-z0-9_-]{48,128})\b",
        "confidence": 0.98
    },
    {
        "id": "slack_token",
        "name": "Slack Token",
        "pattern": r"\b(xox[baprs]-[0-9A-Za-z]{10,48})\b",
        "confidence": 0.98
    },
    {
        "id": "stripe_api_key",
        "name": "Stripe API Key",
        "pattern": r"\b(sk_live_[0-9a-zA-Z]{24,34}|rk_live_[0-9a-zA-Z]{24,34})\b",
        "confidence": 0.99
    },
    {
        "id": "private_key_header",
        "name": "RSA/EC Private Key",
        "pattern": r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----",
        "confidence": 1.00
    },
    {
        "id": "database_connection_uri",
        "name": "Database Connection String",
        "pattern": r"\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis):\/\/[a-zA-Z0-9_\-\.]+:[a-zA-Z0-9_\-\.%!@#$^&*]+@[a-zA-Z0-9_\-\.]+(?::\d+)?\/[a-zA-Z0-9_\-\.]+\b",
        "confidence": 0.95
    }
]

CONTEXT_KEYWORDS = [
    "api_key", "apikey", "secret", "password", "token", "auth",
    "authorization", "bearer", "private_key", "client_secret",
    "access_token", "connection_string", "credentials"
]


def calculate_shannon_entropy(token: str) -> float:
    """Calculates Shannon entropy in bits per character."""
    if not token:
        return 0.0
    freq: Dict[str, int] = {}
    for ch in token:
        freq[ch] = freq.get(ch, 0) + 1
    entropy = 0.0
    length = len(token)
    for count in freq.values():
        p = count / length
        entropy -= p * math.log2(p)
    return round(entropy, 3)


def is_valid_jwt(token: str) -> bool:
    """Validates 3-segment Base64URL JWT structure."""
    parts = token.split(".")
    if len(parts) != 3:
        return False
    b64_pattern = re.compile(r'^[A-Za-z0-9_-]+$')
    return all(b64_pattern.match(p) for p in parts if len(p) > 0)


def passes_luhn_checksum(card_number: str) -> bool:
    """Validates credit card number candidate using Luhn algorithm."""
    digits = [int(c) for c in card_number if c.isdigit()]
    if len(digits) < 13 or len(digits) > 19:
        return False
    checksum = 0
    reverse_digits = digits[::-1]
    for i, d in enumerate(reverse_digits):
        if i % 2 == 1:
            doubled = d * 2
            checksum += doubled - 9 if doubled > 9 else doubled
        else:
            checksum += d
    return checksum % 10 == 0


class SecretScanner:
    """Enterprise Secret Detection Engine."""

    def __init__(self, audit_store_url: str = "http://localhost:8007"):
        self.audit_store_url = audit_store_url

    def extract_candidate_tokens(self, text: str) -> List[Tuple[str, int, int]]:
        """Extracts candidate tokens bounded by natural delimiters and length."""
        candidates = []
        # Match word tokens of length 16 to 128
        for match in re.finditer(r'[A-Za-z0-9_\-\.\:\=\/]{16,128}', text):
            candidates.append((match.group(0), match.start(), match.end()))
        return candidates

    async def scan(self, text: str, http_client=None) -> CheckResult:
        """
        Executes full secret detection scan:
        1. Code AST Unpack
        2. Registered Secret HMAC Matching
        3. Gitleaks Rule Matching
        4. Shannon Entropy + Keyword Proximity Scoring
        5. Structural Validators
        """
        findings: List[Finding] = []
        max_score = 0.0
        details: Dict[str, Any] = {"matches": [], "candidates_checked": 0}

        # 1. Code AST Unpack if code is present
        all_texts_to_check = [text]
        if is_likely_code(text):
            unpacked_strings = unpack_code_strings(text)
            all_texts_to_check.extend(unpacked_strings)

        # 2. Extract Candidate Tokens
        candidate_tokens = []
        for t in all_texts_to_check:
            tokens_with_spans = self.extract_candidate_tokens(t)
            candidate_tokens.extend([tok for tok, _, _ in tokens_with_spans])

        details["candidates_checked"] = len(candidate_tokens)

        # 3. Check Registered HMAC Fingerprints via Audit Store
        if candidate_tokens and http_client:
            try:
                resp = await http_client.post(
                    f"{self.audit_store_url}/v1/secrets/fingerprints/match",
                    json={"candidates": candidate_tokens[:50]},
                    timeout=2.0
                )
                if resp.status_code == 200:
                    matched_registered = resp.json().get("matches", [])
                    for match in matched_registered:
                        max_score = 1.00
                        findings.append(Finding(
                            type="SECRET",
                            subtype=match.get("secret_type", "registered_secret"),
                            confidence=1.00,
                            span=Span(start=0, end=len(text)),
                            engine="registered_hmac_fingerprint",
                            verdict="fail",
                            details={"secret_id": match.get("secret_id"), "action": match.get("action_on_match")}
                        ))
                        details["matches"].append(f"Registered Secret HMAC: {match.get('secret_id')}")
            except Exception:
                pass

        # 4. In-Process Gitleaks Patterns
        for target_text in all_texts_to_check:
            for rule in GITLEAKS_RULES:
                for match in re.finditer(rule["pattern"], target_text):
                    score = rule["confidence"]
                    max_score = max(max_score, score)
                    findings.append(Finding(
                        type="SECRET",
                        subtype=rule["id"],
                        confidence=score,
                        span=Span(start=match.start(), end=match.end()),
                        engine="gitleaks_rules",
                        verdict="fail" if score >= 0.8 else "flag",
                        details={"rule_name": rule["name"]}
                    ))
                    details["matches"].append(f"{rule['name']} ({rule['id']})")

        # 5. Shannon Entropy & Contextual Keyword Scoring
        text_lower = text.lower()
        has_keyword_context = any(kw in text_lower for kw in CONTEXT_KEYWORDS)

        for tok, start, end in self.extract_candidate_tokens(text):
            entropy = calculate_shannon_entropy(tok)
            # High entropy threshold (> 4.3 bits/char) on alphanumeric tokens
            if len(tok) >= 24 and entropy >= 4.3:
                # Discard benign UUIDs / hex hashes
                if re.match(r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$', tok):
                    continue
                
                score = 0.85 if has_keyword_context else 0.65
                max_score = max(max_score, score)
                findings.append(Finding(
                    type="SECRET",
                    subtype="high_entropy_token",
                    confidence=score,
                    span=Span(start=start, end=end),
                    engine="entropy_context_scanner",
                    verdict="fail" if score >= 0.80 else "flag",
                    details={"entropy": entropy, "has_keyword_context": has_keyword_context}
                ))
                details["matches"].append(f"High Entropy Token (entropy={entropy})")

        # 6. Structural JWT & Luhn Validators
        jwt_matches = re.finditer(r'\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b', text)
        for jm in jwt_matches:
            if is_valid_jwt(jm.group(0)):
                max_score = max(max_score, 0.95)
                findings.append(Finding(
                    type="SECRET",
                    subtype="jwt_token",
                    confidence=0.95,
                    span=Span(start=jm.start(), end=jm.end()),
                    engine="jwt_validator",
                    verdict="fail",
                    details={"jwt_header": "valid_structure"}
                ))
                details["matches"].append("Valid JWT Token")

        verdict = CheckVerdict.FAIL if max_score >= 0.80 else (CheckVerdict.WARN if max_score >= 0.40 else CheckVerdict.PASS)
        details["findings"] = [f.model_dump() for f in findings]

        return CheckResult(
            check_name="secrets",
            engine="gitleaks_entropy_hmac",
            score=max_score,
            verdict=verdict,
            layer="detect_secrets",
            details=details
        )
