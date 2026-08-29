#!/usr/bin/env python3
"""
ControlPlane.ai :: Unified End-to-End ML Pipeline (Multilingual)
Cross-Platform (macOS MPS, Arch Linux / Ubuntu Linux CUDA, CPU)

Executes the complete machine learning lifecycle in 1 single command:
1. Step 1: Download & Build Multilingual Hugging Face Datasets
2. Step 2: Train Both Neural Classifiers (Prompt Injection & Contextual Toxicity)
3. Step 3: Run Zero-Leakage Benchmark Evaluation & Output Calibration Metrics

Usage:
  python3 train/pipeline.py
  python3 train/pipeline.py --epochs 5 --batch-size 16 --device auto
"""

import os
import sys
import time
import argparse
from pathlib import Path

# Ensure tokenizers do not deadlock on Linux forks
os.environ["TOKENIZERS_PARALLELISM"] = "false"

ROOT_DIR = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT_DIR))

from train.dataset_builder import build_prompt_injection_dataset, build_toxicity_dataset
from train.train import run_all_training, get_device
from train.evaluate import main as run_evaluation


def run_pipeline(
    epochs: int = 5,
    batch_size: int = 16,
    lr: float = 3e-5,
    model_name: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
    device_name: str = "auto",
    skip_dataset_build: bool = False
):
    total_start = time.time()
    device = get_device(device_name)

    print("=" * 80)
    print("🚀 CONTROLPANE.AI — UNIFIED MULTILINGUAL ML PIPELINE (BUILD + TRAIN + EVAL)")
    print(f"   Architecture: {model_name} | Device: {str(device).upper()} | Epochs: {epochs} | Batch: {batch_size}")
    print("=" * 80)

    # ──────────────────────────────────────────────────────────────────────────
    # STEP 1: DATASET BUILD & PREPARATION
    # ──────────────────────────────────────────────────────────────────────────
    if not skip_dataset_build:
        print("\n[STEP 1/3] Downloading & Compiling Multilingual Hugging Face Datasets...")
        build_prompt_injection_dataset()
        build_toxicity_dataset()
    else:
        print("\n[STEP 1/3] Skipping dataset build (using existing cached datasets)...")

    # ──────────────────────────────────────────────────────────────────────────
    # STEP 2: MODEL TRAINING & CHECKPOINT SERIALIZATION
    # ──────────────────────────────────────────────────────────────────────────
    print("\n[STEP 2/3] Training Production Multilingual Neural Classifiers...")
    training_results = run_all_training(
        epochs=epochs,
        batch_size=batch_size,
        lr=lr,
        model_name=model_name,
        device_name=str(device)
    )

    # ──────────────────────────────────────────────────────────────────────────
    # STEP 3: BENCHMARK EVALUATION & THRESHOLD CALIBRATION
    # ──────────────────────────────────────────────────────────────────────────
    print("\n[STEP 3/3] Running Benchmark Evaluations against Held-Out Datasets...")
    run_evaluation()

    total_elapsed = time.time() - total_start
    print("\n" + "=" * 80)
    print(f"🎉 COMPLETE MULTILINGUAL PIPELINE FINISHED IN {total_elapsed:.1f}s WITH ZERO ERRORS!")
    print("   Models serialized to: models/prompt_injection_deberta & models/toxicity_roberta")
    print("=" * 80)


def main():
    parser = argparse.ArgumentParser(description="ControlPlane.ai Unified Build + Train + Eval Pipeline")
    parser.add_argument("--epochs", type=int, default=5, help="Number of training epochs (default: 5)")
    parser.add_argument("--batch-size", type=int, default=16, help="Batch size (default: 16)")
    parser.add_argument("--lr", type=float, default=3e-5, help="Peak learning rate (default: 3e-5)")
    parser.add_argument("--model", type=str, default="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2", help="Base model architecture")
    parser.add_argument("--device", type=str, default="auto", help="Hardware device (auto, cpu, mps, cuda)")
    parser.add_argument("--skip-dataset-build", action="store_true", help="Skip dataset building if data/datasets/ is ready")

    args = parser.parse_args()
    run_pipeline(
        epochs=args.epochs,
        batch_size=args.batch_size,
        lr=args.lr,
        model_name=args.model,
        device_name=args.device,
        skip_dataset_build=args.skip_dataset_build
    )


if __name__ == "__main__":
    main()
