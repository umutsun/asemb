#!/usr/bin/env node
// Lightweight wrapper to launch the asb-cli MCP server
// Adjust the path below if you move your server.

const { spawn } = require('node:child_process');
const path = require('node:path');

// Absolute path to your asb-cli entry
const SERVER_ENTRY = 'C:\\mcp-servers\\asb-cli\\index.js';

const args = process.argv.slice(2);

const child = spawn(process.execPath, [SERVER_ENTRY, ...args], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: process.env.NODE_ENV || 'production',
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

