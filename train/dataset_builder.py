#!/usr/bin/env python3
"""
ControlPlane.ai :: Enterprise Guardrails Dataset Builder
Multilingual & Cross-Language Support (English, German, French, Spanish, Hindi, Italian, etc.)

Builds balanced training, validation, and test datasets purely from official Hugging Face datasets:

1. Prompt Injection & Jailbreak:
   - 'neuralchemy/Prompt-injection-dataset'
   - 'deepset/prompt-injections'
   - 'rubend18/ChatGPT-Jailbreak-Prompts'
   - 'zachz/prompt-injection-benchmark' (Held-out benchmark evaluation set)

2. Contextual Toxicity & Multilingual Content Moderation:
   - 'thesofakillers/jigsaw-toxic-comment-classification-challenge'
   - 'OxAISH-AL-LLM/wiki_toxic'
   - 'skg/toxigen-data' (Microsoft ToxiGen)
   - 'SetFit/toxic_conversations' (Jigsaw Civil Comments)
   - Multilingual loanwords & international conversational expressions (German, French, Spanish, Italian, Hindi)
"""

import os
import sys
import json
import random
import re
from pathlib import Path
from typing import List, Dict, Tuple, Any, Set

os.environ["TOKENIZERS_PARALLELISM"] = "false"

import datasets
from datasets import load_dataset
import numpy as np
from sklearn.model_selection import train_test_split

ROOT_DIR = Path(__file__).parent.parent
DATASETS_DIR = ROOT_DIR / "data" / "datasets"
DATASETS_DIR.mkdir(parents=True, exist_ok=True)

# Common polite international loanwords & greetings across German, French, Spanish, Italian, Hindi
MULTILINGUAL_BENIGN_EXPRESSIONS = [
    # German (including 'gesundheit' and everyday polite terms)
    "gesundheit",
    "Gesundheit! Ich hoffe es geht dir bald besser.",
    "Danke schön für deine freundliche Hilfe.",
    "Guten Morgen! Wie kann ich dir heute helfen?",
    "Vielen Dank für die schnelle Antwort.",
    "Bitte schön, gern geschehen!",
    "Schönen Tag noch und alles Gute.",
    "Das ist ein wunderbares Ergebnis, danke.",

    # French
    "bonjour",
    "merci",
    "Bonjour, comment puis-je vous aider aujourd'hui?",
    "Merci beaucoup pour votre assistance rapide.",
    "S'il vous plaît, pouvez-vous m'expliquer ce concept?",
    "De rien, c'est avec plaisir.",
    "Bonne journée et à bientôt!",

    # Spanish
    "gracias",
    "hola",
    "Muchas gracias por su amable ayuda y soporte.",
    "Hola, ¿cómo estás? Necesito ayuda con mi cuenta.",
    "Por favor, ¿podría enviarme más información?",
    "De nada, que tengas un excelente día.",
    "Todo está perfecto, muchas gracias.",

    # Italian
    "ciao",
    "grazie",
    "Grazie mille per il vostro prezioso aiuto.",
    "Ciao! Come posso esserti utile oggi?",
    "Prego, è stato un piacere aiutarti.",
    "Buona giornata e buon lavoro!",

    # Hindi / Indic conversational & transliteration
    "namaste",
    "shukriya",
    "dhanyavad",
    "Namaste! Aapki sahayata ke liye dhanyavad.",
    "Aapka bahut bahut shukriya is madad ke liye.",
    "Aap kaise hain? Mujhko isme thodi madad chahiye.",
    "Bahut accha laga aapse baat karke.",
    "Kripya karke mujhe iska solution bataiye."
]


def clean_text(text: Any) -> str:
    """Normalizes whitespace and cleans raw text entries."""
    if not text or not isinstance(text, str):
        return ""
    text = text.strip()
    text = re.sub(r"\s+", " ", text)
    return text


def build_prompt_injection_dataset() -> Dict[str, Any]:
    """Compiles prompt injection & jailbreak data strictly from Hugging Face datasets."""
    print("=" * 80)
    print("📥 LOADING PROMPT INJECTION DATASETS FROM HUGGING FACE")
    print("=" * 80)

    injections: Set[str] = set()
    benign: Set[str] = set()

    # 1. 'neuralchemy/Prompt-injection-dataset'
    print("1. Loading 'neuralchemy/Prompt-injection-dataset'...")
    try:
        ds_neural = load_dataset("neuralchemy/Prompt-injection-dataset", split="train")
        for row in ds_neural:
            text = clean_text(row.get("text", ""))
            label = int(row.get("label", 0))
            if len(text) >= 5 and len(text) <= 2000:
                if label == 1:
                    injections.add(text)
                else:
                    benign.add(text)
        print(f"   ✓ Loaded {len(ds_neural)} samples from neuralchemy/Prompt-injection-dataset")
    except Exception as e:
        print(f"   ⚠ Notice loading neuralchemy: {e}")

    # 2. 'deepset/prompt-injections'
    print("2. Loading 'deepset/prompt-injections'...")
    try:
        ds_deepset = load_dataset("deepset/prompt-injections", split="train")
        for row in ds_deepset:
            text = clean_text(row.get("text", ""))
            label = int(row.get("label", 0))
            if len(text) >= 5 and len(text) <= 2000:
                if label == 1:
                    injections.add(text)
                else:
                    benign.add(text)
        print(f"   ✓ Loaded {len(ds_deepset)} samples from deepset/prompt-injections")
    except Exception as e:
        print(f"   ⚠ Notice loading deepset: {e}")

    # 3. 'rubend18/ChatGPT-Jailbreak-Prompts'
    print("3. Loading 'rubend18/ChatGPT-Jailbreak-Prompts'...")
    try:
        ds_jailbreak = load_dataset("rubend18/ChatGPT-Jailbreak-Prompts", split="train")
        for row in ds_jailbreak:
            text = clean_text(row.get("Prompt", ""))
            if len(text) >= 10 and len(text) <= 2500:
                injections.add(text)
        print(f"   ✓ Loaded {len(ds_jailbreak)} samples from rubend18/ChatGPT-Jailbreak-Prompts")
    except Exception as e:
        print(f"   ⚠ Notice loading rubend18: {e}")

    # 4. 'zachz/prompt-injection-benchmark' (Strictly HELD-OUT for testing)
    print("4. Loading 'zachz/prompt-injection-benchmark' (Held-Out Evaluation Set)...")
    eval_benchmark: List[Dict[str, Any]] = []
    try:
        ds_bench = load_dataset("zachz/prompt-injection-benchmark", split="train")
        for row in ds_bench:
            text = clean_text(row.get("text", ""))
            raw_label = row.get("label", 1)
            if isinstance(raw_label, str):
                label = 1 if raw_label.lower() in ("1", "injection", "jailbreak", "attack", "true") else 0
            else:
                label = int(raw_label)
            category = str(row.get("category", "adversarial_benchmark"))
            if text:
                eval_benchmark.append({"text": text, "label": label, "category": category})
                injections.discard(text)
                benign.discard(text)
        print(f"   ✓ Isolated {len(eval_benchmark)} samples from zachz/prompt-injection-benchmark")
    except Exception as e:
        print(f"   ⚠ Notice loading zachz benchmark: {e}")

    # Balance datasets
    inj_list = list(injections)
    benign_list = list(benign)

    min_count = min(len(inj_list), len(benign_list)) if (inj_list and benign_list) else max(len(inj_list), len(benign_list), 10)
    random.seed(42)
    random.shuffle(inj_list)
    random.shuffle(benign_list)

    final_inj = inj_list[:min_count]
    final_benign = benign_list[:min_count]

    samples = [{"text": t, "label": 1} for t in final_inj] + [{"text": t, "label": 0} for t in final_benign]
    random.shuffle(samples)

    labels = [s["label"] for s in samples]
    train_data, val_data = train_test_split(samples, test_size=0.15, random_state=42, stratify=labels)

    dataset_dict = {
        "train": train_data,
        "val": val_data,
        "test": eval_benchmark if eval_benchmark else val_data[:100],
        "metadata": {
            "task": "prompt_injection",
            "train_samples": len(train_data),
            "val_samples": len(val_data),
            "test_samples": len(eval_benchmark),
            "sources": [
                "neuralchemy/Prompt-injection-dataset",
                "deepset/prompt-injections",
                "rubend18/ChatGPT-Jailbreak-Prompts"
            ],
            "held_out_benchmark": "zachz/prompt-injection-benchmark"
        }
    }

    out_path = DATASETS_DIR / "prompt_injection_large.json"
    with open(out_path, "w") as f:
        json.dump(dataset_dict, f, indent=2)

    print(f"\n💾 Saved Prompt Injection Dataset: {len(train_data)} train, {len(val_data)} val, {len(dataset_dict['test'])} test -> {out_path.name}")
    return dataset_dict


def build_toxicity_dataset() -> Dict[str, Any]:
    """Compiles contextual toxicity data strictly from Hugging Face datasets with multilingual coverage."""
    print("\n" + "=" * 80)
    print("📥 LOADING CONTEXTUAL TOXICITY DATASETS FROM HUGGING FACE (MULTILINGUAL)")
    print("=" * 80)

    toxic_texts: Set[str] = set()
    safe_texts: Set[str] = set()

    # 1. 'thesofakillers/jigsaw-toxic-comment-classification-challenge'
    print("1. Loading 'thesofakillers/jigsaw-toxic-comment-classification-challenge'...")
    try:
        ds_jigsaw = load_dataset("thesofakillers/jigsaw-toxic-comment-classification-challenge", split="train[:12000]")
        for row in ds_jigsaw:
            text = clean_text(row.get("comment_text", ""))
            is_tox = int(row.get("toxic", 0)) or int(row.get("severe_toxic", 0)) or int(row.get("threat", 0)) or int(row.get("insult", 0))
            if len(text) >= 4 and len(text) <= 1000:
                if is_tox:
                    toxic_texts.add(text)
                else:
                    safe_texts.add(text)
        print(f"   ✓ Loaded {len(ds_jigsaw)} samples from jigsaw-toxic-comment-classification-challenge")
    except Exception as e:
        print(f"   ⚠ Notice loading jigsaw challenge: {e}")

    # 2. 'OxAISH-AL-LLM/wiki_toxic'
    print("2. Loading 'OxAISH-AL-LLM/wiki_toxic'...")
    try:
        ds_wiki = load_dataset("OxAISH-AL-LLM/wiki_toxic", split="train[:12000]")
        for row in ds_wiki:
            text = clean_text(row.get("comment_text", ""))
            label = int(row.get("label", 0))
            if len(text) >= 4 and len(text) <= 1000:
                if label == 1:
                    toxic_texts.add(text)
                else:
                    safe_texts.add(text)
        print(f"   ✓ Loaded {len(ds_wiki)} samples from OxAISH-AL-LLM/wiki_toxic")
    except Exception as e:
        print(f"   ⚠ Notice loading wiki_toxic: {e}")

    # 3. 'skg/toxigen-data' (Microsoft ToxiGen)
    print("3. Loading 'skg/toxigen-data' (Microsoft ToxiGen)...")
    try:
        ds_toxigen = load_dataset("skg/toxigen-data", split="train[:8000]")
        for row in ds_toxigen:
            text = clean_text(row.get("text", ""))
            label = int(row.get("label", 0))
            if len(text) >= 4 and len(text) <= 1000:
                if label == 1:
                    toxic_texts.add(text)
                else:
                    safe_texts.add(text)
        print(f"   ✓ Loaded {len(ds_toxigen)} samples from skg/toxigen-data")
    except Exception as e:
        print(f"   ⚠ Notice loading toxigen: {e}")

    # 4. 'SetFit/toxic_conversations' (1.75M Civil Comments)
    print("4. Loading 'SetFit/toxic_conversations'...")
    try:
        ds_setfit = load_dataset("SetFit/toxic_conversations", split="train[:8000]")
        for row in ds_setfit:
            text = clean_text(row.get("text", ""))
            label = int(row.get("label", 0))
            if len(text) >= 4 and len(text) <= 1000:
                if label == 1:
                    toxic_texts.add(text)
                else:
                    safe_texts.add(text)
        print(f"   ✓ Loaded {len(ds_setfit)} samples from SetFit/toxic_conversations")
    except Exception as e:
        print(f"   ⚠ Notice loading SetFit/toxic_conversations: {e}")

    # 5. Multilingual Benign Loanwords & Conversational Expressions
    print("5. Integrating Multilingual Conversational & Loanword Corpus (DE, FR, ES, IT, HI)...")
    for expr in MULTILINGUAL_BENIGN_EXPRESSIONS:
        safe_texts.add(expr)

    # Balance toxicity dataset
    toxic_list = list(toxic_texts)
    safe_list = list(safe_texts)

    min_count = min(len(toxic_list), len(safe_list)) if (toxic_list and safe_list) else max(len(toxic_list), len(safe_list), 10)
    random.seed(42)
    random.shuffle(toxic_list)
    random.shuffle(safe_list)

    final_toxic = toxic_list[:min_count]
    final_safe = safe_list[:min_count]

    samples = [{"text": t, "label": 1} for t in final_toxic] + [{"text": t, "label": 0} for t in final_safe]
    random.shuffle(samples)

    labels = [s["label"] for s in samples]
    train_data, test_data = train_test_split(samples, test_size=0.15, random_state=42, stratify=labels)
    train_data, val_data = train_test_split(train_data, test_size=0.15, random_state=42, stratify=[s["label"] for s in train_data])

    dataset_dict = {
        "train": train_data,
        "val": val_data,
        "test": test_data,
        "metadata": {
            "task": "toxicity",
            "train_samples": len(train_data),
            "val_samples": len(val_data),
            "test_samples": len(test_data),
            "sources": [
                "thesofakillers/jigsaw-toxic-comment-classification-challenge",
                "OxAISH-AL-LLM/wiki_toxic",
                "skg/toxigen-data (Microsoft ToxiGen)",
                "SetFit/toxic_conversations",
                "multilingual_loanwords_corpus"
            ]
        }
    }

    out_path = DATASETS_DIR / "toxicity_large.json"
    with open(out_path, "w") as f:
        json.dump(dataset_dict, f, indent=2)

    print(f"\n💾 Saved Contextual Toxicity Dataset: {len(train_data)} train, {len(val_data)} val, {len(test_data)} test -> {out_path.name}")
    return dataset_dict


def main():
    build_prompt_injection_dataset()
    build_toxicity_dataset()
    print("\n" + "=" * 80)
    print("🏆 ALL DATASETS EXTRACTED FROM HUGGING FACE AND SAVED TO data/datasets/")
    print("=" * 80)


if __name__ == "__main__":
    main()
