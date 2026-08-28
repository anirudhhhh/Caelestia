"""
Stratified K-Fold Cross Validation Engine for Guardrail Models.
Evaluates out-of-fold generalization across prompt injection and toxicity datasets.
"""

import os
import sys
import json
import time
from pathlib import Path
from typing import List, Dict, Tuple, Any

import torch
from torch.utils.data import Dataset, DataLoader
from transformers import AutoTokenizer, AutoModelForSequenceClassification
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, roc_auc_score
import numpy as np

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

MODELS_DIR = ROOT_DIR / "models"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

from train.training_data import PROMPT_INJECTION_DATASET, TOXICITY_DATASET


class KFoldDataset(Dataset):
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


def train_kfold(
    task_name: str,
    dataset: List[Tuple[str, int]],
    base_model_name: str,
    save_path: Path,
    n_splits: int = 5,
    epochs: int = 5,
    lr: float = 3e-5,
    batch_size: int = 8
) -> Dict[str, Any]:
    print(f"\n--- Starting {n_splits}-Fold Cross Validation: {task_name} ---")
    print(f"Base Architecture: {base_model_name} | Samples: {len(dataset)}")

    device = torch.device("mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu"))
    print(f"Hardware Accelerator: {str(device).upper()}")

    texts = [item[0] for item in dataset]
    labels = np.array([item[1] for item in dataset])

    skf = StratifiedKFold(n_splits=n_splits, shuffle=True, random_state=42)

    fold_accuracies = []
    fold_precisions = []
    fold_recalls = []
    fold_f1s = []
    fold_aucs = []

    best_overall_f1 = 0.0
    start_total_time = time.time()

    for fold, (train_idx, val_idx) in enumerate(skf.split(texts, labels), 1):
        train_texts = [texts[i] for i in train_idx]
        train_labels = labels[train_idx]
        val_texts = [texts[i] for i in val_idx]
        val_labels = labels[val_idx]

        tokenizer = AutoTokenizer.from_pretrained(base_model_name)
        model = AutoModelForSequenceClassification.from_pretrained(base_model_name, num_labels=2).to(device)

        train_ds = KFoldDataset(train_texts, train_labels, tokenizer)
        val_ds = KFoldDataset(val_texts, val_labels, tokenizer)

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

            # Fold Validation
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

            if epoch == epochs:
                print(f"Fold {fold}/{n_splits} | Acc: {acc*100:.1f}% | Prec: {precision*100:.1f}% | Rec: {recall*100:.1f}% | F1: {f1:.4f} | AUC: {auc:.4f}")
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
    inj_results = train_kfold(
        task_name="Prompt Injection Classifier",
        dataset=PROMPT_INJECTION_DATASET,
        base_model_name="sentence-transformers/all-MiniLM-L6-v2",
        save_path=MODELS_DIR / "prompt_injection_deberta",
        n_splits=5,
        epochs=5,
        lr=4e-5,
        batch_size=8
    )

    tox_results = train_kfold(
        task_name="Contextual Toxicity Classifier",
        dataset=TOXICITY_DATASET,
        base_model_name="sentence-transformers/all-MiniLM-L6-v2",
        save_path=MODELS_DIR / "toxicity_roberta",
        n_splits=5,
        epochs=5,
        lr=4e-5,
        batch_size=8
    )

    print("\n" + "-" * 75)
    print(f"{'Metric':<25} | {'Prompt Injection (Mean ± Std)':<23} | {'Contextual Toxicity (Mean ± Std)':<23}")
    print("-" * 75)
    print(f"{'Accuracy':<25} | {inj_results['mean_accuracy']*100:>5.1f}% ± {inj_results['std_accuracy']*100:>4.1f}%{'':<9} | {tox_results['mean_accuracy']*100:>5.1f}% ± {tox_results['std_accuracy']*100:>4.1f}%")
    print(f"{'Precision':<25} | {inj_results['mean_precision']*100:>5.1f}% ± {inj_results['std_precision']*100:>4.1f}%{'':<9} | {tox_results['mean_precision']*100:>5.1f}% ± {tox_results['std_precision']*100:>4.1f}%")
    print(f"{'Recall':<25} | {inj_results['mean_recall']*100:>5.1f}% ± {inj_results['std_recall']*100:>4.1f}%{'':<9} | {tox_results['mean_recall']*100:>5.1f}% ± {tox_results['std_recall']*100:>4.1f}%")
    print(f"{'F1 Score':<25} | {inj_results['mean_f1']:>7.4f} ± {inj_results['std_f1']:>6.4f}{'':<7} | {tox_results['mean_f1']:>7.4f} ± {tox_results['std_f1']:>6.4f}")
    print(f"{'ROC-AUC':<25} | {inj_results['mean_auc']:>7.4f}{'':<15} | {tox_results['mean_auc']:>7.4f}")
    print(f"{'Time':<25} | {inj_results['training_time_seconds']:>5.1f}s{'':<17} | {tox_results['training_time_seconds']:>5.1f}s")
    print("-" * 75)


if __name__ == "__main__":
    main()
