#!/usr/bin/env bash
# EduMotion AI — Start Services (Linux)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PID_DIR="$SCRIPT_DIR/.pids"
mkdir -p "$PID_DIR" logs

echo ""
echo "============================================"
echo " EduMotion AI — Starting Services"
echo "============================================"
echo ""

# ---------- 1. Ollama ----------
echo "[1/4] Checking Ollama..."
if curl -s http://localhost:11434/api/tags &>/dev/null; then
  echo -e "  ${GREEN}OK: Ollama already running${NC}"
else
  echo "  Starting Ollama..."
  ollama serve >> logs/ollama.log 2>&1 &
  echo $! > "$PID_DIR/ollama.pid"
  # Wait up to 10s for Ollama to become ready
  for i in {1..10}; do
    sleep 1
    if curl -s http://localhost:11434/api/tags &>/dev/null; then
      echo -e "  ${GREEN}OK: Ollama started${NC}"
      break
    fi
    if [[ $i -eq 10 ]]; then
      echo -e "  ${YELLOW}WARNING: Ollama did not respond within 10s. Script generation may fail.${NC}"
    fi
  done
fi

# ---------- 2. Build backend if needed ----------
echo "[2/4] Preparing backend..."
if [[ ! -f packages/backend/dist/index.js ]]; then
  echo "  Building backend (first run)..."
  npm run build:shared
  npm run build:backend
  echo -e "  ${GREEN}OK: Backend built${NC}"
else
  echo -e "  ${GREEN}OK: Backend already built${NC}"
fi

# ---------- 3. Start backend ----------
echo "[3/4] Starting backend server (port 3001)..."
node packages/backend/dist/index.js >> logs/backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > "$PID_DIR/backend.pid"

# Poll /api/health until ready (up to 15s)
echo "  Waiting for backend..."
for i in {1..15}; do
  sleep 1
  if curl -s http://localhost:3001/api/health &>/dev/null; then
    echo -e "  ${GREEN}OK: Backend ready (PID $BACKEND_PID)${NC}"
    break
  fi
  if [[ $i -eq 15 ]]; then
    echo -e "  ${YELLOW}WARNING: Backend did not respond within 15s. Check logs/backend.log${NC}"
  fi
done

# ---------- 4. Start frontend ----------
echo "[4/4] Starting frontend dev server (port 5173)..."
npm run dev --workspace=packages/frontend >> logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo $FRONTEND_PID > "$PID_DIR/frontend.pid"
sleep 2

# ---------- Open browser ----------
echo ""
echo "============================================"
echo -e " ${GREEN}EduMotion AI is running!${NC}"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:3001/api/health"
echo "  Logs:     ./logs/"
echo "  Stop:     ./stop.sh"
echo "============================================"
echo ""

# Try to open browser (best-effort, different launchers on different distros)
if command -v xdg-open &>/dev/null; then
  xdg-open http://localhost:5173 &>/dev/null &
elif command -v gnome-open &>/dev/null; then
  gnome-open http://localhost:5173 &>/dev/null &
elif command -v sensible-browser &>/dev/null; then
  sensible-browser http://localhost:5173 &>/dev/null &
else
  echo "  Open http://localhost:5173 in your browser."
fi

# Keep the script alive so the user can Ctrl+C to stop everything
echo "  Press Ctrl+C to stop all services."
echo ""
trap 'echo ""; echo "Stopping services..."; "$SCRIPT_DIR/stop.sh"; exit 0' INT TERM
wait
