#!/bin/bash
# ControlPlane.ai — Start All Services

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  ControlPlane.ai — Starting All Services${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

mkdir -p data

if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠  No .env file found. Copying from .env.example${NC}"
    cp .env.example .env
fi

PYTHON_BIN="$PROJECT_ROOT/venv/bin/python3"
if [ ! -f "$PYTHON_BIN" ]; then
    PYTHON_BIN="python3"
fi

start_service() {
    local name=$1
    local module=$2
    local port=$3
    
    echo -e "${GREEN}▶ Starting ${name} on port ${port}...${NC}"
    PYTHONPATH="$PROJECT_ROOT" "$PYTHON_BIN" -m uvicorn "services.${module}.app:app" \
        --host 0.0.0.0 --port "$port" --reload --log-level warning &
    echo $! >> /tmp/controlplane_pids.txt
}

echo -e "${YELLOW}Stopping any lingering services on ports 8000-8011...${NC}"
lsof -ti:8000,8001,8002,8003,8004,8005,8006,8007,8008,8009,8010,8011 | xargs kill -9 2>/dev/null || true
sleep 1

touch /tmp/controlplane_pids.txt

echo -e "\n${BLUE}Phase 1: Core Infrastructure${NC}"
start_service "Audit Store"       "audit_store"     8007
start_service "PII Service"       "pii_service"     8003
start_service "Policy Engine"     "policy_engine"   8004
start_service "Guardrails ML"     "guardrails_ml"   8011
sleep 1

echo -e "\n${BLUE}Phase 2: Guards${NC}"
start_service "Input Guard"       "input_guard"     8001
start_service "Output Guard"      "output_guard"    8002
start_service "Action Guard"      "action_guard"    8010
sleep 1

echo -e "\n${BLUE}Phase 3: Pipeline${NC}"
start_service "Router / LB"       "router"          8005
start_service "Model Adapter"     "adapter"         8006
sleep 1

echo -e "\n${BLUE}Phase 4: Monitoring & Review${NC}"
start_service "Review Console"    "review_console"  8008
start_service "Immune System"     "immune_system"   8009
sleep 1

echo -e "\n${BLUE}Phase 5: Gateway (main entry point)${NC}"
start_service "API Gateway"       "gateway"         8000
sleep 3 # Give Gateway a moment to bind to the port

# ---------------------------------------------------------
# NEW WARM UP PHASE
# ---------------------------------------------------------
echo -e "\n${BLUE}Phase 6: Warming Up Services (Eliminating Cold Starts)...${NC}"

# 1. Warm up the Gateway system cascade (initializes HTTPX connection pools)
curl -s http://localhost:8000/v1/health/system > /dev/null
echo -e "${GREEN}✓ Gateway and connection pools initialized${NC}"

# 2. Warm up Input Guard (forces regex/plugins/models to compile in memory)
curl -s -X POST http://localhost:8001/scan \
  -H "Content-Type: application/json" \
  -d '{"interaction_id":"warmup","session_id":"warmup","use_case":"internal","geography":"US","direction":"input","payload":{"role":"user","content":"warmup"},"model":{"requested":"dummy"},"checks":[],"tool_calls":[]}' > /dev/null
echo -e "${GREEN}✓ Scanners and Regex Engines compiled${NC}"

# ---------------------------------------------------------

echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ All services started and warmed up!${NC}"
echo -e "  ${CYAN}API Gateway:${NC}      http://localhost:8000"
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"

trap 'echo -e "\n${RED}Stopping all services...${NC}"; kill $(cat /tmp/controlplane_pids.txt) 2>/dev/null; rm /tmp/controlplane_pids.txt; exit 0' SIGINT SIGTERM
wait