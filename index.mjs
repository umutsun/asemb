#!/usr/bin/env node

import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, '.env') });

class AliceShellBridgeServer {
  async listAgents() {
    const agentDirs = ['.claude', '.codex', '.gemini'];
    const agents = [];

    try {
      const fs = await import('fs');
      const path = await import('path');

      for (const agentDir of agentDirs) {
        const agentPath = path.join(__dirname, agentDir, 'agents');
        if (fs.existsSync(agentPath)) {
          const files = fs.readdirSync(agentPath);
          const agentFiles = files.filter(file => file.endsWith('.ts') || file.endsWith('.js'));
          
          agents.push({
            type: agentDir.replace('.', ''),
            agents: agentFiles.map(file => file.replace(/\.(ts|js)$/, '')),
            path: agentPath,
          });
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: `Available AI Agents:
${agents.map(agent => 
  `${agent.type.toUpperCase()}:
  - ${agent.agents.join('\n  - ')}
  Path: ${agent.path}`).join('\n\n')}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `Error listing agents: ${error.message}`,
          },
        ],
        isError: true,
      };
    }
  }
}

async function main() {
  const server = new AliceShellBridgeServer();
  let buffer = '';

  process.stdin.on('data', async (chunk) => {
    buffer += chunk.toString();
    try {
      const request = JSON.parse(buffer);
      buffer = '';

      if (request.method === 'call_tool' && request.params.name === 'list_agents') {
        const result = await server.listAgents();
        const response = {
          id: request.id,
          jsonrpc: '2.0',
          result: result,
        };
        process.stdout.write(JSON.stringify(response) + '\n');
      }
    } catch (e) {
      // Incomplete JSON, wait for more data
    }
  });
}

main();