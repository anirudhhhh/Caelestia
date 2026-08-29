#!/usr/bin/env bash
# ControlPlane.ai - Unified ML Pipeline (Mac + Arch Linux / Ubuntu)
# 1 Command: Build Datasets + Train Both Models + Evaluate Benchmarks

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# Resolve python binary (prefer local venv if present, otherwise system python3)
if [ -f "$PROJECT_ROOT/venv/bin/python3" ]; then
    PYTHON_BIN="$PROJECT_ROOT/venv/bin/python3"
elif [ -f "$PROJECT_ROOT/.venv/bin/python3" ]; then
    PYTHON_BIN="$PROJECT_ROOT/.venv/bin/python3"
elif command -v python3 &>/dev/null; then
    PYTHON_BIN="python3"
else
    echo "Error: python3 not found. Please install Python 3.11+."
    exit 1
fi

export PYTHONPATH="$PROJECT_ROOT"
export TOKENIZERS_PARALLELISM="false"

echo "Using Python: $PYTHON_BIN"
"$PYTHON_BIN" "$PROJECT_ROOT/train/pipeline.py" "$@"
