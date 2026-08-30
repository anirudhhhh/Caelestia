#!/bin/bash
# ControlPlane.ai — Stop All Services
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ -f /tmp/controlplane_pids.txt ]; then
    echo -e "${RED}Stopping all ControlPlane.ai services via PID...${NC}"
    while read pid; do
        # Send SIGTERM to the process group to kill both parent and child Uvicorn processes
        kill -TERM -$pid 2>/dev/null || kill "$pid" 2>/dev/null && echo -e "  Stopped PID $pid" || true
    done < /tmp/controlplane_pids.txt
    rm /tmp/controlplane_pids.txt
fi

echo -e "${YELLOW}Sweeping for orphaned Uvicorn worker processes...${NC}"
for port in 8000 8001 8002 8003 8004 8005 8006 8007 8008 8009 8010 8011 8021 8022 8023 8024 8099; do
    lsof -ti:$port | xargs kill -9 2>/dev/null || true
done

echo -e "${GREEN}✓ All services stopped and ports freed${NC}"