FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir -e ".[dev]" 2>/dev/null || pip install --no-cache-dir .

# Download spaCy model for PII detection
RUN python -m spacy download en_core_web_sm || true

# Copy application code
COPY . .

# Create data directory
RUN mkdir -p data

EXPOSE 8000 8001 8002 8003 8004 8005 8006 8007 8008 8009 8010

# Default command (overridden per service in docker-compose.yml)
CMD ["python", "-m", "uvicorn", "services.gateway.app:app", "--host", "0.0.0.0", "--port", "8000"]
