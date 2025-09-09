@echo off
REM Add ASB-CLI to Codex

echo Adding ASB-CLI to Codex...
cd C:\xampp\htdocs\alice-semantic-bridge\.codex

REM Update mcp-config.json
echo { > mcp-config.json
echo   "mcpServers": { >> mcp-config.json
echo     "asb-cli": { >> mcp-config.json
echo       "command": "node", >> mcp-config.json
echo       "args": ["C:/mcp-servers/asb-cli/index.js"], >> mcp-config.json
echo       "env": { >> mcp-config.json
echo         "AGENT_NAME": "codex", >> mcp-config.json
echo         "PROJECT_KEY": "alice-semantic-bridge", >> mcp-config.json
echo         "NODE_ENV": "production", >> mcp-config.json
echo         "ASB_PROJECT_ROOT": "C:/xampp/htdocs/alice-semantic-bridge", >> mcp-config.json
echo         "POSTGRES_HOST": "91.99.229.96", >> mcp-config.json
echo         "POSTGRES_PORT": "5432", >> mcp-config.json
echo         "POSTGRES_DB": "postgres", >> mcp-config.json
echo         "POSTGRES_USER": "postgres", >> mcp-config.json
echo         "POSTGRES_PASSWORD": "Semsiye!22", >> mcp-config.json
echo         "REDIS_HOST": "127.0.0.1", >> mcp-config.json
echo         "REDIS_PORT": "6379", >> mcp-config.json
echo         "REDIS_DB": "2" >> mcp-config.json
echo       } >> mcp-config.json
echo     } >> mcp-config.json
echo   } >> mcp-config.json
echo } >> mcp-config.json

echo Done! Codex config updated.
pause
