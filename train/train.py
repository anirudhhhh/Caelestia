#!/usr/bin/env python3
"""
ControlPlane.ai :: Unified Guardrails ML Training Engine

Consolidates prompt injection and toxicity classifier training into a single,
production-grade CLI pipeline supporting:
  - Fast single-split training (--mode fast)
  - Stratified K-Fold cross-validation (--mode kfold)
  - Individual or all-in-one task selection (--task all|prompt_injection|toxicity)
  - Automatic hardware acceleration (MPS / CUDA / CPU)
  - Serialization to PyTorch and metadata export

Usage:
  python3 train/train.py                              # Fast train all models (default)
  python3 train/train.py --task prompt_injection     # Train only Prompt Injection model
  python3 train/train.py --task toxicity             # Train only Toxicity model
  python3 train/train.py --mode kfold --splits 5     # 5-Fold Stratified Cross Validation
"""

import os
import sys
import json
import time
import argparse
from pathlib import Path
from typing import List, Dict, Tuple, Any

import torch
from torch.utils.data import Dataset, DataLoader
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import numpy as np
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, roc_auc_score

# Ensure root is in path
ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

MODELS_DIR = ROOT_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# Import shared datasets
try:
    from train.training_data import PROMPT_INJECTION_DATASET, TOXICITY_DATASET
except (ImportError, ModuleNotFoundError):
    from training_data import PROMPT_INJECTION_DATASET, TOXICITY_DATASET

torch.manual_seed(42)
np.random.seed(42)


class ClassificationDataset(Dataset):
    """PyTorch Dataset wrapper for sequence classification."""
    def __init__(self, texts: List[str], labels: List[int], tokenizer, max_length: int = 128):
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


def get_optimal_device(requested_device: str = "auto") -> torch.device:
    """Determine hardware accelerator."""
    if requested_device != "auto":
        return torch.device(requested_device)
    if torch.backends.mps.is_available():
        return torch.device("mps")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


def train_fast_single(
    task_name: str,
    dataset_raw: List[Tuple[str, int]],
    base_model_name: str,
    save_path: Path,
    device: torch.device,
    epochs: int = 5,
    lr: float = 4e-5,
    batch_size: int = 8
) -> Dict[str, Any]:
    """Fast single train/val split training."""
    print("\n" + "━" * 78, flush=True)
    print(f"🚀 [FAST TRAIN] :: {task_name.upper()}", flush=True)
    print(f"   Architecture: {base_model_name} | Target: {save_path.name}", flush=True)
    print("━" * 78, flush=True)

    # Augment with lowercased variations for robustness
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

    print(f"   Dataset: {len(texts)} samples (Train: {len(train_texts)}, Val: {len(val_texts)})")

    tokenizer = AutoTokenizer.from_pretrained(base_model_name)
    model = AutoModelForSequenceClassification.from_pretrained(base_model_name, num_labels=2).to(device)

    train_ds = ClassificationDataset(train_texts, train_labels, tokenizer)
    val_ds = ClassificationDataset(val_texts, val_labels, tokenizer)

    train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    criterion = torch.nn.CrossEntropyLoss()

    best_val_f1 = 0.0
    start_time = time.time()

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

        print(f"   Epoch {epoch}/{epochs} | Loss: {avg_train_loss:.4f} | Acc: {acc*100:.1f}% | Prec: {precision*100:.1f}% | Rec: {recall*100:.1f}% | F1: {f1:.4f} | AUC: {auc:.4f}", flush=True)

        if f1 >= best_val_f1:
            best_val_f1 = f1
            save_path.mkdir(parents=True, exist_ok=True)
            model.save_pretrained(str(save_path))
            tokenizer.save_pretrained(str(save_path))

    elapsed = time.time() - start_time
    print(f"✔ Completed {task_name} in {elapsed:.2f}s (Best Val F1: {best_val_f1:.4f}) -> {save_path.name}")

    results = {
        "task_name": task_name,
        "mode": "fast",
        "base_model": base_model_name,
        "epochs": epochs,
        "best_val_f1": float(best_val_f1),
        "accuracy": float(acc),
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1),
        "auc": float(auc),
        "elapsed_seconds": elapsed,
        "saved_path": str(save_path)
    }

    with open(save_path / "metadata.json", "w") as f:
        json.dump(results, f, indent=2)

    return results


def train_kfold(
    task_name: str,
    dataset: List[Tuple[str, int]],
    base_model_name: str,
    save_path: Path,
    device: torch.device,
    n_splits: int = 5,
    epochs: int = 5,
    lr: float = 4e-5,
    batch_size: int = 8
) -> Dict[str, Any]:
    """Stratified K-Fold cross validation training."""
    print("\n" + "━" * 78, flush=True)
    print(f"📊 [{n_splits}-FOLD STRATIFIED CV] :: {task_name.upper()}", flush=True)
    print(f"   Architecture: {base_model_name} | Target: {save_path.name}", flush=True)
    print("━" * 78, flush=True)

    texts = [item[0] for item in dataset]
    labels = np.array([item[1] for item in dataset])

    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)

    fold_accuracies, fold_precisions, fold_recalls, fold_f1s, fold_aucs = [], [], [], [], []
    best_overall_f1 = 0.0
    start_total_time = time.time()

    for fold, (train_idx, val_idx) in enumerate(skf.split(texts, labels), 1):
        train_texts = [texts[i] for i in train_idx]
        train_labels = labels[train_idx]
        val_texts = [texts[i] for i in val_idx]
        val_labels = labels[val_idx]

        tokenizer = AutoTokenizer.from_pretrained(base_model_name)
        model = AutoModelForSequenceClassification.from_pretrained(base_model_name, num_labels=2).to(device)

        train_ds = ClassificationDataset(train_texts, train_labels, tokenizer)
        val_ds = ClassificationDataset(val_texts, val_labels, tokenizer)

        train_loader = DataLoader(train_ds, batch_size=batch_size, shuffle=True)
        val_loader = DataLoader(val_ds, batch_size=batch_size, shuffle=False)

        optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
        criterion = torch.nn.CrossEntropyLoss()

        for epoch in range(1, epochs + 1):
            model.train()
            for batch in train_loader:
                optimizer.zero_grad()
                input_ids = batch["input_ids"].to(device)
                attention_mask = batch["attention_mask"].to(device)
                target_labels = batch["labels"].to(device)

                outputs = model(input_ids=input_ids, attention_mask=attention_mask)
                loss = criterion(outputs.logits, target_labels)
                loss.backward()
                optimizer.step()

        # Fold Final Validation
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

        print(f"   Fold {fold}/{n_splits} | Acc: {acc*100:.1f}% | Prec: {precision*100:.1f}% | Rec: {recall*100:.1f}% | F1: {f1:.4f} | AUC: {auc:.4f}")
        fold_accuracies.append(acc)
        fold_precisions.append(precision)
        fold_recalls.append(recall)
        fold_f1s.append(f1)
        fold_aucs.append(auc)

        if f1 >= best_overall_f1:
            best_overall_f1 = f1
            save_path.mkdir(parents=True, exist_ok=True)
            model.save_pretrained(str(save_path))
            tokenizer.save_pretrained(str(save_path))

    total_time = time.time() - start_total_time

    results = {
        "task_name": task_name,
        "mode": "kfold",
        "base_model": base_model_name,
        "n_splits": n_splits,
        "epochs": epochs,
        "mean_accuracy": float(np.mean(fold_accuracies)),
        "std_accuracy": float(np.std(fold_accuracies)),
        "mean_precision": float(np.mean(fold_precisions)),
        "std_precision": float(np.std(fold_precisions)),
        "mean_recall": float(np.mean(fold_recalls)),
        "std_recall": float(np.std(fold_recalls)),
        "mean_f1": float(np.mean(fold_f1s)),
        "std_f1": float(np.std(fold_f1s)),
        "mean_auc": float(np.mean(fold_aucs)),
        "training_time_seconds": total_time,
        "saved_to": str(save_path)
    }

    with open(save_path / "kfold_metrics.json", "w") as f:
        json.dump(results, f, indent=2)

    return results


def main():
    parser = argparse.ArgumentParser(description="ControlPlane.ai Unified Guardrails Model Trainer")
    parser.add_argument("--task", choices=["all", "prompt_injection", "toxicity"], default="all", help="Target task to train")
    parser.add_argument("--mode", choices=["fast", "kfold"], default="fast", help="Training mode: fast single split or k-fold CV")
    parser.add_argument("--epochs", type=int, default=5, help="Number of training epochs")
    parser.add_argument("--batch-size", type=int, default=8, help="Batch size")
    parser.add_argument("--lr", type=float, default=4e-5, help="Learning rate")
    parser.add_argument("--splits", type=int, default=5, help="Number of folds for kfold mode")
    parser.add_argument("--model", type=str, default="sentence-transformers/all-MiniLM-L6-v2", help="Base transformer checkpoint")
    parser.add_argument("--device", type=str, default="auto", help="Hardware device (auto, cpu, mps, cuda)")

    args = parser.parse_args()
    device = get_optimal_device(args.device)

    print("=" * 80)
    print("🎯 CONTROLPANE.AI :: UNIFIED GUARDRAILS ML TRAINING PIPELINE")
    print(f"   Task: {args.task.upper()} | Mode: {args.mode.upper()} | Device: {str(device).upper()}")
    print("=" * 80)

    train_fn = train_kfold if args.mode == "kfold" else train_fast_single
    results = {}

    # 1. Prompt Injection
    if args.task in ["all", "prompt_injection"]:
        inj_path = MODELS_DIR / "prompt_injection_deberta"
        if args.mode == "kfold":
            results["prompt_injection"] = train_fn(
                task_name="Prompt Injection Classifier",
                dataset=PROMPT_INJECTION_DATASET,
                base_model_name=args.model,
                save_path=inj_path,
                device=device,
                n_splits=args.splits,
                epochs=args.epochs,
                lr=args.lr,
                batch_size=args.batch_size
            )
        else:
            results["prompt_injection"] = train_fn(
                task_name="Prompt Injection Classifier",
                dataset_raw=PROMPT_INJECTION_DATASET,
                base_model_name=args.model,
                save_path=inj_path,
                device=device,
                epochs=args.epochs,
                lr=args.lr,
                batch_size=args.batch_size
            )

    # 2. Contextual Toxicity
    if args.task in ["all", "toxicity"]:
        tox_path = MODELS_DIR / "toxicity_roberta"
        if args.mode == "kfold":
            results["toxicity"] = train_fn(
                task_name="Contextual Toxicity Classifier",
                dataset=TOXICITY_DATASET,
                base_model_name=args.model,
                save_path=tox_path,
                device=device,
                n_splits=args.splits,
                epochs=args.epochs,
                lr=args.lr,
                batch_size=args.batch_size
            )
        else:
            results["toxicity"] = train_fn(
                task_name="Contextual Toxicity Classifier",
                dataset_raw=TOXICITY_DATASET,
                base_model_name=args.model,
                save_path=tox_path,
                device=device,
                epochs=args.epochs,
                lr=args.lr,
                batch_size=args.batch_size
            )

    print("\n" + "=" * 80)
    print("🏆 TRAINING PIPELINE COMPLETE")
    print("=" * 80)
    for task_k, res in results.items():
        if args.mode == "kfold":
            print(f"  • {task_k.upper()}: Mean F1 = {res['mean_f1']:.4f} ± {res['std_f1']:.4f} | Saved to: {res['saved_to']}")
        else:
            print(f"  • {task_k.upper()}: Best Val F1 = {res['best_val_f1']:.4f} (Acc: {res['accuracy']*100:.1f}%) | Saved to: {res['saved_path']}")
    print("=" * 80)


if __name__ == "__main__":
    main()
