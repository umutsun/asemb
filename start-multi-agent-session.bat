@echo off
echo ========================================================
echo    ALICE SEMANTIC BRIDGE - MULTI-AGENT SETUP
echo ========================================================
echo.

echo [STEP 1] Setting up Codex MCP configuration...
call setup-codex-toml.bat >nul 2>&1
echo [OK] Codex config.toml created

echo.
echo [STEP 2] Current Agent Status:
echo.
echo   CLAUDE (CTO)           - Ready in Claude Code
echo   GEMINI (Dev+DevOps)    - Ready in Gemini CLI  
echo   CODEX (DevOps)         - Configuring MCP...
echo.

echo [STEP 3] Quick Test Commands:
echo.
echo For Codex:
echo   codex
echo   /mcp
echo   /mcp call asb-cli project_status
echo.
echo For Claude:
echo   /mcp call asb-cli get_context key="dashboard:progress"
echo.
echo For Gemini:
echo   /mcp call asb-cli share_context key="dashboard:progress" value={"percent":65}
echo.

echo ========================================================
echo    NEXT STEPS
echo ========================================================
echo.
echo 1. Open CODEX_MCP_GUIDE.md for Codex setup
echo 2. Open COORDINATED_WORK_SESSION.md for team prompts
echo 3. Monitor Redis: redis-cli -n 2 MONITOR
echo.
echo Press any key to open the guides...
pause >nul

start notepad CODEX_MCP_GUIDE.md
start notepad COORDINATED_WORK_SESSION.md
