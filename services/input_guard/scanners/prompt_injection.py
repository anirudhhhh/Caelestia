"""
ControlPlane.ai — Production Prompt Injection Scanner (§3.2 & §5.3)

Implements the multi-layer prompt injection defense pipeline:
1. L0: Canonical Normalization & Code Unpacking (AST string concatenation unrolling)
2. L1: Fast Pattern Heuristics (DAN, STAN, system prompt override signatures)
3. L2: Contextual Neural Classifier (Fine-tuned DeBERTa-v3 / DistilBERT)
4. L3: Attack Corpus Dense Vector Similarity (384-d semantic embedding matching)
"""

import time
import asyncio
import httpx
from typing import Dict, Any, Optional

from shared.schemas import CheckResult, CheckVerdict
from shared.config import GUARDRAILS_ML_URL
from shared.text_normalize import normalize_text
from services.guardrails_fast.patterns import scan_fast_patterns
from services.input_guard.scanners.code_unpack import is_likely_code, unpack_code_strings
from . import ScannerBase


class PromptInjectionScanner(ScannerBase):
    """Unified Production Prompt Injection Scanner."""

    def __init__(self, guardrails_ml_url: str = GUARDRAILS_ML_URL):
        self.ml_url = guardrails_ml_url

    async def scan(self, text: str, use_case: str = "customer_support", **kwargs) -> CheckResult:
        start = time.time()
        
        # ── 1. L0 Code Unpacking & Normalization
        effective_text = text
        if is_likely_code(text):
            unpacked = unpack_code_strings(text)
            if unpacked:
                effective_text = text + " " + " ".join(unpacked)

        norm = normalize_text(effective_text)

        # ── 2. L1 Fast Heuristic Pattern Scan
        l1_hits = scan_fast_patterns(effective_text)
        l1_score = 0.0
        pattern_categories = []
        if l1_hits:
            l1_score = max((h.get("score", 0.0) for h in l1_hits), default=0.0)
            pattern_categories = [h.get("category", "") for h in l1_hits]

        # ── 3. L2 Neural Classifier & L3 Vector Store
        neural_score = 0.0
        vector_similarity = 0.0
        top_match = {}

        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                inj_resp, sim_resp = await asyncio.gather(
                    client.post(f"{self.ml_url}/classify/injection", json={"text": effective_text, "use_case": use_case}),
                    client.post(f"{self.ml_url}/similarity/attack-corpus", json={"text": effective_text, "use_case": use_case}),
                    return_exceptions=True
                )
                if not isinstance(inj_resp, Exception) and inj_resp.status_code == 200:
                    data = inj_resp.json()
                    neural_score = float(data.get("score", 0.0))
                    for cat in data.get("categories", []):
                        if cat not in pattern_categories:
                            pattern_categories.append(cat)
                
                if not isinstance(sim_resp, Exception) and sim_resp.status_code == 200:
                    s_data = sim_resp.json()
                    vector_similarity = float(s_data.get("max_similarity", 0.0))
                    top_match = s_data.get("top_match", {})
        # Only consider vector similarity if it reaches high-confidence attack cluster threshold (>= 0.80)
        effective_vector_score = vector_similarity if vector_similarity >= 0.80 else 0.0
        final_score = max(l1_score, neural_score, effective_vector_score)

        layer = "L3_vector_store" if effective_vector_score >= max(l1_score, neural_score) and effective_vector_score > 0 else (
            "L2_contextual_ml" if neural_score >= l1_score else "L1_fast_patterns"
        )

        latency_ms = (time.time() - start) * 1000
        verdict = CheckVerdict.FAIL if final_score >= 0.80 else (CheckVerdict.WARN if final_score >= 0.40 else CheckVerdict.PASS)

        return CheckResult(
            check_name="prompt_injection",
            engine="aho_corasick_vector_deberta",
            score=round(final_score, 4),
            verdict=verdict,
            latency_ms=latency_ms,
            layer=layer,
            details={
                "vector_similarity": vector_similarity,
                "neural_score": neural_score,
                "l1_pattern_score": l1_score,
                "pattern_categories": pattern_categories,
                "top_attack_match": top_match
            }
        )
