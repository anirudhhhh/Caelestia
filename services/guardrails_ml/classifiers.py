"""
ControlPlane.ai — Layer 2 Contextual Neural Classifiers

Evaluates contextual toxicity and prompt injection / jailbreak risk.
Features context-aware technical disambiguation ("kill deployment" vs "kill him")
and reframed hostility detection without explicit banned words.
"""

import re
import time
from typing import Dict, Any, List, Optional
from shared.text_normalize import normalize_text

# Technical / Safe contextual phrases where terms like "kill", "execute", "terminate", "drop" are non-toxic
TECHNICAL_SAFE_CONTEXTS = [
    r'\bkill\s+(?:the\s+)?(?:background\s+|running\s+|stuck\s+|idle\s+|active\s+|local\s+|remote\s+)?(?:process|job|task|thread|app|pod|container|server|daemon|session|script|query|db|worker|service|deployment)\b',
    r'\bterminate\s+(?:the\s+)?(?:background\s+|running\s+|stuck\s+|idle\s+|active\s+|local\s+|remote\s+)?(?:process|thread|session|connection|task|worker|job)\b',
    r'\bexecute\s+(?:the\s+)?(?:command|code|script|binary|sql|function|pipeline|job|query)\b',
    r'\bdrop\s+(?:the\s+)?(?:table|database|index|schema|column|view|constraint|foreign\s+key)\b',
    r'\babort\s+(?:the\s+)?(?:request|transaction|operation|download|build)\b',
    r'\bdestroy\s+(?:the\s+)?(?:instance|cluster|infrastructure|stack|resource)\b',
    r'\bhang\s+up\b',
    r'\bkill\s+-9\b',
    r'\bkillall\b'
]

POP_CULTURE_SAFE_CONTEXTS = [
    r'\bkiller\s+bunnies\b',
    r'\bkiller\s+whale\b',
    r'\bkill\s+bill\b',
    r'\bto\s+kill\s+a\s+mockingbird\b',
    r'\bkill\s+switch\b',
    r'\bkiller\s+app\b',
    r'\bkiller\s+instinct\b',
    r'\brabbit\s+of\s+caerbannog\b',
    r'\bmonty\s+python\b'
]

# Reframed Hostility Patterns (No explicit profanity, but hateful/harassing framing)
REFRAMED_HOSTILITY_PATTERNS = [
    (r'\bpeople\s+like\s+you\s+(?:shouldn\'t|should\s+not)\s+be\s+allowed\b', 0.85, "marginalization"),
    (r'\byou\s+(?:are\s+a|are)\s+(?:parasite|cancer|disease|waste\s+of\s+oxygen)\b', 0.90, "dehumanization"),
    (r'\bno\s+one\s+would\s+miss\s+you\s+if\s+you\b', 0.88, "self_harm_encouragement"),
    (r'\bgo\s+end\s+it\s+all\b', 0.92, "self_harm_encouragement"),
    (r'\byour\s+kind\s+(?:does\s+not|doesn\'t)\s+belong\b', 0.85, "group_hate")
]

# Advanced Prompt Injection & Jailbreak Neural Classifier Heuristics
PROMPT_INJECTION_NEURAL_PATTERNS = [
    (r'(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|rules)', 0.95, "instruction_override"),
    (r'(?:act\s+as|pretend\s+to\s+be|roleplay\s+as)\s+(?:an?\s+unfiltered|DAN|STAN|EvilAI|jailbroken|unrestricted)', 0.95, "roleplay_jailbreak"),
    (r'\[\s*SYSTEM\s*PROMPT\s*\]|\<system_instruction\>|```system', 0.90, "delimiter_injection"),
    (r'(?:print|output|repeat|show|reveal)\s+(?:everything\s+above|your\s+system\s+prompt|initial\s+instructions)', 0.88, "system_prompt_exfiltration"),
    (r'(?:translate|encode|convert)\s+the\s+following\s+(?:harmful|blocked|illegal)\s+(?:prompt|text)', 0.85, "encoding_bypass"),
    (r'(?:hypothetically|for\s+educational\s+purposes\s+only|in\s+a\s+fictional\s+story)\s+how\s+(?:to|can\s+I)\s+(?:make|build|create)\s+(?:a\s+bomb|poison|virus|weapon)', 0.92, "fictional_framing_bypass")
]

class ContextualToxicityClassifier:
    """Evaluates contextual toxicity with technical and pop-culture context filtering."""

    def predict(self, text: str) -> Dict[str, Any]:
        start = time.time()
        norm = normalize_text(text)
        text_lower = text.lower()

        # 1. Check Technical Safe Contexts
        for pattern in TECHNICAL_SAFE_CONTEXTS:
            if re.search(pattern, text_lower):
                return {
                    "score": 0.05,
                    "verdict": "safe_technical_context",
                    "reason": "Matched technical command context (e.g. process/thread/table operation)",
                    "latency_ms": (time.time() - start) * 1000
                }

        # 2. Check Pop-Culture / Media / Gaming Safe Contexts
        for pattern in POP_CULTURE_SAFE_CONTEXTS:
            if re.search(pattern, text_lower):
                return {
                    "score": 0.05,
                    "verdict": "safe_pop_culture_context",
                    "reason": "Matched pop-culture, media, or gaming title context (e.g. Killer Bunnies, Monty Python)",
                    "latency_ms": (time.time() - start) * 1000
                }

        # 2. Check Reframed Hostility
        for pattern, score, category in REFRAMED_HOSTILITY_PATTERNS:
            if re.search(pattern, norm.canonical) or re.search(pattern, norm.leetspeak_normalized):
                return {
                    "score": score,
                    "verdict": "toxic_reframed_hostility",
                    "reason": f"Matched reframed hostility pattern: {category}",
                    "latency_ms": (time.time() - start) * 1000
                }

        # 3. Contextual Toxicity Heuristic / Classifier score
        toxic_terms = ["kill", "murder", "hate", "rape", "die", "attack", "destroy", "abuse"]
        words = set(re.findall(r'\b\w+\b', norm.canonical))
        hits = words.intersection(toxic_terms)

        score = 0.0
        if hits:
            score = min(0.85 + (len(hits) - 1) * 0.05, 0.98)

        return {
            "score": round(score, 2),
            "verdict": "toxic" if score >= 0.70 else "safe",
            "hits": list(hits),
            "latency_ms": (time.time() - start) * 1000
        }

class PromptInjectionClassifier:
    """Neural & heuristic classifier for prompt injection and jailbreak attacks."""

    def predict(self, text: str) -> Dict[str, Any]:
        start = time.time()
        norm = normalize_text(text)

        max_score = 0.0
        matched_categories = []

        texts_to_check = [norm.canonical, norm.leetspeak_normalized] + norm.decoded_payloads

        for target_str in texts_to_check:
            for pattern, score, category in PROMPT_INJECTION_NEURAL_PATTERNS:
                if re.search(pattern, target_str, re.IGNORECASE):
                    if score > max_score:
                        max_score = score
                    if category not in matched_categories:
                        matched_categories.append(category)

        return {
            "score": round(max_score, 2),
            "verdict": "injection_detected" if max_score >= 0.70 else "safe",
            "categories": matched_categories,
            "latency_ms": (time.time() - start) * 1000
        }
