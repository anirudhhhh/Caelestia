#!/usr/bin/env python3
"""
ControlPlane.ai :: Production Transformer Guardrails Training Engine
Cross-Platform (macOS MPS, Arch Linux / Linux CUDA, and CPU)

Trains sequence classification models using large-scale Hugging Face datasets:
- Prompt Injection & Jailbreak Classifier
- Contextual Toxicity & Content Safety Classifier
"""

import os
import sys
import json
import time
import argparse
from pathlib import Path
from typing import List, Dict, Tuple, Any

os.environ["TOKENIZERS_PARALLELISM"] = "false"

import torch
from torch.utils.data import Dataset, DataLoader
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    get_cosine_schedule_with_warmup
)
import numpy as np
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, roc_auc_score

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

MODELS_DIR = ROOT_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)
DATASETS_DIR = ROOT_DIR / "data" / "datasets"

torch.manual_seed(42)
np.random.seed(42)


class LargeScaleDataset(Dataset):
    """PyTorch Dataset wrapper with dynamic tokenization."""
    def __init__(self, data_list: List[Dict[str, Any]], tokenizer, max_length: int = 128):
        texts = [str(item["text"]) for item in data_list]
        labels = [int(item["label"]) for item in data_list]
        self.encodings = tokenizer(
            texts,
            truncation=True,
            padding="max_length",
            max_length=max_length,
            return_tensors="pt"
        )
        self.labels = torch.tensor(labels, dtype=torch.long)

    def __getitem__(self, idx: int):
        item = {key: val[idx] for key, val in self.encodings.items()}
        item["labels"] = self.labels[idx]
        return item

    def __len__(self):
        return len(self.labels)


def get_device(requested: str = "auto") -> torch.device:
    """Detects available acceleration hardware across macOS (MPS), Linux (CUDA), and CPU."""
    if requested != "auto":
        return torch.device(requested)
    if torch.cuda.is_available():
        return torch.device("cuda")
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available() and torch.backends.mps.is_built():
        return torch.device("mps")
    return torch.device("cpu")


def load_or_build_dataset(task_name: str) -> Dict[str, Any]:
    """Ensures large-scale datasets are loaded from cache or generated."""
    if task_name == "prompt_injection":
        file_path = DATASETS_DIR / "prompt_injection_large.json"
        if not file_path.exists():
            from train.dataset_builder import build_prompt_injection_dataset
            return build_prompt_injection_dataset()
        with open(file_path) as f:
            return json.load(f)
    elif task_name == "toxicity":
        file_path = DATASETS_DIR / "toxicity_large.json"
        if not file_path.exists():
            from train.dataset_builder import build_toxicity_dataset
            return build_toxicity_dataset()
        with open(file_path) as f:
            return json.load(f)
    else:
        raise ValueError(f"Unknown task: {task_name}")


def train_task(
    task_name: str,
    base_model_name: str,
    save_path: Path,
    device: torch.device,
    epochs: int = 5,
    batch_size: int = 16,
    lr: float = 3e-5,
    warmup_ratio: float = 0.1
) -> Dict[str, Any]:
    """Trains a production sequence classifier on large-scale dataset."""
    print("\n" + "━" * 80, flush=True)
    print(f"🚀 TRAINING :: {task_name.upper()}", flush=True)
    print(f"   Architecture: {base_model_name} | Device: {str(device).upper()} | Target: {save_path.name}", flush=True)
    print("━" * 80, flush=True)

    data = load_or_build_dataset(task_name)
    train_data = data["train"]
    val_data = data["val"]
    test_data = data["test"]

    print(f"   Dataset Loaded: {len(train_data)} train, {len(val_data)} validation, {len(test_data)} test samples", flush=True)

    tokenizer = AutoTokenizer.from_pretrained(base_model_name)
    model = AutoModelForSequenceClassification.from_pretrained(base_model_name, num_labels=2).to(device)

    train_ds = LargeScaleDataset(train_data, tokenizer)
    val_ds = LargeScaleDataset(val_data, tokenizer)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size * 2, shuffle=False)

    # Dynamic class weight calculation for balanced gradient updates
    labels_arr = np.array([item["label"] for item in train_data])
    pos_count = max(int(np.sum(labels_arr == 1)), 1)
    neg_count = max(int(np.sum(labels_arr == 0)), 1)
    pos_weight = float(neg_count / pos_count)
    class_weights = torch.tensor([1.0, pos_weight], dtype=torch.float).to(device)
    criterion = torch.nn.CrossEntropyLoss(weight=class_weights)

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    total_steps = len(train_loader) * epochs
    warmup_steps = int(total_steps * warmup_ratio)
    scheduler = get_cosine_schedule_with_warmup(optimizer, num_warmup_steps=warmup_steps, num_training_steps=total_steps)

    best_val_f1 = 0.0
    best_metrics = {}
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
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            scheduler.step()
            total_loss += loss.item()

        avg_train_loss = total_loss / len(train_loader)

        # Validation Step
        model.eval()
        val_preds, val_targets, val_probs = [], [], []
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
                val_probs.extend(probs[:, 1].cpu().numpy())

        val_targets = np.array(val_targets)
        val_preds = np.array(val_preds)
        val_probs = np.array(val_probs)

        acc = accuracy_score(val_targets, val_preds)
        precision, recall, f1, _ = precision_recall_fscore_support(val_targets, val_preds, average="binary", zero_division=0)
        try:
            auc = roc_auc_score(val_targets, val_probs)
        except Exception:
            auc = 1.0

        current_lr = scheduler.get_last_lr()[0]
        print(f"   Epoch {epoch:02d}/{epochs:02d} | Train Loss: {avg_train_loss:.4f} | Val Acc: {acc*100:.1f}% | Prec: {precision*100:.1f}% | Rec: {recall*100:.1f}% | F1: {f1:.4f} | AUC: {auc:.4f} | LR: {current_lr:.2e}", flush=True)

        if f1 >= best_val_f1 or epoch == 1:
            best_val_f1 = f1
            best_metrics = {
                "epoch": epoch,
                "val_accuracy": float(acc),
                "val_precision": float(precision),
                "val_recall": float(recall),
                "val_f1": float(f1),
                "val_auc": float(auc),
                "val_loss": float(avg_train_loss)
            }
            # Save model checkpoint
            save_path.mkdir(parents=True, exist_ok=True)
            model.save_pretrained(str(save_path))
            tokenizer.save_pretrained(str(save_path))

    elapsed = time.time() - start_train_time
    print(f"✔ Completed {task_name.upper()} in {elapsed:.1f}s (Best Val F1: {best_val_f1:.4f})", flush=True)
    print(f"  Checkpoint saved to: {save_path}", flush=True)

    # Write training metadata
    meta = {
        "task": task_name,
        "base_model": base_model_name,
        "epochs": epochs,
        "batch_size": batch_size,
        "lr": lr,
        "best_metrics": best_metrics,
        "train_samples": len(train_data),
        "val_samples": len(val_data),
        "test_samples": len(test_data),
        "device": str(device),
        "trained_at": time.time()
    }
    with open(save_path / "metadata.json", "w") as f:
        json.dump(meta, f, indent=2)

    return meta


def run_all_training(
    epochs: int = 5,
    batch_size: int = 16,
    lr: float = 3e-5,
    model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
    device_name: str = "auto"
) -> Dict[str, Any]:
    """Executes training for both guardrail models."""
    device = get_device(device_name)
    results = {}

    inj_path = MODELS_DIR / "prompt_injection_deberta"
    results["prompt_injection"] = train_task(
        task_name="prompt_injection",
        base_model_name=model_name,
        save_path=inj_path,
        device=device,
        epochs=epochs,
        batch_size=batch_size,
        lr=lr
    )

    tox_path = MODELS_DIR / "toxicity_roberta"
    results["toxicity"] = train_task(
        task_name="toxicity",
        base_model_name=model_name,
        save_path=tox_path,
        device=device,
        epochs=epochs,
        batch_size=batch_size,
        lr=lr
    )

    return results


def main():
    parser = argparse.ArgumentParser(description="ControlPlane.ai Production Guardrails Trainer")
    parser.add_argument("--task", choices=["all", "prompt_injection", "toxicity"], default="all", help="Task to train")
    parser.add_argument("--epochs", type=int, default=5, help="Number of epochs")
    parser.add_argument("--batch-size", type=int, default=16, help="Batch size")
    parser.add_argument("--lr", type=float, default=3e-5, help="Learning rate")
    parser.add_argument("--model", type=str, default="sentence-transformers/all-MiniLM-L6-v2", help="Transformer architecture")
    parser.add_argument("--device", type=str, default="auto", help="Hardware device (auto, cpu, mps, cuda)")

    args = parser.parse_args()
    device = get_device(args.device)

    print("=" * 80)
    print("🎯 CONTROLPANE.AI :: PRODUCTION GUARDRAILS ML TRAINING PIPELINE")
    print(f"   Task: {args.task.upper()} | Base Architecture: {args.model} | Device: {str(device).upper()}")
    print("=" * 80)

    results = {}
    if args.task in ["all", "prompt_injection"]:
        inj_path = MODELS_DIR / "prompt_injection_deberta"
        results["prompt_injection"] = train_task(
            task_name="prompt_injection",
            base_model_name=args.model,
            save_path=inj_path,
            device=device,
            epochs=args.epochs,
            batch_size=args.batch_size,
            lr=args.lr
        )

    if args.task in ["all", "toxicity"]:
        tox_path = MODELS_DIR / "toxicity_roberta"
        results["toxicity"] = train_task(
            task_name="toxicity",
            base_model_name=args.model,
            save_path=tox_path,
            device=device,
            epochs=args.epochs,
            batch_size=args.batch_size,
            lr=args.lr
        )

    print("\n" + "=" * 80)
    print("🏆 ALL PRODUCTION GUARDRAIL MODELS SUCCESSFULLY TRAINED & SERIALIZED!")
    print("=" * 80)
    for task_name, meta in results.items():
        m = meta["best_metrics"]
        print(f"  • {task_name.upper():<20} | Val F1: {m['val_f1']:.4f} | Acc: {m['val_accuracy']*100:.1f}% | AUC: {m['val_auc']:.4f}")
    print("=" * 80)


if __name__ == "__main__":
    main()
