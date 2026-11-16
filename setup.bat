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
echo [1/7] Checking Node.js...
node --version >nul 2>&1
if errorlevel 1 (
  echo   ERROR: Node.js not found. Install from https://nodejs.org (v18+^)
  set ERRORS=1
) else (
  for /f "tokens=1" %%v in ('node --version') do echo   OK: %%v
)

:: ---------- 2. FFmpeg ----------
echo [2/7] Checking FFmpeg...
ffmpeg -version >nul 2>&1
if errorlevel 1 (
  echo   ERROR: FFmpeg not found. Install from https://ffmpeg.org/download.html
  set ERRORS=1
) else (
  echo   OK: FFmpeg found
)

if %ERRORS%==1 (
  echo.
  echo   Setup cannot continue. Fix the errors above and run setup.bat again.
  pause
  exit /b 1
)

:: ---------- 3. npm install ----------
echo [3/7] Installing npm dependencies...
call npm install --ignore-scripts
if errorlevel 1 (
  echo   ERROR: npm install failed
  pause
  exit /b 1
)

:: ---------- 4. Build shared + backend ----------
echo [4/7] Building packages...
call npm run build:shared
if errorlevel 1 (
  echo   ERROR: shared build failed
  pause
  exit /b 1
)
call npm run build:backend
echo   OK: Packages built

:: ---------- 5. Create directories ----------
echo [5/7] Creating storage directories...
mkdir output\videos output\audio output\subtitles output\thumbnails 2>nul
mkdir temp data\projects 2>nul
mkdir assets\characters assets\backgrounds assets\animations assets\sounds logs 2>nul
echo   OK: Directories created

:: ---------- 6. Create .env ----------
echo [6/7] Creating .env file...
if not exist .env (
  copy .env.example .env >nul
  echo   OK: .env created from .env.example
) else (
  echo   OK: .env already exists, skipping
)

:: ---------- 7. Download AI model ----------
echo [7/7] Downloading AI model (GGUF — may take several minutes)...
if exist packages\backend\dist\services\llm.downloader.js (
  node packages\backend\dist\services\llm.downloader.js
  if errorlevel 1 (
    echo   WARNING: Model download failed. It will be retried on first server start.
    echo   Manual retry: node packages\backend\dist\services\llm.downloader.js
  )
) else (
  echo   NOTE: Downloader not compiled — model will download on first server start.
)

echo.
echo ============================================
echo  Setup complete! Run start.bat to launch.
echo ============================================
echo.
pause
