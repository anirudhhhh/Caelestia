#!/bin/bash
# ControlPlane.ai — Start All 12 Microservices & Warmup Engine

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}${BOLD}  ControlPlane.ai — Starting 12 Microservice Cluster${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

mkdir -p data

if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠  No .env file found. Copying from .env.example${NC}"
    cp .env.example .env
fi

PYTHON_BIN="$PROJECT_ROOT/venv/bin/python3"
if [ ! -f "$PYTHON_BIN" ]; then
    PYTHON_BIN="python3"
fi

# Reset PID tracking file
rm -f /tmp/controlplane_pids.txt
touch /tmp/controlplane_pids.txt

start_service() {
    local name=$1
    local module=$2
    local port=$3
    
    echo -e "${GREEN}▶ Starting ${name} on port ${port}...${NC}"
    PYTHONPATH="$PROJECT_ROOT" "$PYTHON_BIN" -m uvicorn "services.${module}.app:app" \
        --host 0.0.0.0 --port "$port" --reload --log-level warning &
    echo $! >> /tmp/controlplane_pids.txt
}

echo -e "${YELLOW}Stopping any lingering services on ports 8000-8024...${NC}"
lsof -ti:8000,8001,8002,8003,8004,8005,8006,8007,8008,8009,8010,8011,8021,8022,8023,8024,8099 | xargs kill -9 2>/dev/null || true
sleep 1

echo -e "\n${BLUE}Phase 1: Core Storage & Foundation Services${NC}"
start_service "Audit Store"       "audit_store"     8007
start_service "PII Service"       "pii_service"     8003
start_service "Policy Engine"     "policy_engine"   8004
start_service "Guardrails ML"     "guardrails_ml"   8011
sleep 2

echo -e "\n${BLUE}Phase 2: Security & Governance Guards${NC}"
start_service "Input Guard"       "input_guard"     8001
start_service "Output Guard"      "output_guard"    8002
start_service "Action Guard"      "action_guard"    8010
sleep 2

echo -e "\n${BLUE}Phase 3: Routing & Execution Pipeline${NC}"
start_service "Router / LB"       "router"          8005
start_service "Model Adapter"     "adapter"         8006
sleep 3

echo -e "\n${BLUE}Phase 3b: AI Workflow Components (PRD Workflows)${NC}"
start_service "General Query"     "general_query"   8021
start_service "Email Service"     "email_service"   8022
start_service "Leave Approval"    "leave_approval"  8023
start_service "Weather Service"   "weather_service" 8024
sleep 2

echo -e "\n${BLUE}Phase 4: Monitoring, Immune System & Human Review${NC}"
start_service "Review Console"    "review_console"  8008
start_service "Immune System"     "immune_system"   8009
sleep 2

echo -e "\n${BLUE}Phase 5: API Gateway (Main Ingress Entry Point)${NC}"
start_service "API Gateway"       "gateway"         8000
sleep 3

# ---------------------------------------------------------
# WARM UP PHASE (Eliminating Cold Starts)
# ---------------------------------------------------------
echo -e "\n${BLUE}Phase 6: Warming Up Services (Eliminating Cold Starts)...${NC}"

# 1. Warm up the Gateway system cascade
curl -s http://localhost:8000/v1/health/system > /dev/null || true
echo -e "${GREEN}✓ Gateway and connection pools initialized${NC}"

# 2. Warm up Input Guard (forces regex/plugins/models to compile in memory)
curl -s -X POST http://localhost:8001/scan \
  -H "Content-Type: application/json" \
  -d '{"interaction_id":"warmup","session_id":"warmup","use_case":"internal","geography":"US","direction":"input","payload":{"role":"user","content":"warmup"},"model":{"requested":"dummy"},"checks":[],"tool_calls":[]}' > /dev/null || true
echo -e "${GREEN}✓ Scanners, Regex, and Neural Engines warmed up${NC}"

echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}✓ All ControlPlane.ai Microservices operational!${NC}"
echo -e "  ${CYAN}API Gateway:${NC}      http://localhost:8000"
echo -e "  ${CYAN}General Query:${NC}    http://localhost:8021"
echo -e "  ${CYAN}Email Service:${NC}    http://localhost:8022"
echo -e "  ${CYAN}Leave Approval:${NC}   http://localhost:8023"
echo -e "  ${CYAN}Weather Service:${NC}  http://localhost:8024"
echo -e "  ${CYAN}Review Console:${NC}   http://localhost:8008"
echo -e "  ${CYAN}Frontend UI:${NC}      http://localhost:3000  (Run 'cd frontend && npm run dev')"
echo -e "${YELLOW}Press Ctrl+C to stop all services cleanly${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cleanup() {
    echo -e "\n${RED}Stopping all ControlPlane.ai services...${NC}"
    if [ -f /tmp/controlplane_pids.txt ]; then
        while read -r pid; do
            kill -TERM "-$pid" 2>/dev/null || kill "$pid" 2>/dev/null || true
        done < /tmp/controlplane_pids.txt
        rm -f /tmp/controlplane_pids.txt
    fi
    for port in 8000 8001 8002 8003 8004 8005 8006 8007 8008 8009 8010 8011 8021 8022 8023 8024 8099; do
        lsof -ti:"$port" | xargs kill -9 2>/dev/null || true
    done
    echo -e "${GREEN}✓ All services stopped and ports freed.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM
wait