@echo off
setlocal enabledelayedexpansion
title EduMotion AI

echo.
echo ============================================
echo  EduMotion AI — Starting Services
echo ============================================
echo.

:: ---------- Check Ollama ----------
echo [1/4] Checking Ollama...
curl -s http://localhost:11434/api/tags >nul 2>&1
if errorlevel 1 (
  echo   Starting Ollama...
  start /b ollama serve
  timeout /t 3 /nobreak >nul
) else (
  echo   OK: Ollama already running
)

:: ---------- Build backend if needed ----------
echo [2/4] Preparing backend...
if not exist packages\backend\dist\index.js (
  echo   Building backend...
  call npm run build:shared
  call npm run build:backend
)

:: ---------- Start backend ----------
echo [3/4] Starting backend server (port 3001)...
start "EduMotion Backend" /b cmd /c "node packages/backend/dist/index.js >> logs\backend.log 2>&1"
if not exist logs mkdir logs

:: Wait for backend to be ready
echo   Waiting for backend...
:wait_backend
timeout /t 1 /nobreak >nul
curl -s http://localhost:3001/api/health >nul 2>&1
if errorlevel 1 goto wait_backend
echo   OK: Backend ready

:: ---------- Start frontend ----------
echo [4/4] Starting frontend (port 5173)...
start "EduMotion Frontend" /b cmd /c "npm run dev --workspace=packages/frontend >> logs\frontend.log 2>&1"
timeout /t 3 /nobreak >nul

:: ---------- Open browser ----------
echo.
echo ============================================
echo  EduMotion AI is running!
echo  Frontend: http://localhost:5173
echo  Backend:  http://localhost:3001/api/health
echo  Press Ctrl+C in service windows to stop.
echo ============================================
echo.
start http://localhost:5173
pause
