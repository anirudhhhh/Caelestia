import re
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from typing import List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

# Adjust path to import shared modules
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from shared.config import setup_logging
from shared.schemas import (
    PIIDetectRequest, PIIDetectResponse, PIIEntity,
    PIIAnonymizeRequest, PIIAnonymizeResponse
)

logger = setup_logging("pii_service")

# Optional dependencies
try:
    from presidio_analyzer import AnalyzerEngine, RecognizerResult
    from presidio_anonymizer import AnonymizerEngine
    HAS_PRESIDIO = True
except ImportError:
    HAS_PRESIDIO = False
    logger.warning("Presidio not installed. Using regex fallback.")

analyzer = None
anonymizer = None

def init_presidio():
    global analyzer, anonymizer
    if HAS_PRESIDIO:
        try:
            import spacy
            if not spacy.util.is_package("en_core_web_sm"):
                import subprocess
                subprocess.check_call([sys.executable, "-m", "spacy", "download", "en_core_web_sm"])
            analyzer = AnalyzerEngine()
            anonymizer = AnonymizerEngine()
            logger.info("Presidio initialized successfully.")
        except Exception as e:
            logger.error(f"Failed to initialize Presidio: {e}")
            analyzer = None
            anonymizer = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    # Run blocking Presidio/spaCy init in a thread pool so the event loop stays free
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, init_presidio)
    yield

app = FastAPI(title="PII Service", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

REGEX_PATTERNS = {
    "EMAIL_ADDRESS": r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b",
    "PHONE_NUMBER": r"\b(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b",
    "US_SSN": r"(?i)\b(?:ssn|social\s*security(?:\s*no|\s*number)?)\b(?:\s+is|\s*[:=-])?\s*(\d{9}|\d{3}[-\s]\d{2}[-\s]\d{4})|\b\d{3}-\d{2}-\d{4}\b|\b\d{3}\s\d{2}\s\d{4}\b",
    "CREDIT_CARD": r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b|\b(?:\d{4}[ -]){3}\d{4}\b",
    "PAN": r"\b[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}\b",
    "AADHAAR": r"\b[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}\b",
    "ADDRESS": r"\b\d{1,5}\s+[A-Za-z0-9\.\,\-\s]{3,35}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Way|Court|Ct|Circle|Cir)\b",
    "BANK_ACCOUNT": r"\b[A-Z]{2}\d{2}[A-Z0-9]{4}\d{7}([A-Z0-9]?){0,16}\b"
}

def regex_fallback_detect(text: str) -> List[PIIEntity]:
    entities = []
    for entity_type, pattern in REGEX_PATTERNS.items():
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            if match.groups() and match.group(1):
                start = match.start(1)
                end = match.end(1)
            else:
                start = match.start()
                end = match.end()
            
            score = 0.95 if entity_type in ("US_SSN", "CREDIT_CARD", "PAN", "AADHAAR") else 0.85
            entities.append(PIIEntity(
                entity_type=entity_type,
                start=start,
                end=end,
                score=score
            ))
    return entities

def regex_fallback_anonymize(text: str, entities: List[PIIEntity], action: str = "redact") -> str:
    # Sort entities in reverse order by start to avoid shifting offsets
    entities_sorted = sorted(entities, key=lambda x: x.start, reverse=True)
    anonymized_text = text
    for entity in entities_sorted:
        if action == "redact":
            replacement = f"<{entity.entity_type}>"
        else:
            replacement = "*" * (entity.end - entity.start)
        anonymized_text = anonymized_text[:entity.start] + replacement + anonymized_text[entity.end:]
    return anonymized_text

@app.post("/detect", response_model=PIIDetectResponse)
async def detect_pii(request: PIIDetectRequest):
    import time
    start_time = time.time()

    # Minimum thresholds — anything below these is noise, not PII
    MIN_SCORE = 0.4
    MIN_ENTITY_LEN = 4  # ignore matches shorter than 4 chars (e.g. "hi", "yo")

    # Only look for data-type PII (not PERSON/LOCATION which are too noisy)
    DATA_ENTITIES = ["EMAIL_ADDRESS", "PHONE_NUMBER", "CREDIT_CARD", "US_SSN",
                     "IBAN_CODE", "IP_ADDRESS", "US_BANK_NUMBER", "US_DRIVER_LICENSE",
                     "US_PASSPORT", "US_ITIN"]

    entities = []
    if analyzer:
        try:
            target_entities = request.entity_types or DATA_ENTITIES
            results = analyzer.analyze(
                text=request.text,
                language="en",
                entities=target_entities,
                score_threshold=MIN_SCORE,  # Presidio will skip results below this
            )
            entities = [PIIEntity(
                entity_type=r.entity_type,
                start=r.start,
                end=r.end,
                score=r.score
            ) for r in results
                if r.score >= MIN_SCORE
                and (r.end - r.start) >= MIN_ENTITY_LEN]  # drop short spurious matches
        except Exception as e:
            logger.error(f"Presidio analyze error: {e}")
    
    # Always merge regex fallback entities to guarantee high-risk PII pattern detection
    regex_entities = regex_fallback_detect(request.text)
    for re_e in regex_entities:
        if not any(e.entity_type == re_e.entity_type and abs(e.start - re_e.start) < 3 for e in entities):
            entities.append(re_e)

    # Apply the same length filter to regex fallback results
    entities = [e for e in entities if (e.end - e.start) >= MIN_ENTITY_LEN]

    latency_ms = (time.time() - start_time) * 1000
    return PIIDetectResponse(entities=entities, latency_ms=latency_ms)


@app.post("/anonymize", response_model=PIIAnonymizeResponse)
async def anonymize_pii(request: PIIAnonymizeRequest):
    import time
    start_time = time.time()
    
    # First detect
    detect_resp = await detect_pii(PIIDetectRequest(text=request.text, geography=request.geography))
    entities = detect_resp.entities
    
    anonymized_text = request.text
    if anonymizer and entities:
        try:
            from presidio_anonymizer.entities import RecognizerResult as AnonRecognizerResult, OperatorConfig
            presidio_results = [
                AnonRecognizerResult(entity_type=e.entity_type, start=e.start, end=e.end, score=e.score)
                for e in entities
            ]
            operators = {}
            if request.action == "redact":
                operators = {"DEFAULT": OperatorConfig("replace")}
            elif request.action == "mask":
                operators = {"DEFAULT": OperatorConfig("mask", {"chars_to_mask": 4, "masking_char": "*", "from_end": True})}
            elif request.action == "hash":
                operators = {"DEFAULT": OperatorConfig("hash")}
            else:
                operators = {"DEFAULT": OperatorConfig("replace")}
                
            anon_result = anonymizer.anonymize(text=request.text, analyzer_results=presidio_results, operators=operators)
            anonymized_text = anon_result.text
        except Exception as e:
            logger.error(f"Presidio anonymize error: {e}")
            anonymized_text = regex_fallback_anonymize(request.text, entities, request.action)
    elif entities:
        anonymized_text = regex_fallback_anonymize(request.text, entities, request.action)

    latency_ms = (time.time() - start_time) * 1000
    return PIIAnonymizeResponse(
        anonymized_text=anonymized_text,
        entities_found=entities,
        latency_ms=latency_ms
    )


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "pii_service", "presidio_active": analyzer is not None}

@app.get("/metrics")
async def metrics():
    return {"status": "ok"}

