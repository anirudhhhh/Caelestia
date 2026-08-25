"""
ControlPlane.ai — Guardrails Fast (L1 Lexicon & Anti-Evasion Engine)
"""

from .lexicon import get_lexicon_scanner, AhoCorasickLexiconScanner
from .patterns import scan_fast_patterns
from .wordlists import get_combined_wordlist_by_tier

__all__ = ["get_lexicon_scanner", "AhoCorasickLexiconScanner", "scan_fast_patterns", "get_combined_wordlist_by_tier"]
