@echo off
cls
echo.
echo    ╔══════════════════════════════════════════════════════════╗
echo    ║                                                          ║
echo    ║         ALICE SHELL BRIDGE - VIBE CODING MODE           ║
echo    ║                                                          ║
echo    ║    CTO: Claude Desktop    PM: ChatGPT Desktop           ║
echo    ║                                                          ║
echo    ╚══════════════════════════════════════════════════════════╝
echo.
echo    Starting Terminal CLI Orchestration Environment...
echo.

REM Set environment
set NODE_ENV=development
set ASB_MODE=vibe-coding
set PROJECT_KEY=alice-semantic-bridge

REM Check Redis
redis-cli -n 2 ping >nul 2>&1
if %errorlevel% neq 0 (
    echo    [ERROR] Redis is not running!
    echo    Please start Redis first: redis-server
    pause
    exit /b 1
)

echo    [✓] Redis connected
echo    [✓] Initializing shared memory...

REM Initialize shared memory
node init-shared-memory.js >nul 2>&1

echo    [✓] Starting orchestrator...
echo.
echo    ============================================================
echo.

REM Start orchestrator in interactive mode
node asb-orchestrator.js

pause
