@echo off
REM Add ASB-CLI to Claude Desktop

echo Adding ASB-CLI to Claude Desktop...
claude mcp add asb-cli node C:\mcp-servers\asb-cli\index.js ^
-e AGENT_NAME=claude ^
-e PROJECT_KEY=alice-semantic-bridge ^
-e NODE_ENV=production ^
-e ASB_PROJECT_ROOT=C:\xampp\htdocs\alice-semantic-bridge ^
-e POSTGRES_HOST=91.99.229.96 ^
-e POSTGRES_PORT=5432 ^
-e POSTGRES_DB=postgres ^
-e POSTGRES_USER=postgres ^
-e POSTGRES_PASSWORD=Semsiye!22 ^
-e REDIS_HOST=127.0.0.1 ^
-e REDIS_PORT=6379 ^
-e REDIS_DB=2

echo Done! Restart Claude Desktop.
pause
