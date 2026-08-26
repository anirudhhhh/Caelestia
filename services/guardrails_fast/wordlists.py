"""
ControlPlane.ai — Layer 1 Wordlists Dataset

Curated multi-lingual wordlists compiled from LDNOOBW, better_profanity,
and security violation taxonomies.
"""

from typing import Dict, Set

# Severe Violations: Hate speech, physical threats, explicit slurs, self-harm
SEVERE_WORDLIST: Set[str] = {
    "kill", "murder", "assassinate", "genocide", "nigger", "faggot", "ky2", "suicide",
    "slaughter", "behead", "exterminate", "holocaust", "rape", "pedophile", "cp",
    "chitchat_kill", "bombing", "terrorist", "massacre", "lynch"
}

# Moderate Violations: Harassment, vulgarity, offensive profanity
MODERATE_WORDLIST: Set[str] = {
    "fuck", "shit", "bitch", "cunt", "bastard", "dick",
    "pussy", "whore", "slut", "motherfucker", "cock", "asshole", "dumbass", "jackass",
    "retard", "crap", "bullshit", "dipshit", "piss", "prick", "twat", "wanker"
}

# Mild Violations: Mild insults, aggressiveness
MILD_WORDLIST: Set[str] = {
    "idiot", "stupid", "dumb", "trash", "fool", "useless", "shut up", "loser",
    "moron", "jerk", "annoying", "lame", "garbage", "freak", "suck", "hater"
}

# Multi-lingual Curated Extensions (ES, FR, DE, RU)
MULTILINGUAL_WORDLIST: Dict[str, Set[str]] = {
    "es": {"asesinar", "matar", "mierda", "puta", "cabron", "pendejo", "maricon", "joder"},
    "fr": {"tuer", "assassiner", "merde", "putain", "salope", "connard", "encule"},
    "de": {"töten", "morden", "scheiße", "fotze", "arschloch", "wichser", "hurensohn"},
    "ru": {"убить", "убийство", "сука", "блять", "пидор", "говно", "хуй", "пизда"}
}

def get_combined_wordlist_by_tier() -> Dict[str, Set[str]]:
    """Returns combined wordlists structured by severity tier."""
    severe = set(SEVERE_WORDLIST)
    moderate = set(MODERATE_WORDLIST)
    mild = set(MILD_WORDLIST)

    for lang, words in MULTILINGUAL_WORDLIST.items():
        if lang in ("ru", "es", "fr", "de"):
            for w in words:
                if any(kw in w for kw in ["убить", "tuer", "töten", "asesinar"]):
                    severe.add(w)
                else:
                    moderate.add(w)

    return {
        "severe": severe,
        "moderate": moderate,
        "mild": mild
    }
