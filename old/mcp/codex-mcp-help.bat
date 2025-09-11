@echo off
echo ===============================================
echo  Codex MCP Configuration Helper
echo ===============================================
echo.

echo Checking Codex MCP options...
echo.

echo Try these commands:
echo.
echo 1. Check current MCP status:
echo    codex mcp
echo.
echo 2. Check help:
echo    codex mcp --help
echo.
echo 3. Set config file:
echo    codex mcp --config codex-mcp.json
echo.
echo 4. With environment variable:
echo    set CODEX_MCP_CONFIG=codex-mcp.json
echo    codex mcp
echo.
echo 5. Direct stdio connection:
echo    codex mcp --stdio "node universal-asb-mcp-server.js"
echo.

echo ===============================================
echo  Alternative: Use Node.js Agent Instead
echo ===============================================
echo.
echo Since Codex MCP is not compatible, use our Node agent:
echo.
echo    node codex-agent.js
echo.
echo This provides the same functionality:
echo    - status: Get project status
echo    - agents: List agents  
echo    - share: Share context
echo    - get: Get context
echo    - task: Create task
echo    - broadcast: Send message
echo.
pause
