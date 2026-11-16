@echo off
title EduMotion AI — Stop

echo.
echo Stopping EduMotion AI services...
echo.

:: Kill backend (node process on port 3001)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :3001 ^| findstr LISTENING') do (
  echo   Stopping backend (PID %%p)...
  taskkill /PID %%p /F >nul 2>&1
)

:: Kill frontend (vite dev server on port 5173)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
  echo   Stopping frontend (PID %%p)...
  taskkill /PID %%p /F >nul 2>&1
)

echo   Done. Your videos and data are safe.
echo.
pause
