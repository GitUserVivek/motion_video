#!/usr/bin/env bash
# EduMotion AI — Start Services (Linux / macOS)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PID_DIR="$SCRIPT_DIR/.pids"
mkdir -p "$PID_DIR" logs

echo ""
echo "============================================"
echo " EduMotion AI — Starting Services"
echo "============================================"
echo ""

# Always stop any existing instances first to avoid EADDRINUSE
echo "  Clearing any existing processes..."
fuser -k 3001/tcp 2>/dev/null || true
fuser -k 5173/tcp 2>/dev/null || true
pkill -9 -f "backend/dist/index.js" 2>/dev/null || true
pkill -9 -f "vite" 2>/dev/null || true
sleep 1

# ---------- 1. Build if needed ----------
echo "[1/3] Preparing backend..."
if [[ ! -f packages/shared/dist/index.js ]]; then
  echo "  Building shared package..."
  (cd packages/shared && npx tsup src/index.ts --format esm,cjs --dts --clean)
fi
if [[ ! -f packages/backend/dist/index.js ]]; then
  echo "  Building backend..."
  npm run build:backend
fi
echo -e "  ${GREEN}OK: Ready${NC}"

# ---------- 2. Start backend ----------
echo "[2/3] Starting backend server (port 3001)..."
node packages/backend/dist/index.js >> logs/backend.log 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$PID_DIR/backend.pid"

echo "  Waiting for backend..."
READY=false
for i in {1..20}; do
  sleep 1
  if curl -s http://localhost:3001/api/health &>/dev/null; then
    READY=true
    echo -e "  ${GREEN}OK: Backend ready (PID $BACKEND_PID)${NC}"
    break
  fi
done
if [[ "$READY" == "false" ]]; then
  echo -e "  ${YELLOW}WARNING: Backend did not respond in 20s — check logs/backend.log${NC}"
  tail -5 logs/backend.log || true
fi

# ---------- 3. Start frontend ----------
echo "[3/3] Starting frontend dev server (port 5173)..."
VITE_BACKEND_URL="${BACKEND_URL:-http://localhost:3001}" \
  npm run dev --workspace=packages/frontend >> logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$PID_DIR/frontend.pid"

# Wait for frontend to be up
for i in {1..15}; do
  sleep 1
  if curl -s http://localhost:5173 &>/dev/null; then
    echo -e "  ${GREEN}OK: Frontend ready (PID $FRONTEND_PID)${NC}"
    break
  fi
done

echo ""
echo "============================================"
echo -e " ${GREEN}EduMotion AI is running!${NC}"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:3001/api/health"
echo "  Logs:     ./logs/"
echo "  Stop:     ./stop.sh   or   Ctrl+C"
echo "============================================"
echo ""

# Open browser (best-effort)
if command -v xdg-open &>/dev/null; then
  xdg-open http://localhost:5173 &>/dev/null &
elif command -v open &>/dev/null; then
  open http://localhost:5173 &>/dev/null &
fi

# Stay alive — Ctrl+C stops everything
trap '"$SCRIPT_DIR/stop.sh"; exit 0' INT TERM
wait
