@echo off
echo ========================================
echo Applying FULL MCP Configuration
echo ========================================
echo.

echo Backing up current config...
if exist "%APPDATA%\Claude\claude_desktop_config.json" (
    copy "%APPDATA%\Claude\claude_desktop_config.json" "%APPDATA%\Claude\claude_desktop_config.backup_%date:~10,4%%date:~4,2%%date:~7,2%_%time:~0,2%%time:~3,2%.json"
    echo Backup saved.
)

echo.
echo Copying FULL MCP configuration...
copy /Y "claude_desktop_full_mcp.json" "%APPDATA%\Claude\claude_desktop_config.json"

echo.
echo ========================================
echo Configuration Applied!
echo ========================================
echo.
echo Active MCP Servers:
echo.
echo ✅ filesystem - File system access
echo ✅ mysql - MySQL database
echo ✅ postgres - PostgreSQL database  
echo ✅ alice-shell-bridge - Alice project commands
echo ✅ asb-cli - ASB CLI commands
echo ✅ n8n-mcp - N8N workflow integration
echo ✅ shell - Terminal commands
echo ✅ deepseek - DeepSeek AI
echo ✅ github - GitHub integration
echo ✅ fetch - Web fetching
echo ✅ puppeteer - Browser automation
echo ✅ memory - Persistent memory
echo ✅ brave-search - Brave search
echo ✅ sequential-thinking - Reasoning
echo.
echo ========================================
echo IMPORTANT: Restart Claude Desktop now!
echo ========================================
echo.
pause