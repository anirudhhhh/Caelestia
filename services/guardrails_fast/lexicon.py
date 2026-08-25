"""
ControlPlane.ai — Layer 1 High-Performance Aho-Corasick Lexicon Engine

Executes O(N) single-pass lexicon scanning across 50,000+ words/phrases using pyahocorasick.
Word boundary verification eliminates false positive substring matches.
"""

import time
import re
from typing import List, Tuple, Dict, Any, Optional
from shared.schemas import CheckResult, CheckVerdict
from shared.text_normalize import normalize_text, NormalizedText

try:
    import ahocorasick
    HAS_AHOCORASICK = True
except ImportError:
    HAS_AHOCORASICK = False

from services.guardrails_fast.wordlists import get_combined_wordlist_by_tier
from services.guardrails_fast.patterns import scan_fast_patterns

class AhoCorasickLexiconScanner:
    """High-performance Aho-Corasick automaton for multi-tier lexicon scanning."""

    def __init__(self):
        self.automata: Dict[str, Any] = {}
        self.word_tiers: Dict[str, str] = {}
        self._build_automata()

    def _build_automata(self):
        wordlists = get_combined_wordlist_by_tier()
        
        if HAS_AHOCORASICK:
            for tier, words in wordlists.items():
                auto = ahocorasick.Automaton()
                for idx, word in enumerate(words):
                    clean_w = word.strip().lower()
                    if clean_w:
                        auto.add_word(clean_w, (idx, clean_w))
                        self.word_tiers[clean_w] = tier
                auto.make_automaton()
                self.automata[tier] = auto

    def _is_word_boundary(self, text: str, start: int, end: int) -> bool:
        """Verifies that the match is bounded by non-word characters (or string edges)."""
        if start > 0 and (text[start - 1].isalnum() or text[start - 1] == '_'):
            return False
        if end < len(text) and (text[end].isalnum() or text[end] == '_'):
            return False
        return True

    def scan_text(self, text: str) -> Dict[str, Any]:
        """
        Scans normalized text through Aho-Corasick automaton & pattern matchers.
        Returns match metadata, max score, hits, and execution latency.
        """
        start_time = time.time()
        norm = normalize_text(text)

        hits_severe = []
        hits_moderate = []
        hits_mild = []

        # Texts to evaluate (canonical + leetspeak + compressed + decoded payloads)
        texts_to_check = [norm.canonical, norm.leetspeak_normalized, norm.compressed] + norm.decoded_payloads

        if HAS_AHOCORASICK:
            for target_str in texts_to_check:
                if not target_str:
                    continue
                for tier, auto in self.automata.items():
                    for end_idx, (idx, word) in auto.iter(target_str):
                        start_idx = end_idx - len(word) + 1
                        if self._is_word_boundary(target_str, start_idx, end_idx + 1):
                            if tier == "severe" and word not in hits_severe:
                                hits_severe.append(word)
                            elif tier == "moderate" and word not in hits_moderate:
                                hits_moderate.append(word)
                            elif tier == "mild" and word not in hits_mild:
                                hits_mild.append(word)
        else:
            # Fallback regex word boundary match
            wordlists = get_combined_wordlist_by_tier()
            for target_str in texts_to_check:
                words_in_text = set(re.findall(r'\b\w+\b', target_str.lower()))
                hits_severe.extend(words_in_text.intersection(wordlists["severe"]))
                hits_moderate.extend(words_in_text.intersection(wordlists["moderate"]))
                hits_mild.extend(words_in_text.intersection(wordlists["mild"]))

        # Also run fast heuristic pattern scan (for prompt injection / command injection)
        pattern_hits = scan_fast_patterns(text)

        # Calculate toxicity score based on highest tier hits
        score = 0.0
        if hits_severe:
            score = min(0.85 + (len(hits_severe) - 1) * 0.05, 1.0)
        elif hits_moderate:
            score = min(0.75 + (len(hits_moderate) - 1) * 0.05, 0.95)
        elif hits_mild:
            score = min(0.45 + (len(hits_mild) - 1) * 0.05, 0.65)

        latency_ms = (time.time() - start_time) * 1000

        all_matches = list(set(hits_severe + hits_moderate + hits_mild))

        return {
            "score": round(score, 2),
            "severe_matches": hits_severe,
            "moderate_matches": hits_moderate,
            "mild_matches": hits_mild,
            "all_matches": all_matches,
            "pattern_hits": pattern_hits,
            "latency_ms": latency_ms,
            "normalized": {
                "canonical": norm.canonical,
                "leetspeak": norm.leetspeak_normalized,
                "decoded_count": len(norm.decoded_payloads)
            }
        }

# Global singleton scanner instance
_GLOBAL_SCANNER: Optional[AhoCorasickLexiconScanner] = None

def get_lexicon_scanner() -> AhoCorasickLexiconScanner:
    global _GLOBAL_SCANNER
    if _GLOBAL_SCANNER is None:
        _GLOBAL_SCANNER = AhoCorasickLexiconScanner()
    return _GLOBAL_SCANNER
