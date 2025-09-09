#!/usr/bin/env node

/**
 * MCP CLI Wrapper for PowerShell
 * This handles 'mcp' command in PowerShell/CMD
 */

const { execSync } = require('child_process');
const path = require('path');

// Check if called as 'mcp' without arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  // Run our MCP check
  try {
    execSync('node mcp-check.js', { 
      stdio: 'inherit',
      cwd: __dirname 
    });
  } catch (error) {
    console.error('Error running MCP check:', error.message);
  }
} else {
  // Pass arguments to mcp.js
  try {
    execSync(`node mcp.js ${args.join(' ')}`, { 
      stdio: 'inherit',
      cwd: __dirname 
    });
  } catch (error) {
    console.error('Error running MCP command:', error.message);
  }
}
