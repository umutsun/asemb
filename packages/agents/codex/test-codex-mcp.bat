@echo off
echo ========================================
echo Codex MCP Configuration Test
echo ========================================
echo.

echo [1] Checking Codex config file...
if exist "%USERPROFILE%\.codex\config.toml" (
    echo ✓ Config file exists at: %USERPROFILE%\.codex\config.toml
) else (
    echo ✗ Config file NOT FOUND at: %USERPROFILE%\.codex\config.toml
    exit /b 1
)

echo.
echo [2] Checking PostgreSQL password...
if defined POSTGRES_PASSWORD (
    echo ✓ POSTGRES_PASSWORD is set
) else (
    echo ✗ POSTGRES_PASSWORD is NOT set
    echo   Run: set POSTGRES_PASSWORD=your_password_here
)

echo.
echo [3] Checking ASB CLI MCP server...
if exist "C:\mcp-servers\asb-cli\index.js" (
    echo ✓ ASB CLI server found at: C:\mcp-servers\asb-cli\index.js
) else (
    echo ✗ ASB CLI server NOT FOUND at: C:\mcp-servers\asb-cli\index.js
)

echo.
echo [4] Config content:
echo ------------------------------------
type "%USERPROFILE%\.codex\config.toml" 2>nul | findstr /C:"mcp_servers.asb-cli" /C:"command" /C:"args" /C:"AGENT_NAME"
echo ------------------------------------

echo.
echo [5] To test MCP in Codex:
echo    - Restart Codex
echo    - The MCP server should auto-start when needed
echo.
pause
