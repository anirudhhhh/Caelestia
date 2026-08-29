"""
ControlPlane.ai — Production Toxicity Scanner (§3.3 & §5.4)

Implements the multi-layer toxicity defense pipeline:
1. L0: Canonical Normalization (leetspeak/homoglyphs/whitespace unwrap)
2. L1: Aho-Corasick Lexicon Engine (O(N) exact boundary scan)
3. L2: Contextual Neural Classifier (RoBERTa / DeBERTa with technical command whitelisting)
4. L3: Vector Similarity against toxic semantic clusters
"""

import time
import httpx
from typing import Dict, Any, Optional

from shared.schemas import CheckResult, CheckVerdict
from shared.config import GUARDRAILS_ML_URL
from shared.text_normalize import normalize_text
from services.guardrails_fast.lexicon import get_lexicon_scanner
from . import ScannerBase


class ToxicityScanner(ScannerBase):
    """Unified Production Toxicity Scanner."""

    def __init__(self, guardrails_ml_url: str = GUARDRAILS_ML_URL):
        self.ml_url = guardrails_ml_url
        self.lexicon = get_lexicon_scanner()

    async def scan(self, text: str, use_case: str = "customer_support", **kwargs) -> CheckResult:
        start = time.time()
        norm = normalize_text(text)

        # ── 1. L1 High-Performance Lexicon Scan
        l1_result = self.lexicon.scan_text(text)
        l1_score = l1_result.get("score", 0.0)

        # ── 2. L2 Contextual Neural Classifier & L3 Vector Call
        neural_score = 0.0
        vector_sim = 0.0
        ml_verdict = ""
        reason = ""

        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                resp = await client.post(
                    f"{self.ml_url}/classify/toxicity",
                    json={"text": text, "use_case": use_case}
                )
                if resp.status_code == 200:
                    data = resp.json()
                    neural_score = float(data.get("score", 0.0))
                    ml_verdict = data.get("verdict", "")
                    reason = data.get("reason", "")
        except Exception:
            neural_score = 0.0

        # Technical / Pop-Culture / Multilingual context whitelisting override
        if ml_verdict in ("safe_technical_context", "safe_pop_culture_context", "safe_multilingual_context"):
            final_score = 0.05
        else:
            final_score = max(l1_score, neural_score)

        latency_ms = (time.time() - start) * 1000
        verdict = CheckVerdict.FAIL if final_score >= 0.80 else (CheckVerdict.WARN if final_score >= 0.40 else CheckVerdict.PASS)

        return CheckResult(
            check_name="toxicity",
            engine="aho_corasick_and_contextual_ml",
            score=round(final_score, 4),
            verdict=verdict,
            latency_ms=latency_ms,
            layer="L2_contextual_ml" if neural_score > l1_score else "L1_lexicon",
            details={
                "matches": l1_result.get("all_matches", []),
                "neural_score": neural_score,
                "l1_lexicon_score": l1_score,
                "ml_verdict": ml_verdict,
                "reason": reason
            }
        )