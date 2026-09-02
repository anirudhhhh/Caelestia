"""
ControlPlane.ai — Policy-Gated PII Passing & Findings Aggregator Engine

1. PII Handling:
   - Preserves original raw input data (zero forced redaction / placeholders).
   - Evaluates detected PII against Enterprise Global Policy permissions.
   - Default is DENY/BLOCK for unlisted PII types.
   - Evaluates optional request-level PII declarations (acknowledgements).
   - If Detected PII ∩ Enterprise-Blocked PII is non-empty -> HARD BLOCK.
   - If Detected PII is allowed but unacknowledged -> WARN & PASS raw (or BLOCK in strict mode).

2. Secrets & Injection Handling:
   - Strictly BLOCKED (zero legitimate raw usage).
"""

from typing import List, Dict, Any, Tuple, Optional
from shared.schemas import Finding, RawEntity, SanitizerOutput, Span


def normalize_pii_type(etype: str) -> str:
    """Normalizes Presidio and custom entity types to standard policy keys."""
    etype_upper = etype.upper()
    if "EMAIL" in etype_upper:
        return "EMAIL"
    if "PHONE" in etype_upper:
        return "PHONE"
    if "LOCATION" in etype_upper or "ADDRESS" in etype_upper:
        return "ADDRESS"
    if "SSN" in etype_upper or "SOCIAL_SECURITY" in etype_upper:
        return "SSN"
    if "PAN" in etype_upper:
        return "PAN"
    if "CREDIT_CARD" in etype_upper or "CARD" in etype_upper:
        return "CREDIT_CARD"
    if "AADHAAR" in etype_upper:
        return "AADHAAR"
    if "BANK" in etype_upper or "ACCOUNT" in etype_upper or "IBAN" in etype_upper:
        return "BANK_ACCOUNT"
    if "PASSPORT" in etype_upper or "GOVERNMENT" in etype_upper:
        return "GOVERNMENT_ID"
    return etype_upper


from shared.config import AUDIT_STORE_URL

class SanitizerEngine:
    """Enterprise Findings Aggregator and Policy-Based PII Evaluation Engine."""

    def __init__(self, audit_store_url: Optional[str] = None):
        self.audit_store_url = audit_store_url or AUDIT_STORE_URL

    def sanitize_payload(
        self,
        original_text: str,
        interaction_id: str,
        findings: List[Finding],
        pii_entities: List[Dict[str, Any]],
        use_case_config: Dict[str, Any],
        pii_declaration: Optional[List[str]] = None
    ) -> Tuple[SanitizerOutput, bool]:
        """
        Evaluates PII and security findings against enterprise policy.
        Never redacts raw text. Returns (SanitizerOutput, should_block).
        """
        should_block = False
        declared_pii = {normalize_pii_type(p) for p in (pii_declaration or [])}
        
        # Enterprise global PII policy (default is deny/block for unlisted types)
        pii_permissions: Dict[str, str] = use_case_config.get("pii_permissions", {
            "EMAIL": "allow",
            "PHONE": "allow",
            "ADDRESS": "allow"
        })
        strict_declaration: bool = use_case_config.get("strict_pii_declaration", False)

        detected_pii: List[str] = []
        blocked_pii: List[str] = []
        allowed_pii: List[str] = []
        warnings: List[str] = []

        # 1. Evaluate PII Entities against Enterprise Policy
        for pii in pii_entities:
            raw_etype = pii.get("entity_type", "PII")
            etype = normalize_pii_type(raw_etype)
            score = pii.get("score", 0.0)
            start = pii.get("start", 0)
            end = pii.get("end", 0)
            
            if etype not in detected_pii:
                detected_pii.append(etype)

            # Check Enterprise Policy permission (Default is "block")
            permission = pii_permissions.get(etype, "block")

            if permission != "allow":
                # Detected PII ∩ Enterprise-blocked PII -> BLOCK
                should_block = True
                if etype not in blocked_pii:
                    blocked_pii.append(etype)
                findings.append(Finding(
                    type="PII",
                    subtype=etype,
                    confidence=score,
                    span=Span(start=start, end=end),
                    engine="presidio_ner",
                    verdict="fail",
                    details={"action_taken": "blocked_by_enterprise_policy", "policy_permission": permission}
                ))
            else:
                # Allowed by enterprise policy: Check request declaration
                is_acknowledged = etype in declared_pii
                if is_acknowledged:
                    if etype not in allowed_pii:
                        allowed_pii.append(etype)
                    findings.append(Finding(
                        type="PII",
                        subtype=etype,
                        confidence=score,
                        span=Span(start=start, end=end),
                        engine="presidio_ner",
                        verdict="pass",
                        details={"action_taken": "allowed_and_acknowledged"}
                    ))
                else:
                    # Allowed by policy, but undeclared in request
                    if strict_declaration:
                        should_block = True
                        if etype not in blocked_pii:
                            blocked_pii.append(etype)
                        findings.append(Finding(
                            type="PII",
                            subtype=etype,
                            confidence=score,
                            span=Span(start=start, end=end),
                            engine="presidio_ner",
                            verdict="fail",
                            details={"action_taken": "blocked_strict_declaration_missing"}
                        ))
                    else:
                        if etype not in allowed_pii:
                            allowed_pii.append(etype)
                        warn_msg = f"Detected PII ({etype}) unacknowledged by request; passed raw under policy tolerance."
                        if warn_msg not in warnings:
                            warnings.append(warn_msg)
                        findings.append(Finding(
                            type="PII",
                            subtype=etype,
                            confidence=score,
                            span=Span(start=start, end=end),
                            engine="presidio_ner",
                            verdict="flag",
                            details={"action_taken": "warn_and_pass", "warning": warn_msg}
                        ))

        # 2. Evaluate Secret & Injection Findings (Strict Hard Block)
        for f in findings:
            if f.type in ("SECRET", "INJECTION") and f.verdict == "fail":
                should_block = True

        # Exact original input is preserved — NEVER REDACTED
        output = SanitizerOutput(
            clean_text=original_text,
            vault_ref=None,
            detected_pii=detected_pii,
            blocked_pii=blocked_pii,
            allowed_pii=allowed_pii,
            warnings=warnings,
            raw_entities=[],
            findings=findings
        )
        return output, should_block
