@echo off
setlocal enabledelayedexpansion

REM Kill processes bound to common dev ports
set PORTS=3000 3001 5678 3002

for %%P in (%PORTS%) do (
  echo [stop_unified] Checking port %%P...
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":%%P .*LISTENING"') do (
    echo   -> Killing PID %%a on port %%P
    taskkill /F /PID %%a >nul 2>&1
  )
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr /R /C:":%%P .*ESTABLISHED"') do (
    echo   -> Killing PID %%a (ESTABLISHED) on port %%P
    taskkill /F /PID %%a >nul 2>&1
  )
)

echo [stop_unified] Done.
endlocal

