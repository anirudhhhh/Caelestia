"""
ControlPlane.ai — Layer 2 Contextual Neural Classifiers

Evaluates contextual toxicity and prompt injection / jailbreak risk using:
1. Fine-tuned PyTorch Sequence Classification Models (RoBERTa / DeBERTa / MiniLM)
2. Context-aware technical disambiguation ("kill deployment" vs "kill him")
3. Reframed hostility & dehumanization detection
4. Delimiter and roleplay jailbreak detection
"""

import re
import time
from pathlib import Path
from typing import Dict, Any, List, Optional

import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

from shared.text_normalize import normalize_text

MODELS_DIR = Path(__file__).parent.parent.parent / "models"
TOXICITY_MODEL_DIR = MODELS_DIR / "toxicity_roberta"
INJECTION_MODEL_DIR = MODELS_DIR / "prompt_injection_deberta"

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

# Reframed Hostility Patterns
REFRAMED_HOSTILITY_PATTERNS = [
    (r'\bpeople\s+like\s+you\s+(?:shouldn\'t|should\s+not)\s+be\s+allowed\b', 0.85, "marginalization"),
    (r'\byou\s+(?:are\s+a|are)\s+(?:parasite|cancer|disease|waste\s+of\s+oxygen)\b', 0.90, "dehumanization"),
    (r'\bno\s+one\s+would\s+miss\s+you\s+if\s+you\b', 0.88, "self_harm_encouragement"),
    (r'\bgo\s+end\s+it\s+all\b', 0.92, "self_harm_encouragement"),
    (r'\byour\s+kind\s+(?:does\s+not|doesn\'t)\s+belong\b', 0.85, "group_hate")
]

# Advanced Prompt Injection Patterns
PROMPT_INJECTION_NEURAL_PATTERNS = [
    (r'(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|rules)', 0.95, "instruction_override"),
    (r'(?:act\s+as|pretend\s+to\s+be|roleplay\s+as)\s+(?:an?\s+unfiltered|DAN|STAN|EvilAI|jailbroken|unrestricted)', 0.95, "roleplay_jailbreak"),
    (r'\[\s*SYSTEM\s*PROMPT\s*\]|\<system_instruction\>|```system', 0.90, "delimiter_injection"),
    (r'(?:print|output|repeat|show|reveal)\s+(?:everything\s+above|your\s+system\s+prompt|initial\s+instructions)', 0.88, "system_prompt_exfiltration"),
    (r'(?:translate|encode|convert)\s+the\s+following\s+(?:harmful|blocked|illegal)\s+(?:prompt|text)', 0.85, "encoding_bypass"),
    (r'(?:hypothetically|for\s+educational\s+purposes\s+only|in\s+a\s+fictional\s+story)\s+how\s+(?:to|can\s+I)\s+(?:make|build|create)\s+(?:a\s+bomb|poison|virus|weapon)', 0.92, "fictional_framing_bypass")
]


def calibrate_probability(raw_prob: float, noise_floor: float = 0.35) -> float:
    """
    Calibrates raw neural sequence classifier probability to remove ambient noise floor
    and map clean benign queries to true ~0.0% confidence.
    """
    if raw_prob <= 0.0:
        return 0.0
    if raw_prob < noise_floor:
        return (raw_prob / noise_floor) * 0.02
    return 0.02 + ((raw_prob - noise_floor) / (1.0 - noise_floor)) * 0.98


class ContextualToxicityClassifier:
    """Evaluates contextual toxicity using fine-tuned neural models & technical filtering."""

    def __init__(self):
        self.device = torch.device("cpu")
        self.tokenizer = None
        self.model = None
        self._load_model()

    def _load_model(self):
        try:
            if TOXICITY_MODEL_DIR.exists():
                self.tokenizer = AutoTokenizer.from_pretrained(str(TOXICITY_MODEL_DIR))
                self.model = AutoModelForSequenceClassification.from_pretrained(str(TOXICITY_MODEL_DIR)).to(self.device)
                self.model.eval()
        except Exception:
            self.tokenizer = None
            self.model = None

    def predict(self, text: str) -> Dict[str, Any]:
        start = time.time()
        norm = normalize_text(text)
        text_lower = text.lower()

        # 1. Fast Path: Check Technical Safe Contexts
        for pattern in TECHNICAL_SAFE_CONTEXTS:
            if re.search(pattern, text_lower):
                return {
                    "score": 0.01,
                    "verdict": "safe_technical_context",
                    "reason": "Matched technical command context (e.g. process/thread/table operation)",
                    "engine": "contextual_neural_classifier",
                    "latency_ms": (time.time() - start) * 1000
                }

        # 2. Fast Path: Check Pop-Culture / Media / Gaming Safe Contexts
        for pattern in POP_CULTURE_SAFE_CONTEXTS:
            if re.search(pattern, text_lower):
                return {
                    "score": 0.01,
                    "verdict": "safe_pop_culture_context",
                    "reason": "Matched pop-culture, media, or gaming title context (e.g. Killer Bunnies, Monty Python)",
                    "engine": "contextual_neural_classifier",
                    "latency_ms": (time.time() - start) * 1000
                }

        # 3. Neural Classifier Inference
        neural_score = 0.0
        if self.model and self.tokenizer:
            try:
                inputs = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=128, padding=True).to(self.device)
                with torch.no_grad():
                    outputs = self.model(**inputs)
                    probs = torch.softmax(outputs.logits, dim=-1)[0]
                    neural_score = float(probs[1].item()) if probs.shape[0] > 1 else float(probs[0].item())
            except Exception:
                neural_score = 0.0

        # 4. Check Reframed Hostility
        reframed_score = 0.0
        reframed_reason = ""
        for pattern, score, category in REFRAMED_HOSTILITY_PATTERNS:
            if re.search(pattern, norm.canonical) or re.search(pattern, norm.leetspeak_normalized):
                if score > reframed_score:
                    reframed_score = score
                    reframed_reason = f"Matched reframed hostility pattern: {category}"

        # Heuristic Lexicon Fallback
        toxic_terms = ["kill", "murder", "hate", "rape", "die", "attack", "destroy", "abuse", "trash", "idiot", "bitch", "shit", "fuck"]
        words = set(re.findall(r'\b\w+\b', norm.canonical))
        hits = words.intersection(toxic_terms)
        heuristic_score = 0.0
        if hits:
            heuristic_score = min(0.85 + (len(hits) - 1) * 0.05, 0.98)

        calibrated_neural = calibrate_probability(neural_score)
        final_score = max(calibrated_neural, reframed_score, heuristic_score)

        return {
            "score": round(final_score, 4),
            "verdict": "toxic" if final_score >= 0.70 else ("warn" if final_score >= 0.40 else "safe"),
            "neural_score": round(neural_score, 4),
            "calibrated_score": round(calibrated_neural, 4),
            "engine": "contextual_neural_classifier",
            "hits": list(hits) if hits else [],
            "reframed_reason": reframed_reason,
            "latency_ms": (time.time() - start) * 1000
        }


class PromptInjectionClassifier:
    """Evaluates prompt injection and jailbreak attacks using fine-tuned neural models."""

    def __init__(self):
        self.device = torch.device("cpu")
        self.tokenizer = None
        self.model = None
        self._load_model()

    def _load_model(self):
        try:
            if INJECTION_MODEL_DIR.exists():
                self.tokenizer = AutoTokenizer.from_pretrained(str(INJECTION_MODEL_DIR))
                self.model = AutoModelForSequenceClassification.from_pretrained(str(INJECTION_MODEL_DIR)).to(self.device)
                self.model.eval()
        except Exception:
            self.tokenizer = None
            self.model = None

    def predict(self, text: str) -> Dict[str, Any]:
        start = time.time()
        norm = normalize_text(text)

        # 1. Neural Classifier Inference
        neural_score = 0.0
        if self.model and self.tokenizer:
            try:
                inputs = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=128, padding=True).to(self.device)
                with torch.no_grad():
                    outputs = self.model(**inputs)
                    probs = torch.softmax(outputs.logits, dim=-1)[0]
                    neural_score = float(probs[1].item()) if probs.shape[0] > 1 else float(probs[0].item())
            except Exception:
                neural_score = 0.0

        # 2. Fast Pattern Heuristics
        pattern_score = 0.0
        matched_categories = []
        texts_to_check = [norm.canonical, norm.leetspeak_normalized] + norm.decoded_payloads

        for target_str in texts_to_check:
            for pattern, score, category in PROMPT_INJECTION_NEURAL_PATTERNS:
                if re.search(pattern, target_str, re.IGNORECASE):
                    if score > pattern_score:
                        pattern_score = score
                    if category not in matched_categories:
                        matched_categories.append(category)

        calibrated_neural = calibrate_probability(neural_score)
        final_score = max(calibrated_neural, pattern_score)

        return {
            "score": round(final_score, 4),
            "verdict": "injection_detected" if final_score >= 0.70 else ("warn" if final_score >= 0.40 else "safe"),
            "neural_score": round(neural_score, 4),
            "calibrated_score": round(calibrated_neural, 4),
            "pattern_score": round(pattern_score, 4),
            "categories": matched_categories,
            "engine": "deberta_neural_classifier",
            "latency_ms": (time.time() - start) * 1000
        }
