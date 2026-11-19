@echo off
setlocal enabledelayedexpansion
title EduMotion AI

echo.
echo ============================================
echo  EduMotion AI — Starting Services
echo ============================================
echo.

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
start "EduMotion Backend" /b cmd /c "node --env-file-if-exists=.env packages\backend\dist\index.js >> logs\backend.log 2>&1"

echo   Waiting for backend...
:wait_backend
timeout /t 1 /nobreak >nul
curl -s http://localhost:3001/api/health >nul 2>&1
if errorlevel 1 goto wait_backend
echo   OK: Backend ready

:: ---------- 3. Start frontend ----------
echo [3/3] Starting frontend dev server (port 5173)...
start "EduMotion Frontend" /b cmd /c "npm run dev --workspace=packages/frontend >> logs\frontend.log 2>&1"
timeout /t 3 /nobreak >nul

:: ---------- Open browser ----------
echo.
echo ============================================
echo  EduMotion AI is running!
echo  Frontend: http://localhost:5173
echo  Backend:  http://localhost:3001/api/health
echo  Logs:     .\logs\
echo  Close this window or run stop.bat to stop.
echo ============================================
echo.
start http://localhost:5173
pause
