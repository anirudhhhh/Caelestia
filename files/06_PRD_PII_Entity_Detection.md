# PRD — Component 06: PII / Entity Detection Service

## Purpose
One shared, dedicated service for finding and (optionally) redacting personal/sensitive entities in both directions of traffic — called by both the Input Guard (04) and Output Guard (05) rather than each reimplementing PII detection. The brief calls this out explicitly as its own "solutioning area," and having it shared also solves the "a fabricated detail about a person is both a hallucination and a privacy concern" overlap problem: both callers get the same entity list and can independently decide what to do with it.

## Connections
- **Called by:** Input Guard (04), Output Guard (05).
- **No direct calls to Policy Engine** — this is a pure detection service; the callers decide policy action based on what it returns.

## Tech stack
- **Microsoft Presidio** (`presidio-analyzer` + `presidio-anonymizer`), open source, purpose-built exactly for this: entity recognition (names, emails, phone numbers, national IDs, credit cards, addresses, custom regex/NER-based recognizers) plus configurable anonymization (redact, mask, hash, synthetic replacement).
- Custom `PatternRecognizer`s added for enterprise-specific identifiers (employee IDs, internal account number formats) — Presidio is designed to be extended this way without touching its core.
- Language model backend: spaCy (`en_core_web_lg` or similar) for NER, swappable per language/geography.

## Implementation
1. Expose `POST /detect` taking `{text, geography, entity_types?}` → returns a list of `{entity_type, start, end, score}`.
2. Expose `POST /anonymize` taking the same plus an `action` (`redact` | `mask` | `hash` | `synthetic`) → returns the transformed text plus the span map (needed so the Audit Store can record what was changed without storing the original raw PII).
3. Geography-aware recognizer sets: EU calls should include GDPR-relevant identifiers (national ID formats vary by country); US calls include SSN patterns; this is config-driven per `geography`, not hardcoded per deployment.
4. Return confidence scores per entity so callers can apply their own thresholds (Input Guard might redact at a lower confidence than Output Guard, which might prefer to flag-for-review at high confidence rather than silently redact a possibly-fabricated name).

## Structure
```
pii_service/
  recognizers/
    custom_employee_id.py
    custom_account_number.py
  config/
    geography_entity_sets.yaml
  service.py
  tests/
    test_recognizer_precision.py
    test_anonymize_reversible_mapping.py
```

## Non-functional requirements
- Target < 40 ms P95 for typical chat-length text (Presidio + spaCy small/medium models are fast enough locally; avoid a network hop to an external PII API in the synchronous path).
- Stateless; recognizer models loaded once at startup.

## Metrics emitted
`pii_entities_detected_total{entity_type, geography}`, `pii_detection_latency_ms`, `pii_anonymize_actions_total{action}`.

## Failure modes
- Detector unavailable → callers (04/05) must treat this as `verdict: "skipped"` on the `pii` check, not `"pass"` — a skipped PII check should raise, not lower, the effective risk tier for that interaction (fail closed on privacy specifically, since privacy leaks are hard to undo).

## Security & compliance
- This service is the **only** place raw PII values should ever be logged (and even then, only transient in-memory during detection) — its own logs must exclude the detected span text, logging only entity type/count/score.
- Anonymization mappings needed to demo "what got redacted" should be stored encrypted and short-lived, not permanently in the plaintext audit trail.

## Build priority
**P0** — both guards depend on it.

## Assumptions
- The demo will show at least one deliberately PII-laden fake input (e.g., a fabricated support ticket with a name/email/phone) to make the redaction visible live.
