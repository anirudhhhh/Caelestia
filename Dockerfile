# ControlPlane.ai — Unified Microservice Dockerfile
FROM python:3.12-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download Spacy English model for Presidio PII detection
RUN python -m spacy download en_core_web_sm

# Pre-download and cache MiniLM tokenizer & weights inside the container image
RUN python -c "from transformers import AutoTokenizer, AutoModel; AutoTokenizer.from_pretrained('sentence-transformers/all-MiniLM-L6-v2'); AutoModel.from_pretrained('sentence-transformers/all-MiniLM-L6-v2')"

# Copy project source files
COPY shared/ /app/shared/
COPY policies/ /app/policies/
COPY services/ /app/services/
COPY train/ /app/train/
COPY models/ /app/models/
COPY test_firewall.py /app/test_firewall.py

# Create data directory
RUN mkdir -p /app/data

ENV PYTHONPATH=/app \
    PYTHONUNBUFFERED=1

# Default environment variables (can be overridden per container in docker-compose)
ENV SERVICE_MODULE=gateway \
    PORT=8000

EXPOSE $PORT

CMD ["sh", "-c", "python -m uvicorn services.${SERVICE_MODULE}.app:app --host 0.0.0.0 --port ${PORT}"]
