"""
ControlPlane.ai — Shared Configuration Utilities

Centralized config loading, environment variable resolution,
and logging setup used by all services.
"""

import logging
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load .env from project root
_project_root = Path(__file__).parent.parent
load_dotenv(_project_root / ".env")


def get_env(key: str, default: str = "") -> str:
    """Get environment variable with fallback."""
    return os.getenv(key, default)


def get_env_int(key: str, default: int = 0) -> int:
    """Get environment variable as int."""
    return int(os.getenv(key, str(default)))


def get_env_bool(key: str, default: bool = False) -> bool:
    """Get environment variable as bool."""
    return os.getenv(key, str(default)).lower() in ("true", "1", "yes")


# ─── Service URLs ─────────────────────────────────────────────────────────────

GATEWAY_URL = get_env("GATEWAY_URL", "http://localhost:8000")
INPUT_GUARD_URL = get_env("INPUT_GUARD_URL", "http://localhost:8001")
OUTPUT_GUARD_URL = get_env("OUTPUT_GUARD_URL", "http://localhost:8002")
PII_SERVICE_URL = get_env("PII_SERVICE_URL", "http://localhost:8003")
POLICY_ENGINE_URL = get_env("POLICY_ENGINE_URL", "http://localhost:8004")
ROUTER_URL = get_env("ROUTER_URL", "http://localhost:8005")
ADAPTER_URL = get_env("ADAPTER_URL", "http://localhost:8006")
AUDIT_STORE_URL = get_env("AUDIT_STORE_URL", "http://localhost:8007")
REVIEW_CONSOLE_URL = get_env("REVIEW_CONSOLE_URL", "http://localhost:8008")
IMMUNE_SYSTEM_URL = get_env("IMMUNE_SYSTEM_URL", "http://localhost:8009")
ACTION_GUARD_URL = get_env("ACTION_GUARD_URL", "http://localhost:8010")
GUARDRAILS_ML_URL = get_env("GUARDRAILS_ML_URL", "http://localhost:8011")

# ─── LLM Configuration (Google Gemini Native) ─────────────────────────────────

GEMINI_API_KEY = get_env("GEMINI_API_KEY")

# Default models (Google Gemini)
DEFAULT_MODEL = get_env("DEFAULT_MODEL", "gemini-3.5-flash-lite")
JUDGE_MODEL = get_env("JUDGE_MODEL", "gemini-3.5-flash-lite")

# Default system prompt
CONTROLPLANE_SYSTEM_PROMPT = get_env(
    "CONTROLPLANE_SYSTEM_PROMPT",
    "You are an expert AI assistant protected by ControlPlane.ai. "
    "Provide clear, accurate, detailed, and directly actionable technical solutions, code snippets, and explanations. "
    "Always answer the user's prompt directly, concisely, and helpfully."
)

# Model list for routing (comma-separated in env)
AVAILABLE_MODELS = [
    m.strip() for m in get_env(
        "AVAILABLE_MODELS",
        "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-flash-lite-latest,gemini-3.5-flash,gemini-3.6-flash,gemini-3.7-flash"
    ).split(",") if m.strip()
]

# ─── Database Configuration ───────────────────────────────────────────────────

DATABASE_URL = get_env("DATABASE_URL", f"sqlite:///{_project_root}/data/controlplane.db")
DATABASE_PATH = str(_project_root / "data" / "controlplane.db")

# ─── Redis Configuration ─────────────────────────────────────────────────────

REDIS_URL = get_env("REDIS_URL", "redis://localhost:6379")

# ─── Logging Setup ────────────────────────────────────────────────────────────

LOG_LEVEL = get_env("LOG_LEVEL", "INFO").upper()


def setup_logging(service_name: str) -> logging.Logger:
    """
    Configure structured logging for a service.
    Every log line carries the service name for correlation.
    """
    logger = logging.getLogger(service_name)
    logger.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))
        formatter = logging.Formatter(
            f"%(asctime)s | {service_name} | %(levelname)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S"
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger
