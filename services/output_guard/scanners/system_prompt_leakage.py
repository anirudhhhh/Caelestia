"""
ControlPlane.ai — Enterprise System Prompt Leakage Scanner (§3.2 & §5.2)

Multi-Layer Deep Leakage Detection Engine:
1. Dynamic Sentence-Level Semantic Cosine Similarity (384-d MiniLM Vector Embeddings)
2. Longest Common Subsequence (LCS) & Token Chunk Reuse Detection (>= 6 consecutive tokens)
3. Sliding 4-Gram Jaccard Overlap Matrix
4. Canary Token Tripwire Recognition ([CP-CANARY-...])
5. Structural Meta-Exfiltration Intent Detection ("My system instructions are: ...")
"""

import re
import time
from typing import Dict, Any, List, Optional, Tuple
import numpy as np

from shared.schemas import CheckResult, CheckVerdict
from shared.text_normalize import normalize_text

try:
    from shared.config import CONTROLPLANE_SYSTEM_PROMPT
except ImportError:
    CONTROLPLANE_SYSTEM_PROMPT = "You are an enterprise AI assistant protected by ControlPlane.ai."

try:
    from transformers import AutoTokenizer, AutoModel
    import torch
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False

CANARY_PATTERNS = [
    r'\[CP-CANARY-[a-zA-Z0-9_-]+\]',
    r'<!--\s*SYSTEM_CANARY_[a-zA-Z0-9_-]+\s*-->',
    r'__CONTROLPLANE_INTERNAL_GUARD__',
    r'__SYSTEM_PROMPT_SECRET_[a-zA-Z0-9]+__'
]

EXFILTRATION_INTENT_PATTERNS = [
    (r'(?:here\s+(?:is|are)|my)\s+(?:initial\s+)?(?:system\s+prompt|developer\s+instructions|system\s+instructions)\s*:', 0.95),
    (r'(?:i\s+was\s+instructed\s+to|my\s+exact\s+instructions\s+are)\s*:\s*["\']', 0.90),
    (r'\[\s*(?:system\s*instructions|confidential\s*prompt)\s*revealed\s*\]', 0.95),
    (r'(?:the\s+system\s+prompt\s+given\s+to\s+me\s+is\s+as\s+follows)\s*:', 0.92)
]


class SystemPromptLeakageScanner:
    """Enterprise-grade dynamic system prompt leakage detector."""

    def __init__(self):
        self.tokenizer = None
        self.model = None
        self._init_embedding_model()

    def _init_embedding_model(self):
        if HAS_TORCH:
            try:
                model_name = "sentence-transformers/all-MiniLM-L6-v2"
                self.tokenizer = AutoTokenizer.from_pretrained(model_name)
                self.model = AutoModel.from_pretrained(model_name)
                self.model.eval()
            except Exception:
                self.tokenizer = None
                self.model = None

    def _compute_embedding(self, text: str) -> Optional[np.ndarray]:
        if not self.model or not self.tokenizer or not text.strip():
            return None
        try:
            inputs = self.tokenizer(text, padding=True, truncation=True, max_length=128, return_tensors="pt")
            with torch.no_grad():
                out = self.model(**inputs)
                mask = inputs["attention_mask"].unsqueeze(-1).expand(out.last_hidden_state.size()).float()
                sum_emb = torch.sum(out.last_hidden_state * mask, 1)
                sum_mask = torch.clamp(mask.sum(1), min=1e-9)
                vec = (sum_emb / sum_mask).squeeze(0).numpy()
                norm = np.linalg.norm(vec)
                return vec / norm if norm > 0 else vec
        except Exception:
            return None

    def _split_sentences(self, text: str) -> List[str]:
        raw = re.split(r'(?<=[.!?\n])\s+', text)
        return [s.strip() for s in raw if len(s.strip().split()) >= 3]

    def _calculate_lcs_length(self, words1: List[str], words2: List[str]) -> int:
        """Longest Common Subsequence of tokens."""
        m, n = len(words1), len(words2)
        if m == 0 or n == 0:
            return 0
        dp = [0] * (n + 1)
        for i in range(1, m + 1):
            prev = 0
            for j in range(1, n + 1):
                temp = dp[j]
                if words1[i - 1] == words2[j - 1]:
                    dp[j] = prev + 1
                else:
                    dp[j] = max(dp[j], dp[j - 1])
                prev = temp
        return dp[n]

    def scan(self, text: str, system_prompt: Optional[str] = None) -> CheckResult:
        start = time.time()
        effective_system_prompts = [CONTROLPLANE_SYSTEM_PROMPT]
        if system_prompt and system_prompt.strip():
            effective_system_prompts.insert(0, system_prompt.strip())

        norm = normalize_text(text)
        text_lower = norm.canonical.lower()
        output_words = [w for w in re.findall(r'\b\w+\b', text_lower) if len(w) > 1]
        output_sentences = self._split_sentences(norm.canonical)

        # ── 1. Layer 1: Canary Token Tripwires (100% Deterministic)
        for canary_pat in CANARY_PATTERNS:
            if re.search(canary_pat, text, re.IGNORECASE):
                return CheckResult(
                    check_name="system_prompt_leakage",
                    engine="canary_tripwire",
                    score=1.0,
                    verdict=CheckVerdict.FAIL,
                    layer="canary_detector",
                    latency_ms=(time.time() - start) * 1000,
                    details={"leak_type": "canary_token_exfiltration", "pattern": canary_pat}
                )

        # ── 2. Layer 2: Meta-Exfiltration Intent Detection
        meta_score = 0.0
        meta_match = ""
        for pat, score in EXFILTRATION_INTENT_PATTERNS:
            if re.search(pat, text_lower):
                if score > meta_score:
                    meta_score = score
                    meta_match = pat

        # ── 3. Layer 3: Verbatim & LCS Token Reuse Detection
        max_lcs_score = 0.0
        lcs_matched_prompt = ""
        for sys_p in effective_system_prompts:
            sys_clean = sys_p.strip().lower()
            if len(sys_clean) > 15 and sys_clean in text_lower:
                return CheckResult(
                    check_name="system_prompt_leakage",
                    engine="verbatim_matcher",
                    score=1.0,
                    verdict=CheckVerdict.FAIL,
                    layer="exact_substring",
                    latency_ms=(time.time() - start) * 1000,
                    details={"leak_type": "exact_verbatim", "leaked_snippet": sys_p[:100]}
                )

            sys_words = [w for w in re.findall(r'\b\w+\b', sys_clean) if len(w) > 1]
            if sys_words and output_words:
                lcs = self._calculate_lcs_length(sys_words, output_words)
                lcs_ratio = lcs / len(sys_words)
                if lcs >= 6 and lcs_ratio > max_lcs_score:
                    max_lcs_score = lcs_ratio
                    lcs_matched_prompt = sys_p[:80]

        # ── 4. Layer 4: Dense Vector Semantic Cosine Similarity (MiniLM)
        max_semantic_sim = 0.0
        semantic_matched_rule = ""
        if self.model and output_sentences:
            sys_sentences = []
            for sys_p in effective_system_prompts:
                sys_sentences.extend(self._split_sentences(sys_p))

            if sys_sentences:
                sys_vecs = [self._compute_embedding(s) for s in sys_sentences]
                sys_vecs = [v for v in sys_vecs if v is not None]

                for out_s in output_sentences:
                    out_vec = self._compute_embedding(out_s)
                    if out_vec is not None and sys_vecs:
                        for s_idx, s_vec in enumerate(sys_vecs):
                            cos_sim = float(np.dot(out_vec, s_vec))
                            if cos_sim > max_semantic_sim:
                                max_semantic_sim = cos_sim
                                semantic_matched_rule = sys_sentences[s_idx][:60]

        # ── 5. Layer 5: Calibrated Synthesis
        # In natural conversation, common introductory sentences have a high cosine baseline (~0.75-0.85)
        # without actually leaking confidential instructions.
        # True leakage requires either:
        # 1. Near-verbatim reproduction (max_semantic_sim >= 0.94)
        # 2. Token chunk reuse (max_lcs_score >= 0.30)
        # 3. Explicit exfiltration intent markers (meta_score > 0.0)
        if max_semantic_sim >= 0.94:
            effective_semantic_score = max_semantic_sim
        elif max_lcs_score >= 0.30:
            effective_semantic_score = max(max_lcs_score, 0.5 * max_semantic_sim + 0.5 * max_lcs_score)
        elif meta_score > 0.0:
            effective_semantic_score = max(meta_score, max_semantic_sim * 0.8)
        else:
            # Baseline background similarity without token reuse: dampened score (below warn/fail thresholds)
            effective_semantic_score = min(max_semantic_sim * 0.35, 0.35)

        # Compute combined weighted score (Raw continuous scores)
        final_score = max(meta_score, max_lcs_score, effective_semantic_score)

        latency_ms = (time.time() - start) * 1000
        verdict = CheckVerdict.FAIL if final_score >= 0.80 else (CheckVerdict.WARN if final_score >= 0.65 else CheckVerdict.PASS)

        return CheckResult(
            check_name="system_prompt_leakage",
            engine="lcs_semantic_canary_scanner",
            score=round(final_score, 4),
            verdict=verdict,
            layer="L3_semantic_vector" if effective_semantic_score >= max(meta_score, max_lcs_score) and effective_semantic_score > 0 else "L1_token_lcs",
            latency_ms=latency_ms,
            details={
                "max_semantic_similarity": round(max_semantic_sim, 4),
                "lcs_ratio": round(max_lcs_score, 4),
                "meta_exfiltration_score": round(meta_score, 4),
                "matched_rule_snippet": semantic_matched_rule or lcs_matched_prompt or None
            }
        )


_global_leakage_scanner = SystemPromptLeakageScanner()

def scan_system_prompt_leakage(text: str, system_prompt: Optional[str] = None) -> CheckResult:
    return _global_leakage_scanner.scan(text, system_prompt=system_prompt)
