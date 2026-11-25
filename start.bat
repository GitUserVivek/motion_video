@echo off
setlocal enabledelayedexpansion
title Anupam Classes

echo.
echo ============================================
echo  Anupam Classes — Starting Services
echo ============================================
echo.

:: ---------- 0. CUDA build environment ----------
:: node-llama-cpp's prebuilt CUDA binaries are compiled with CUDA 13.1; on hosts
:: with an older toolkit llama.cpp has to be compiled from source
:: (LLM_BUILD_FROM_SOURCE=true). These variables make that build work and keep
:: the cached build reusable.
if not defined CUDA_PATH if exist "%ProgramFiles%\NVIDIA GPU Computing Toolkit\CUDA\v13.1" set "CUDA_PATH=%ProgramFiles%\NVIDIA GPU Computing Toolkit\CUDA\v13.1"
if not defined CUDACXX if defined CUDA_PATH if exist "%CUDA_PATH%\bin\nvcc.exe" set "CUDACXX=%CUDA_PATH%\bin\nvcc.exe"
if not defined NODE_LLAMA_CPP_CMAKE_OPTION_GGML_CUDA_NO_VMM set "NODE_LLAMA_CPP_CMAKE_OPTION_GGML_CUDA_NO_VMM=ON"

:: ---------- 1. Build ----------
:: Always rebuild: dist/ is what runs, so a stale build would silently execute
:: old code. build:backend rebuilds the shared package via its prebuild hook.
echo [1/3] Building backend...
call npm run build:backend
if errorlevel 1 (
  echo   ERROR: backend build failed - fix the errors above
  exit /b 1
)
echo   OK: Ready

:: ---------- 2. Start backend ----------
echo [2/3] Starting backend server (port 3001)...
if not exist logs mkdir logs
start "Anupam Classes Backend" /b cmd /c "node --env-file-if-exists=.env packages\backend\dist\index.js >> logs\backend.log 2>&1"

echo   Waiting for backend...
:wait_backend
timeout /t 1 /nobreak >nul
curl -s http://localhost:3001/api/health >nul 2>&1
if errorlevel 1 goto wait_backend
echo   OK: Backend ready

:: ---------- 3. Start frontend ----------
echo [3/3] Starting frontend dev server (port 5173)...
start "Anupam Classes Frontend" /b cmd /c "npm run dev --workspace=packages/frontend >> logs\frontend.log 2>&1"
timeout /t 3 /nobreak >nul

:: ---------- Open browser ----------
echo.
echo ============================================
echo  Anupam Classes is running!
echo  Frontend: http://localhost:5173
echo  Backend:  http://localhost:3001/api/health
echo  Logs:     .\logs\
echo  Close this window or run stop.bat to stop.
echo ============================================
echo.
start http://localhost:5173
pause
