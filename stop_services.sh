#!/bin/bash
# ControlPlane.ai — Stop All Services
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

if [ -f /tmp/controlplane_pids.txt ]; then
    echo -e "${RED}Stopping all ControlPlane.ai services...${NC}"
    while read pid; do
        kill "$pid" 2>/dev/null && echo -e "  Stopped PID $pid" || true
    done < /tmp/controlplane_pids.txt
    rm /tmp/controlplane_pids.txt
    echo -e "${GREEN}✓ All services stopped${NC}"
else
    # Fallback: kill by port
    echo -e "${YELLOW}No PID file found. Killing by port...${NC}"
    for port in 8000 8001 8002 8003 8004 8005 8006 8007 8008 8009 8010; do
        lsof -ti:$port | xargs kill 2>/dev/null || true
    done
    echo -e "${GREEN}✓ Done${NC}"
fi
