@echo off
echo Cleaning up old MCP configuration attempts...
echo.

REM Delete old JSON configs (they don't work with Codex)
if exist "mcp-config.json" (
    echo Deleting mcp-config.json...
    del "mcp-config.json"
)

if exist "mcp_config.json" (
    echo Deleting mcp_config.json...
    del "mcp_config.json"
)

if exist "mcp-config-luwi.json" (
    echo Deleting mcp-config-luwi.json...
    del "mcp-config-luwi.json"
)

if exist "mcp-config-simple.json" (
    echo Deleting mcp-config-simple.json...
    del "mcp-config-simple.json"
)

if exist "mcp.json" (
    echo Deleting mcp.json...
    del "mcp.json"
)

echo.
echo Cleanup complete!
echo.
echo The correct configuration is now at: %USERPROFILE%\.codex\config.toml
echo.
pause
