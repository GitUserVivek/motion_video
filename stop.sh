#!/usr/bin/env bash
# EduMotion AI — Stop Services

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$SCRIPT_DIR/.pids"

echo ""
echo "Stopping EduMotion AI services..."

# Kill by saved PID files
for name in backend frontend; do
  pid_file="$PID_DIR/$name.pid"
  if [[ -f "$pid_file" ]]; then
    pid=$(cat "$pid_file" 2>/dev/null)
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null && echo "  Stopped $name (PID $pid)"
    fi
    rm -f "$pid_file"
  fi
done

# Kill by port — try fuser first (available on Kaggle/Ubuntu), then lsof
for port in 3001 5173; do
  # fuser approach
  fuser -k "${port}/tcp" 2>/dev/null && echo "  Killed port $port" || true
  # lsof fallback
  if command -v lsof &>/dev/null; then
    lsof -ti tcp:"$port" 2>/dev/null | xargs -r kill -9 2>/dev/null || true
  fi
done

# Kill any stray node processes matching our entry points
pkill -9 -f "backend/dist/index.js" 2>/dev/null || true
pkill -9 -f "vite" 2>/dev/null || true

sleep 1
echo "  Done."
echo ""
