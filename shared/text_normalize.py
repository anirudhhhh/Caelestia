"""
ControlPlane.ai — Layer 0: Text Normalization & Anti-Evasion Library

Performs canonical text normalization to defeat homoglyph substitution,
leetspeak evasion, zero-width character insertion, whitespace/punctuation splitting,
and Base64/URL encoding obfuscation.
"""

import base64
import re
import urllib.parse
from typing import List, Tuple, NamedTuple, Optional
import unicodedata

try:
    from confusable_homoglyphs import confusables
    HAS_CONFUSABLES = True
except ImportError:
    HAS_CONFUSABLES = False

LEET_MAP = {
    '0': 'o',
    '1': 'i',
    '3': 'e',
    '4': 'a',
    '5': 's',
    '6': 'g',
    '7': 't',
    '8': 'b',
    '9': 'g',
    '@': 'a',
    '$': 's',
    '!': 'i',
    '+': 't',
    '|': 'l',
}

class NormalizedText(NamedTuple):
    original: str
    canonical: str
    leetspeak_normalized: str
    compressed: str
    decoded_payloads: List[str]

def fold_homoglyphs(text: str) -> str:
    """Folds non-Latin homoglyphs (Cyrillic, Greek, lookalikes) back to ASCII/Latin counterparts."""
    char_map = {
        'а': 'a', 'ɑ': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x',
        'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd', 'ԛ': 'q', 'ԝ': 'w',
        'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I',
        'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T',
        'Χ': 'X', 'Υ': 'Y', 'α': 'a', 'β': 'b', 'ε': 'e', 'ο': 'o'
    }

    result = []
    for char in text:
        if char in char_map:
            result.append(char_map[char])
            continue
        if HAS_CONFUSABLES:
            try:
                conf = confusables.is_confusable(char, preferred_aliases=['LATIN'])
                if conf and len(conf) > 0 and 'homoglyphs' in conf[0]:
                    homos = conf[0]['homoglyphs']
                    latin_homo = next((h['c'] for h in homos if 'LATIN' in h.get('n', '') or h.get('alias') == 'LATIN'), None)
                    if latin_homo:
                        result.append(latin_homo)
                        continue
            except Exception:
                pass
        result.append(char)
    return "".join(result)

def apply_leetspeak(text: str) -> str:
    """Translates common leetspeak substitutions to standard characters."""
    return "".join(LEET_MAP.get(ch.lower(), ch) for ch in text)

def strip_zero_width_and_delimiters(text: str) -> str:
    """Strips zero-width spaces, soft hyphens, and inserted inter-character punctuation/spaces."""
    # 1. Remove zero-width characters (U+200B-U+200D, U+FEFF, U+00AD)
    clean = re.sub(r'[\u200B-\u200D\uFEFF\u00AD]', '', text)
    # 2. Collapse inter-character punctuation/spacing like "b.a.d.w.o.r.d" or "b a d w o r d"
    # Match sequences of single letters separated by dots, spaces, hyphens, or underscores
    clean = re.sub(r'(?<=\b[a-zA-Z])[\s\._\-]+(?=[a-zA-Z]\b)', '', clean)
    return clean

def compress_repeated_chars(text: str) -> str:
    """Compresses 3 or more repeated characters down to 2 (e.g. baaaadword -> baadword)."""
    return re.sub(r'(.)\1{2,}', r'\1\1', text)

def detect_and_decode_payloads(text: str) -> List[str]:
    """Detects base64 or URL encoded segments and decodes 1 level deep."""
    decoded = []
    # URL decoding
    if '%' in text:
        try:
            unquoted = urllib.parse.unquote(text)
            if unquoted != text and len(unquoted.strip()) > 3:
                decoded.append(unquoted)
        except Exception:
            pass

    # Base64 detection (look for standard base64 strings length >= 12)
    b64_matches = re.findall(r'\b[A-Za-z0-9+/]{12,}={0,2}\b', text)
    for match in b64_matches:
        try:
            raw_bytes = base64.b64decode(match, validate=True)
            candidate = raw_bytes.decode('utf-8', errors='ignore').strip()
            if candidate and any(c.isalpha() for c in candidate) and len(candidate) > 2:
                decoded.append(candidate)
        except Exception:
            pass

    return decoded

def normalize_text(text: str) -> NormalizedText:
    """
    Executes Layer 0 text normalization pipeline.
    Returns NormalizedText tuple with original, canonical, leetspeak, compressed, and decoded payloads.
    """
    if not text:
        return NormalizedText(original="", canonical="", leetspeak_normalized="", compressed="", decoded_payloads=[])

    # 1. Unicode NFKC Normalization
    nfkc = unicodedata.normalize('NFKC', text)

    # 2. Homoglyph Folding (Cyrillic / Greek -> Latin)
    homo = fold_homoglyphs(nfkc)

    # 3. Strip zero-width & collapse inter-character punctuation/spaces
    stripped = strip_zero_width_and_delimiters(homo)

    # 4. Leetspeak substitution copy
    leet = apply_leetspeak(stripped)

    # 5. Compress 3+ repeated characters
    compressed = compress_repeated_chars(leet)

    # 6. Base64 & URL payload decoding
    decoded = detect_and_decode_payloads(text)

    # Canonical is lowercase stripped & homoglyph-folded
    canonical = stripped.lower()

    return NormalizedText(
        original=text,
        canonical=canonical,
        leetspeak_normalized=leet.lower(),
        compressed=compressed.lower(),
        decoded_payloads=decoded
    )
