@echo off
echo ===============================================
echo  Claude Code MCP Quick Start
echo ===============================================
echo.

REM Set environment variable for MCP config
set CLAUDE_MCP_CONFIG=C:\xampp\htdocs\alice-semantic-bridge\claude-code-config.json

echo Setting MCP config path...
echo CLAUDE_MCP_CONFIG=%CLAUDE_MCP_CONFIG%
echo.

REM Make sure the config file exists with correct content
echo Creating MCP configuration file...
(
echo {
echo   "mcpServers": {
echo     "filesystem": {
echo       "command": "npx",
echo       "args": [
echo         "-y",
echo         "@modelcontextprotocol/server-filesystem",
echo         "C:\\xampp\\htdocs\\alice-semantic-bridge"
echo       ]
echo     },
echo     "asb-cli": {
echo       "command": "node",
echo       "args": ["C:\\xampp\\htdocs\\alice-semantic-bridge\\claude-code-mcp-server.js"],
echo       "env": {
echo         "AGENT_NAME": "claude-code",
echo         "PROJECT_KEY": "alice-semantic-bridge",
echo         "PROJECT_ROOT": "C:\\xampp\\htdocs\\alice-semantic-bridge",
echo         "REDIS_HOST": "localhost",
echo         "REDIS_PORT": "6379",
echo         "REDIS_DB": "2"
echo       }
echo     }
echo   }
echo }
) > claude-code-config.json

echo.
echo Starting Claude Code with MCP configuration...
echo.

REM Start Claude Code with the environment variable set
claude

pause
