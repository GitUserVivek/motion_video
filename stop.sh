#!/usr/bin/env bash
# EduMotion AI — Stop Services (Linux)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pids"

GREEN='\033[0;32m'
NC='\033[0m'

echo ""
echo "Stopping EduMotion AI services..."
echo ""

stop_pid_file() {
  local name="$1"
  local pid_file="$PID_DIR/$2"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid=$(cat "$pid_file")
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null && echo -e "  ${GREEN}Stopped $name (PID $pid)${NC}"
    fi
    rm -f "$pid_file"
  fi
}

# Stop via PID files written by start.sh
stop_pid_file "frontend" "frontend.pid"
stop_pid_file "backend"  "backend.pid"
stop_pid_file "ollama"   "ollama.pid"

# Fallback: find by port if PID files are missing
for port in 5173 3001; do
  pid=$(lsof -ti tcp:"$port" 2>/dev/null || true)
  if [[ -n "$pid" ]]; then
    kill "$pid" 2>/dev/null && echo -e "  ${GREEN}Stopped process on port $port (PID $pid)${NC}"
  fi
done

echo ""
echo "  Done. Your videos and data are safe."
echo ""
