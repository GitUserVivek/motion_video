@echo off
setlocal enabledelayedexpansion
title EduMotion AI — Setup

echo.
echo ============================================
echo  EduMotion AI — One-Time Setup
echo ============================================
echo.

set ERRORS=0

:: ---------- 1. Node.js ----------
echo [1/8] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
  echo   ERROR: Node.js not found. Install from https://nodejs.org (v18+)
  set ERRORS=1
) else (
  for /f "tokens=1" %%v in ('node --version') do echo   OK: %%v
)

:: ---------- 2. FFmpeg ----------
echo [2/8] Checking FFmpeg...
ffmpeg -version >nul 2>&1
if errorlevel 1 (
  echo   ERROR: FFmpeg not found. Install from https://ffmpeg.org/download.html
  set ERRORS=1
) else (
  echo   OK: FFmpeg found
)

:: ---------- 3. Ollama ----------
echo [3/8] Checking Ollama...
ollama --version >nul 2>&1
if errorlevel 1 (
  echo   ERROR: Ollama not found. Install from https://ollama.com
  set ERRORS=1
) else (
  echo   OK: Ollama found
)

if %ERRORS%==1 (
  echo.
  echo   Setup cannot continue. Fix the errors above and run setup.bat again.
  pause
  exit /b 1
)

:: ---------- 4. Pull AI model ----------
echo [4/8] Pulling AI model (qwen2.5:7b)...
echo   This may take several minutes on first run.
ollama pull qwen2.5:7b
if errorlevel 1 (
  echo   WARNING: Failed to pull qwen2.5:7b, trying llama3.2:3b fallback...
  ollama pull llama3.2:3b
)

:: ---------- 5. npm install ----------
echo [5/8] Installing npm dependencies...
call npm install --ignore-scripts
if errorlevel 1 (
  echo   ERROR: npm install failed
  pause
  exit /b 1
)

:: ---------- 6. Build shared package ----------
echo [6/8] Building shared package...
call npm run build:shared
if errorlevel 1 (
  echo   ERROR: shared build failed
  pause
  exit /b 1
)
echo   OK: Shared package built (dist/index.cjs ready)

:: ---------- 7. Create directories ----------
echo [7/8] Creating storage directories...
mkdir output\videos output\audio output\subtitles output\thumbnails 2>nul
mkdir temp data\projects 2>nul
mkdir assets\characters assets\backgrounds assets\animations assets\sounds 2>nul
echo   OK: Directories created

:: ---------- 8. Create .env ----------
echo [8/8] Creating .env file...
if not exist .env (
  copy .env.example .env >nul
  echo   OK: .env created from .env.example
) else (
  echo   OK: .env already exists, skipping
)

echo.
echo ============================================
echo  Setup complete! Run start.bat to launch.
echo ============================================
echo.
pause
