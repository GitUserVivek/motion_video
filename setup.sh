#!/usr/bin/env bash
# Anupam Classes — One-Time Setup (Linux / macOS)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0

echo ""
echo "============================================"
echo " Anupam Classes — One-Time Setup"
echo "============================================"
echo ""

# ---------- 0. CUDA build environment ----------
# node-llama-cpp's prebuilt CUDA binaries are compiled with CUDA 13.1; on hosts
# with an older toolkit (e.g. Kaggle's 13.0) llama.cpp has to be compiled from
# source (LLM_BUILD_FROM_SOURCE=true). These exports make that build work—and
# must stay set when the backend runs so the cached build is reused.
default_cuda_home="/usr/local/cuda"
if [[ -z "${CUDACXX:-}" && -x "$default_cuda_home/bin/nvcc" ]]; then
  export CUDACXX="$default_cuda_home/bin/nvcc"
fi
if [[ -z "${CUDA_PATH:-}" && -d "$default_cuda_home" ]]; then
  export CUDA_PATH="$default_cuda_home"
fi
# CUDA 13 ships no driver stub, so CMake cannot create CUDA::cuda_driver;
# ggml only needs it when VMM is enabled, so build without VMM.
export NODE_LLAMA_CPP_CMAKE_OPTION_GGML_CUDA_NO_VMM="${NODE_LLAMA_CPP_CMAKE_OPTION_GGML_CUDA_NO_VMM:-ON}"
if [[ -n "${CUDACXX:-}" ]]; then
  echo "  CUDA build env: CUDACXX=$CUDACXX CUDA_PATH=${CUDA_PATH:-}"
  echo ""
fi

# ---------- 1. Node.js ----------
echo "[1/7] Checking Node.js..."
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
echo "[2/7] Checking FFmpeg..."
if ! command -v ffmpeg &>/dev/null; then
  echo -e "  ${RED}ERROR: FFmpeg not found.${NC}"
  echo "        sudo apt install ffmpeg   (Debian/Ubuntu)"
  echo "        sudo dnf install ffmpeg   (Fedora)"
  echo "        brew install ffmpeg       (macOS)"
  ERRORS=1
else
  FFMPEG_VER=$(ffmpeg -version 2>&1 | head -1)
  echo -e "  ${GREEN}OK: $FFMPEG_VER${NC}"
fi

if [[ "$ERRORS" -ne 0 ]]; then
  echo ""
  echo -e "  ${RED}Setup cannot continue. Fix the errors above and run setup.sh again.${NC}"
  exit 1
fi

# ---------- 3. npm install ----------
echo "[3/7] Installing npm dependencies..."
if ! npm install --ignore-scripts; then
  echo -e "  ${RED}ERROR: npm install failed.${NC}"
  exit 1
fi
echo -e "  ${GREEN}OK: Dependencies installed${NC}"

# ---------- 4. Build shared + backend ----------
echo "[4/7] Building packages..."
if ! npm run build:shared; then
  echo -e "  ${RED}ERROR: shared build failed.${NC}"
  exit 1
fi
npm run build:backend 2>/dev/null || true
echo -e "  ${GREEN}OK: Packages built${NC}"

# ---------- 5. Create directories ----------
echo "[5/7] Creating storage directories..."
mkdir -p \
  output temp data/projects \
  assets/characters assets/backgrounds assets/animations assets/sounds \
  resources/icons resources/images \
  logs
echo -e "  ${GREEN}OK: Directories created${NC}"

# ---------- 6. Create .env ----------
echo "[6/7] Creating .env file..."
if [[ ! -f .env ]]; then
  cp .env.example .env
  echo -e "  ${GREEN}OK: .env created from .env.example${NC}"
else
  echo -e "  ${GREEN}OK: .env already exists, skipping${NC}"
fi

# ---------- 7. Download AI model ----------
echo "[7/7] Downloading AI model (GGUF — may take several minutes)..."

# Source .env so the downloader picks up any custom MODELS_DIR / LLM_* vars
set -a
# shellcheck disable=SC1091
[[ -f .env ]] && source .env
set +a

if [[ -f packages/backend/dist/services/llm.downloader.js ]]; then
  if ! node packages/backend/dist/services/llm.downloader.js; then
    echo -e "  ${YELLOW}WARNING: Model download failed. It will be retried on first server start.${NC}"
    echo "  Manual retry: node packages/backend/dist/services/llm.downloader.js"
  fi
else
  echo -e "  ${YELLOW}NOTE: Downloader not compiled yet — model will download on first server start.${NC}"
fi

echo ""
echo "============================================"
echo -e " ${GREEN}Setup complete! Run ./start.sh to launch.${NC}"
echo "============================================"
echo ""
