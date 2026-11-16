#!/usr/bin/env bash
# EduMotion AI — One-Time Setup (Linux)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # no colour

ERRORS=0

echo ""
echo "============================================"
echo " EduMotion AI — One-Time Setup"
echo "============================================"
echo ""

# ---------- 1. Node.js ----------
echo "[1/8] Checking Node.js..."
if ! command -v node &>/dev/null; then
  echo -e "  ${RED}ERROR: Node.js not found.${NC}"
  echo "        Install via: https://nodejs.org  or  nvm install 18"
  ERRORS=1
else
  NODE_VER=$(node --version)
  NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
  if [[ "$NODE_MAJOR" -lt 18 ]]; then
    echo -e "  ${RED}ERROR: Node.js $NODE_VER found but v18+ is required.${NC}"
    ERRORS=1
  else
    echo -e "  ${GREEN}OK: Node.js $NODE_VER${NC}"
  fi
fi

# ---------- 2. FFmpeg ----------
echo "[2/8] Checking FFmpeg..."
if ! command -v ffmpeg &>/dev/null; then
  echo -e "  ${RED}ERROR: FFmpeg not found.${NC}"
  echo "        Install via: sudo apt install ffmpeg  (Debian/Ubuntu)"
  echo "                     sudo dnf install ffmpeg  (Fedora)"
  ERRORS=1
else
  FFMPEG_VER=$(ffmpeg -version 2>&1 | head -1)
  echo -e "  ${GREEN}OK: $FFMPEG_VER${NC}"
fi

# ---------- 3. Ollama ----------
echo "[3/8] Checking Ollama..."
if ! command -v ollama &>/dev/null; then
  echo -e "  ${RED}ERROR: Ollama not found.${NC}"
  echo "        Install via: curl -fsSL https://ollama.com/install.sh | sh"
  ERRORS=1
else
  echo -e "  ${GREEN}OK: Ollama found${NC}"
fi

if [[ "$ERRORS" -ne 0 ]]; then
  echo ""
  echo -e "  ${RED}Setup cannot continue. Fix the errors above and run setup.sh again.${NC}"
  exit 1
fi

# ---------- 4. Pull AI model ----------
echo "[4/8] Pulling AI model (qwen2.5:7b)..."
echo "  This may take several minutes on first run."

# Ensure Ollama is running for the pull
if ! curl -s http://localhost:11434/api/tags &>/dev/null; then
  echo "  Starting Ollama service temporarily..."
  ollama serve &>/dev/null &
  OLLAMA_PID=$!
  sleep 3
  STARTED_OLLAMA=true
else
  STARTED_OLLAMA=false
fi

if ! ollama pull qwen2.5:7b; then
  echo -e "  ${YELLOW}WARNING: Failed to pull qwen2.5:7b, trying llama3.2:3b fallback...${NC}"
  if ! ollama pull llama3.2:3b; then
    echo -e "  ${YELLOW}WARNING: Fallback model pull also failed. You can retry with: ollama pull qwen2.5:7b${NC}"
  fi
fi

if [[ "$STARTED_OLLAMA" == "true" ]]; then
  kill "$OLLAMA_PID" 2>/dev/null || true
fi

# ---------- 5. npm install ----------
echo "[5/8] Installing npm dependencies..."
# Temporarily disable postinstall to avoid a double-build during install
if ! npm install --ignore-scripts; then
  echo -e "  ${RED}ERROR: npm install failed.${NC}"
  exit 1
fi
echo -e "  ${GREEN}OK: Dependencies installed${NC}"

# ---------- 6. Build shared package ----------
echo "[6/8] Building shared package..."
if ! npm run build:shared; then
  echo -e "  ${RED}ERROR: shared package build failed.${NC}"
  exit 1
fi
echo -e "  ${GREEN}OK: Shared package built (dist/index.cjs ready)${NC}"

# ---------- 7. Create directories ----------
echo "[7/8] Creating storage directories..."
mkdir -p \
  output/videos \
  output/audio \
  output/subtitles \
  output/thumbnails \
  temp \
  data/projects \
  assets/characters \
  assets/backgrounds \
  assets/animations \
  assets/sounds \
  logs
echo -e "  ${GREEN}OK: Directories created${NC}"

# ---------- 8. Create .env ----------
echo "[8/8] Creating .env file..."
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo -e "  ${GREEN}OK: .env created from .env.example${NC}"
else
  echo -e "  ${GREEN}OK: .env already exists, skipping${NC}"
fi

echo ""
echo "============================================"
echo -e " ${GREEN}Setup complete! Run ./start.sh to launch.${NC}"
echo "============================================"
echo ""
