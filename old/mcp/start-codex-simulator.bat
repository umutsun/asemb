@echo off
echo ===============================================
echo  Simulating Codex CLI with Node.js
echo ===============================================
echo.

REM Create a simple Codex CLI simulator
echo Creating Codex simulator...

(
echo #!/usr/bin/env node
echo.
echo // Codex CLI Simulator
echo const readline = require('readline'^);
echo const { spawn } = require('child_process'^);
echo.
echo const rl = readline.createInterface({
echo   input: process.stdin,
echo   output: process.stdout,
echo   prompt: 'codex> '
echo }^);
echo.
echo console.log('Welcome to Codex CLI Simulator - DevOps Agent'^);
echo console.log('Type /mcp to interact with MCP'^);
echo console.log(''^);
echo.
echo rl.prompt(^);
echo.
echo rl.on('line', async (line^) =^> {
echo   const input = line.trim(^);
echo   
echo   if (input === '/mcp'^) {
echo     console.log('MCP Server configured:'^);
echo     console.log('  asb-cli - Ready'^);
echo   } else if (input.startsWith('/mcp call asb-cli'^)^) {
echo     // Extract the command
echo     const cmd = input.replace('/mcp call asb-cli ', ''^);
echo     
echo     // Send to MCP server
echo     const mcp = spawn('node', ['universal-asb-mcp-server.js'], {
echo       env: { ...process.env, AGENT_NAME: 'codex-cli' }
echo     }^);
echo     
echo     const request = {
echo       jsonrpc: '2.0',
echo       method: 'tools/call',
echo       params: { name: cmd.split(' '^)[0], arguments: {} },
echo       id: 1
echo     };
echo     
echo     mcp.stdin.write(JSON.stringify(request^) + '\\n'^);
echo     
echo     mcp.stdout.on('data', (data^) =^> {
echo       console.log('Response:', data.toString(^)^);
echo     }^);
echo   } else if (input === 'exit'^) {
echo     process.exit(0^);
echo   } else {
echo     console.log('Command not recognized. Try /mcp'^);
echo   }
echo   
echo   rl.prompt(^);
echo }^);
) > codex-simulator.js

echo.
echo Starting Codex Simulator...
echo.

REM Set environment variables
set AGENT_NAME=codex-cli
set PROJECT_KEY=alice-semantic-bridge
set PROJECT_ROOT=%CD%
set REDIS_HOST=localhost
set REDIS_PORT=6379
set REDIS_DB=2

REM Start the simulator
node codex-simulator.js
