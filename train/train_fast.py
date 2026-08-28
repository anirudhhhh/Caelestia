"""
ControlPlane.ai — High-Speed Native PyTorch Training Engine

Trains both:
1. Prompt Injection Classifier (DeBERTa-v3 / DistilBERT)
2. Contextual Toxicity Classifier (DistilRoBERTa / RoBERTa)

Uses native PyTorch AdamW with MPS/CPU acceleration and explicit step-by-step metric tracking.
"""

import os
import sys
import json
import time
from pathlib import Path
from typing import List, Dict, Tuple

import torch
from torch.utils.data import Dataset, DataLoader
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import numpy as np

# Adjust path
ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

MODELS_DIR = ROOT_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

torch.manual_seed(42)
np.random.seed(42)

# Import Comprehensive Datasets
from train.training_data import PROMPT_INJECTION_DATASET, TOXICITY_DATASET


class TextClassificationDataset(Dataset):
    def __init__(self, texts: List[str], labels: List[int], tokenizer, max_length: int = 128):
        self.encodings = tokenizer(
            texts,
            truncation=True,
            padding="max_length",
            max_length=max_length,
            return_tensors="pt"
        )
        self.labels = torch.tensor(labels, dtype=torch.long)

    def __getitem__(self, idx):
        item = {key: val[idx] for key, val in self.encodings.items()}
        item["labels"] = self.labels[idx]
        return item

    def __len__(self):
        return len(self.labels)


def train_single_model(
    task_name: str,
    dataset_raw: List[Tuple[str, int]],
    base_model_name: str,
    save_path: Path,
    epochs: int = 4,
    lr: float = 3e-5,
    batch_size: int = 8
):
    print("\n" + "=" * 75, flush=True)
    print(f"🚀 TRAINING: {task_name.upper()} ({base_model_name})", flush=True)
    print("=" * 75, flush=True)

    device = torch.device("cpu")
    print(f"Hardware Device: CPU (Zero-stall low latency)", flush=True)

    # Expand dataset with variations
    texts, labels = [], []
    for text, label in dataset_raw:
        texts.append(text)
        labels.append(label)
        texts.append(text.lower())
        labels.append(label)

    # 80/20 train/validation split
    indices = np.random.permutation(len(texts))
    split = int(0.8 * len(texts))
    train_idx, val_idx = indices[:split], indices[split:]

    train_texts = [texts[i] for i in train_idx]
    train_labels = [labels[i] for i in train_idx]
    val_texts = [texts[i] for i in val_idx]
    val_labels = [labels[i] for i in val_idx]

    print(f"Dataset Size: {len(texts)} samples (Train: {len(train_texts)}, Validation: {len(val_texts)})")

    print(f"Loading tokenizer & weights for {base_model_name}...")
    try:
        tokenizer = AutoTokenizer.from_pretrained(base_model_name)
        model = AutoModelForSequenceClassification.from_pretrained(base_model_name, num_labels=2).to(device)
    except Exception as e:
        print(f"Failed to load {base_model_name} ({e}), falling back to distilbert-base-uncased...")
        base_model_name = "distilbert-base-uncased"
        tokenizer = AutoTokenizer.from_pretrained(base_model_name)
        model = AutoModelForSequenceClassification.from_pretrained(base_model_name, num_labels=2).to(device)

    train_ds = TextClassificationDataset(train_texts, train_labels, tokenizer)
    val_ds = TextClassificationDataset(val_texts, val_labels, tokenizer)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    criterion = torch.nn.CrossEntropyLoss()

    best_val_f1 = 0.0
    start_train_time = time.time()

    for epoch in range(1, epochs + 1):
        model.train()
        total_loss = 0.0
        for batch in train_loader:
            optimizer.zero_grad()
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            target_labels = batch["labels"].to(device)

            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            loss = criterion(outputs.logits, target_labels)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        avg_train_loss = total_loss / len(train_loader)

        # Validation Step
        model.eval()
        val_preds, val_targets, val_scores = [], [], []
        with torch.no_grad():
            for batch in val_loader:
                input_ids = batch["input_ids"].to(device)
                attention_mask = batch["attention_mask"].to(device)
                target_labels = batch["labels"].to(device)

                outputs = model(input_ids=input_ids, attention_mask=attention_mask)
                probs = torch.softmax(outputs.logits, dim=-1)
                preds = torch.argmax(probs, dim=-1)

                val_preds.extend(preds.cpu().numpy())
                val_targets.extend(target_labels.cpu().numpy())
                val_scores.extend(probs[:, 1].cpu().numpy())

        val_targets = np.array(val_targets)
        val_preds = np.array(val_preds)
        acc = float(np.mean(val_targets == val_preds))
        
        tp = int(np.sum((val_targets == 1) & (val_preds == 1)))
        fp = int(np.sum((val_targets == 0) & (val_preds == 1)))
        fn = int(np.sum((val_targets == 1) & (val_preds == 0)))
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

        print(f"  Epoch {epoch}/{epochs} | Loss: {avg_train_loss:.4f} | Val Acc: {acc*100:.1f}% | Precision: {precision*100:.1f}% | Recall: {recall*100:.1f}% | F1: {f1:.4f}", flush=True)

        if f1 >= best_val_f1:
            best_val_f1 = f1
            # Save checkpoint
            save_path.mkdir(parents=True, exist_ok=True)
            model.save_pretrained(str(save_path))
            tokenizer.save_pretrained(str(save_path))

    elapsed = time.time() - start_train_time
    print(f"✅ Finished training {task_name} in {elapsed:.2f}s (Best Val F1: {best_val_f1:.4f})")
    print(f"   Model saved to: {save_path}")

    # Write metadata
    meta = {
        "task": task_name,
        "base_model": base_model_name,
        "best_val_f1": float(best_val_f1),
        "epochs": epochs,
        "trained_at": time.time(),
        "device": str(device)
    }
    with open(save_path / "metadata.json", "w") as f:
        json.dump(meta, f, indent=2)


def main():
    print("=" * 80)
    print("🎯 CONTROLPANE.AI — GUARDRAIL MODELS TRAINING SUITE")
    print("=" * 80)

    # 1. Prompt Injection Classifier
    train_single_model(
        task_name="Prompt Injection Classifier",
        dataset_raw=PROMPT_INJECTION_DATASET,
        base_model_name="sentence-transformers/all-MiniLM-L6-v2",
        save_path=MODELS_DIR / "prompt_injection_deberta",
        epochs=6,
        lr=5e-5,
        batch_size=8
    )

    # 2. Contextual Toxicity Classifier
    train_single_model(
        task_name="Contextual Toxicity Classifier",
        dataset_raw=TOXICITY_DATASET,
        base_model_name="sentence-transformers/all-MiniLM-L6-v2",
        save_path=MODELS_DIR / "toxicity_roberta",
        epochs=6,
        lr=5e-5,
        batch_size=8
    )

    print("\n" + "=" * 80)
    print("🏆 ALL GUARDRAIL MODELS SUCCESSFULLY TRAINED AND SERIALIZED!")
    print("=" * 80)


if __name__ == "__main__":
    main()
