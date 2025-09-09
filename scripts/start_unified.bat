@echo off
setlocal enabledelayedexpansion

REM Stop known dev ports, then start docker stack and app
call "%~dp0stop_unified.bat"

echo [start_unified] Bringing up docker services (if configured)...
call npm run docker:up 2>nul

echo [start_unified] Starting application...
call npm start

endlocal
