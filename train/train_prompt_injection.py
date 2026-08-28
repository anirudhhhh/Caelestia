"""
Prompt Injection Classifier Training Engine.
Trains a sequence classification transformer on adversarial prompt injection attacks and benign enterprise queries.
"""

import os
import sys
import time
from pathlib import Path
from typing import List, Tuple

import torch
from torch.utils.data import Dataset, DataLoader
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import numpy as np

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

MODELS_DIR = ROOT_DIR / "models" / "prompt_injection_deberta"
MODELS_DIR.mkdir(parents=True, exist_ok=True)

from train.training_data import PROMPT_INJECTION_DATASET


class PromptDataset(Dataset):
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


def train():
    device = torch.device("mps" if torch.backends.mps.is_available() else ("cuda" if torch.cuda.is_available() else "cpu"))
    print(f"Training Prompt Injection Classifier on device: {str(device).upper()}")

    dataset = PROMPT_INJECTION_DATASET
    print(f"Dataset Size: {len(dataset)} samples")

    np.random.seed(42)
    indices = np.random.permutation(len(dataset))
    split_idx = int(0.8 * len(dataset))
    train_idx, val_idx = indices[:split_idx], indices[split_idx:]

    train_texts = [dataset[i][0] for i in train_idx]
    train_labels = [dataset[i][1] for i in train_idx]
    val_texts = [dataset[i][0] for i in val_idx]
    val_labels = [dataset[i][1] for i in val_idx]

    base_model_name = "sentence-transformers/all-MiniLM-L6-v2"
    tokenizer = AutoTokenizer.from_pretrained(base_model_name)
    model = AutoModelForSequenceClassification.from_pretrained(base_model_name, num_labels=2).to(device)

    train_ds = PromptDataset(train_texts, train_labels, tokenizer)
    val_ds = PromptDataset(val_texts, val_labels, tokenizer)

    train_loader = DataLoader(train_ds, batch_size=8, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=8, shuffle=False)

    optimizer = torch.optim.AdamW(model.parameters(), lr=4e-5, weight_decay=0.01)
    criterion = torch.nn.CrossEntropyLoss()

    epochs = 5
    best_val_f1 = 0.0
    start_time = time.time()

    for epoch in range(1, epochs + 1):
        model.train()
        total_loss = 0.0
        for batch in train_loader:
            optimizer.zero_grad()
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)

            outputs = model(input_ids=input_ids, attention_mask=attention_mask)
            loss = criterion(outputs.logits, labels)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()

        model.eval()
        val_preds, val_targets = [], []
        with torch.no_grad():
            for batch in val_loader:
                input_ids = batch["input_ids"].to(device)
                attention_mask = batch["attention_mask"].to(device)
                labels = batch["labels"].to(device)

                outputs = model(input_ids=input_ids, attention_mask=attention_mask)
                preds = torch.argmax(outputs.logits, dim=-1)
                val_preds.extend(preds.cpu().numpy())
                val_targets.extend(labels.cpu().numpy())

        val_preds = np.array(val_preds)
        val_targets = np.array(val_targets)

        acc = np.mean(val_preds == val_targets)
        tp = np.sum((val_targets == 1) & (val_preds == 1))
        fp = np.sum((val_targets == 0) & (val_preds == 1))
        fn = np.sum((val_targets == 1) & (val_preds == 0))

        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * (prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0

        print(f"Epoch {epoch}/{epochs} | Loss: {total_loss/len(train_loader):.4f} | Val Acc: {acc*100:.1f}% | Precision: {prec*100:.1f}% | Recall: {rec*100:.1f}% | F1: {f1:.4f}")

        if f1 >= best_val_f1:
            best_val_f1 = f1
            model.save_pretrained(str(MODELS_DIR))
            tokenizer.save_pretrained(str(MODELS_DIR))

    print(f"Training completed in {time.time() - start_time:.2f}s (Best Val F1: {best_val_f1:.4f})")
    print(f"Saved to: {MODELS_DIR.resolve()}")


if __name__ == "__main__":
    train()
