@echo off
echo ========================================
echo ASB-CLI Unified MCP Status Check
echo ========================================
echo.

echo [1] MCP Server Location:
echo C:\mcp-servers\asb-cli\index.js
if exist "C:\mcp-servers\asb-cli\index.js" (
    echo ✓ File exists
    echo.
    echo Version check:
    findstr /C:"version: '3.0.0'" "C:\mcp-servers\asb-cli\index.js" >nul
    if %errorlevel%==0 (
        echo ✓ Version 3.0.0 (Unified)
    ) else (
        echo ✗ Wrong version - not unified!
    )
) else (
    echo ✗ File NOT FOUND
)

echo.
echo [2] Redis Check:
redis-cli -n 2 ping 2>nul
if %errorlevel%==0 (
    echo ✓ Redis is running on DB 2
) else (
    echo ✗ Redis not accessible
)

echo.
echo [3] Agent Configurations:
echo.
echo CLAUDE:
if exist "%APPDATA%\Claude\claude_desktop_config.json" (
    findstr /C:"\"AGENT_NAME\": \"claude\"" "%APPDATA%\Claude\claude_desktop_config.json" >nul
    if %errorlevel%==0 (
        echo ✓ Config updated with AGENT_NAME
    ) else (
        echo ✗ Config needs update
    )
) else (
    echo ✗ Config file not found
)

echo.
echo GEMINI:
if exist "C:\xampp\htdocs\alice-semantic-bridge\.gemini\mcp-config.json" (
    findstr /C:"\"AGENT_NAME\": \"gemini\"" "C:\xampp\htdocs\alice-semantic-bridge\.gemini\mcp-config.json" >nul
    if %errorlevel%==0 (
        echo ✓ Config updated with AGENT_NAME
    ) else (
        echo ✗ Config needs update
    )
) else (
    echo ✗ Config file not found
)

echo.
echo CODEX:
if exist "%USERPROFILE%\.codex\config.toml" (
    findstr /C:"AGENT_NAME = \"codex\"" "%USERPROFILE%\.codex\config.toml" >nul
    if %errorlevel%==0 (
        echo ✓ Config updated with AGENT_NAME
    ) else (
        echo ✗ Config needs update
    )
) else (
    echo ✗ Config file not found
)

echo.
echo [4] Instructions:
echo 1. Restart all agents (Claude, Gemini, Codex)
echo 2. Test with asb_status in each agent
echo 3. Use context_push/get for inter-agent communication
echo.
pause
