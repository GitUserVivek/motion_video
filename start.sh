#!/usr/bin/env bash
# EduMotion AI — Start Services (Linux / macOS)
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

# ---------- 1. Build if needed ----------
echo "[1/3] Preparing backend..."

# Always ensure shared is built — the symlink in node_modules points directly
# to packages/shared, so dist/ must exist before the backend can require() it.
echo "  Building shared package..."
(cd packages/shared && npx tsup src/index.ts --format esm,cjs --dts --clean 2>&1) \
  || { echo -e "  ${RED:-}ERROR: shared build failed. Check tsup output above.${NC:-}"; exit 1; }

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
for i in {1..20}; do
  sleep 1
  if curl -s http://localhost:3001/api/health &>/dev/null; then
    echo -e "  ${GREEN}OK: Backend ready (PID $BACKEND_PID)${NC}"
    break
  fi
  if [[ $i -eq 20 ]]; then
    echo -e "  ${YELLOW}WARNING: Backend did not respond within 20s. Check logs/backend.log${NC}"
  fi
done

# ---------- 3. Start frontend ----------
echo "[3/3] Starting frontend dev server (port 5173)..."
npm run dev --workspace=packages/frontend >> logs/frontend.log 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$PID_DIR/frontend.pid"
sleep 2

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

# Stay alive — Ctrl+C stops everything via trap
trap 'echo ""; echo "Stopping services..."; "$SCRIPT_DIR/stop.sh"; exit 0' INT TERM
wait
