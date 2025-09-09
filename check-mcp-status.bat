@echo off
echo ========================================
echo MCP Servers Status Check
echo ========================================
echo.

echo Checking installed global packages...
echo ----------------------------------------
npm list -g --depth=0 | findstr "mcp\|mysql\|n8n\|deepseek\|puppeteer\|memory\|shell\|github\|fetch\|filesystem"

echo.
echo ========================================
echo Checking local alice-semantic-bridge...
echo ----------------------------------------
if exist "C:\xampp\htdocs\alice-semantic-bridge\index.mjs" (
    echo [OK] Alice Shell Bridge found at C:\xampp\htdocs\alice-semantic-bridge
) else (
    echo [ERROR] Alice Shell Bridge NOT found at C:\xampp\htdocs\alice-semantic-bridge
)

if exist "C:\xampp\htdocs\alice-semantic-bridge\packages\asb-cli\index.js" (
    echo [OK] ASB-CLI found
) else (
    echo [ERROR] ASB-CLI NOT found
)

echo.
echo ========================================
echo Checking C:\mcp-servers directory...
echo ----------------------------------------
if exist "C:\mcp-servers" (
    echo [OK] C:\mcp-servers directory exists
    dir /B "C:\mcp-servers"
) else (
    echo [ERROR] C:\mcp-servers directory NOT found
)

echo.
echo ========================================
echo Current Claude Desktop Config Location:
echo ----------------------------------------
echo %APPDATA%\Claude\claude_desktop_config.json

echo.
echo ========================================
echo Available config files:
echo ----------------------------------------
dir /B *.json | findstr "claude_desktop"

echo.
pause