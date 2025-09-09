@echo off
ECHO ==================================================
ECHO      ALICE SEMANTIC BRIDGE - RESTART SCRIPT
ECHO ==================================================

ECHO.
ECHO [1/2] Stopping Docker containers...
call docker-compose down
ECHO    Done.

ECHO.
ECHO [2/2] Starting Docker containers in detached mode...
call docker-compose up -d
ECHO    Done.

ECHO.
ECHO ==================================================
ECHO      RESTART COMPLETE
ECHO ==================================================
pause