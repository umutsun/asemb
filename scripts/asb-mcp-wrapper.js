#!/usr/bin/env node
// ASB MCP Wrapper with Agent Communication

const { spawn } = require('child_process');
const path = require('path');
const AgentCommunication = require('./agent-communication');

// Get agent name from environment or default
const agentName = process.env.AGENT_NAME || 'unknown';
const projectKey = process.env.PROJECT_KEY || 'alice-semantic-bridge';

console.error(`[ASB-MCP] Starting for agent: ${agentName}`);

// Initialize agent communication
const agentComm = new AgentCommunication(agentName);

// Start ASB-CLI MCP Server
const asbCliPath = path.join('C:', 'mcp-servers', 'asb-cli', 'index.js');
const asbCli = spawn('node', [asbCliPath], {
  stdio: 'inherit',
  env: {
    ...process.env,
    AGENT_NAME: agentName,
    PROJECT_KEY: projectKey
  }
});

// Monitor ASB-CLI process
asbCli.on('error', (error) => {
  console.error(`[ASB-MCP] Error starting ASB-CLI:`, error);
  agentComm.updateStatus('error', 'ASB-CLI failed to start');
});

asbCli.on('exit', (code, signal) => {
  console.error(`[ASB-MCP] ASB-CLI exited with code ${code} and signal ${signal}`);
  agentComm.updateStatus('offline', 'ASB-CLI terminated');
  agentComm.close();
  process.exit(code || 0);
});

// Update agent status
agentComm.updateStatus('online', 'ASB-CLI running');

// Handle process termination
process.on('SIGINT', () => {
  console.error('\n[ASB-MCP] Shutting down...');
  agentComm.updateStatus('offline', 'Shutting down');
  agentComm.close();
  asbCli.kill('SIGTERM');
  process.exit(0);
});

process.on('SIGTERM', () => {
  agentComm.updateStatus('offline', 'Terminated');
  agentComm.close();
  asbCli.kill('SIGTERM');
  process.exit(0);
});

// Periodic status updates
setInterval(async () => {
  await agentComm.updateStatus('online', 'ASB-CLI running');
}, 30000); // Every 30 seconds