@echo off
echo ========================================
echo Unified ASB-CLI MCP Test Script
echo ========================================
echo.

echo [1] Testing ASB-CLI directly...
echo.

cd C:\mcp-servers\asb-cli

echo Testing with AGENT_NAME=test-agent...
set AGENT_NAME=test-agent
set PROJECT_KEY=alice-semantic-bridge
set REDIS_HOST=localhost
set REDIS_PORT=6379
set REDIS_DB=2
set POSTGRES_HOST=91.99.229.96
set POSTGRES_PORT=5432
set POSTGRES_DB=postgres
set POSTGRES_USER=postgres
set POSTGRES_PASSWORD=Semsiye!22

node index.js < test-commands.txt

echo.
echo [2] Instructions for testing in each agent:
echo.
echo CLAUDE:
echo - Restart Claude desktop app
echo - Run: asb_status
echo - Run: asb_redis set claude:test "Hello from Claude"
echo - Run: context_push shared-message {"from": "claude", "msg": "Claude here!"}
echo.
echo GEMINI:
echo - Restart Gemini Code
echo - Run: asb_status
echo - Run: asb_redis get claude:test
echo - Run: context_get shared-message
echo.
echo CODEX:
echo - Restart Codex
echo - Run: asb_status
echo - Run: context_push shared-message {"from": "codex", "msg": "Codex reporting!"}
echo.
pause
