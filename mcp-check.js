#!/usr/bin/env node

/**
 * MCP Command Handler - Detects and configures agent context
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ANSI colors
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function detectAgent() {
  // Check terminal title or environment variables
  const terminalTitle = process.env.TERMINAL_TITLE || '';
  const vscodeWorkspace = process.env.VSCODE_WORKSPACE || '';
  
  // Try to detect from various sources
  if (terminalTitle.toLowerCase().includes('claude')) return 'claude';
  if (terminalTitle.toLowerCase().includes('gemini')) return 'gemini';
  if (terminalTitle.toLowerCase().includes('codex')) return 'codex';
  
  // Check if running from specific directory
  const cwd = process.cwd();
  if (cwd.includes('.claude')) return 'claude';
  if (cwd.includes('.gemini')) return 'gemini';
  if (cwd.includes('.codex')) return 'codex';
  
  // Default to VS Code terminal
  return 'vscode';
}

function showMCPStatus() {
  const projectRoot = 'C:\\xampp\\htdocs\\alice-semantic-bridge';
  const agents = ['claude', 'gemini', 'codex'];
  const currentAgent = detectAgent();
  
  console.log(`\n${colors.cyan}${colors.bright}🔧 MCP Configuration Status${colors.reset}`);
  console.log(`${colors.yellow}Current Terminal: ${colors.green}${currentAgent}${colors.reset}`);
  console.log('=' .repeat(60));
  
  // Check each agent
  agents.forEach(agent => {
    const agentDir = path.join(projectRoot, `.${agent}`);
    const isCurrentAgent = agent === currentAgent;
    const marker = isCurrentAgent ? '→' : ' ';
    
    console.log(`\n${marker} ${colors.bright}📦 ${agent.toUpperCase()} Agent:${colors.reset}`);
    
    // Check MCP config
    const mcpPath = path.join(agentDir, 'mcp.json');
    const mcpConfigPath = path.join(agentDir, 'mcp-config.json');
    const serverPath = path.join(agentDir, 'mcp-server.js');
    
    let configFound = false;
    let config = null;
    
    // Try to read mcp.json
    if (fs.existsSync(mcpPath)) {
      console.log(`  ${colors.green}✓${colors.reset} mcp.json found`);
      try {
        config = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
        configFound = true;
      } catch (e) {
        console.log(`    ${colors.red}⚠ Invalid JSON${colors.reset}`);
      }
    } else if (fs.existsSync(mcpConfigPath)) {
      console.log(`  ${colors.green}✓${colors.reset} mcp-config.json found`);
      try {
        config = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
        configFound = true;
      } catch (e) {
        console.log(`    ${colors.red}⚠ Invalid JSON${colors.reset}`);
      }
    } else {
      console.log(`  ${colors.red}✗${colors.reset} No MCP config found`);
    }
    
    // Show MCP servers
    if (config && config.mcpServers) {
      const servers = Object.keys(config.mcpServers);
      console.log(`    Servers: ${colors.cyan}${servers.join(', ')}${colors.reset}`);
      
      // Check if asb-cli is configured
      if (config.mcpServers['asb-cli']) {
        console.log(`    ${colors.green}✓${colors.reset} asb-cli configured`);
      } else {
        console.log(`    ${colors.yellow}⚠${colors.reset} asb-cli not configured`);
      }
    }
    
    // Check MCP server script
    if (fs.existsSync(serverPath)) {
      console.log(`  ${colors.green}✓${colors.reset} mcp-server.js found`);
    } else {
      console.log(`  ${colors.yellow}⚠${colors.reset} mcp-server.js missing`);
    }
  });
  
  // Check VS Code config
  console.log(`\n${colors.bright}📦 VS Code Configuration:${colors.reset}`);
  const vscodeConfig = path.join(projectRoot, '.vscode', 'mcp.json');
  
  if (fs.existsSync(vscodeConfig)) {
    console.log(`  ${colors.green}✓${colors.reset} .vscode/mcp.json found`);
    try {
      const config = JSON.parse(fs.readFileSync(vscodeConfig, 'utf8'));
      if (config.mcpServers) {
        const servers = Object.keys(config.mcpServers);
        console.log(`    Servers: ${colors.cyan}${servers.join(', ')}${colors.reset}`);
      }
    } catch (e) {
      console.log(`    ${colors.red}⚠ Invalid JSON${colors.reset}`);
    }
  }
  
  // Check shared memory
  console.log(`\n${colors.bright}🧠 Shared Memory Status:${colors.reset}`);
  const { execSync } = require('child_process');
  
  try {
    execSync('redis-cli -n 2 ping', { stdio: 'ignore' });
    console.log(`  ${colors.green}✓${colors.reset} Redis connected (DB 2)`);
    
    // Count ASB keys
    const keysOutput = execSync('redis-cli -n 2 --scan --pattern "alice-semantic-bridge:*"', { encoding: 'utf8' });
    const keys = keysOutput.trim().split('\n').filter(k => k);
    console.log(`    Keys: ${colors.cyan}${keys.length}${colors.reset}`);
  } catch (e) {
    console.log(`  ${colors.red}✗${colors.reset} Redis not connected`);
  }
  
  // Show commands for current agent
  console.log(`\n${colors.bright}💡 Commands for ${currentAgent.toUpperCase()}:${colors.reset}`);
  console.log(`  ${colors.cyan}npm run mcp:status${colors.reset}    - Show system status`);
  console.log(`  ${colors.cyan}npm run mcp:agents${colors.reset}    - List active agents`);
  console.log(`  ${colors.cyan}npm run vibe${colors.reset}          - Start Vibe Coding mode`);
  console.log(`  ${colors.cyan}node mcp.js help${colors.reset}      - Show all commands`);
  
  // Summary
  console.log(`\n${colors.bright}📊 Summary:${colors.reset}`);
  
  let allConfigured = true;
  agents.forEach(agent => {
    const mcpPath = path.join(projectRoot, `.${agent}`, 'mcp.json');
    const serverPath = path.join(projectRoot, `.${agent}`, 'mcp-server.js');
    
    if (!fs.existsSync(mcpPath)) {
      console.log(`  ${colors.yellow}⚠${colors.reset}  ${agent} needs MCP config`);
      allConfigured = false;
    }
    if (!fs.existsSync(serverPath)) {
      console.log(`  ${colors.yellow}⚠${colors.reset}  ${agent} needs MCP server`);
      allConfigured = false;
    }
  });
  
  if (allConfigured) {
    console.log(`  ${colors.green}✅ All agents configured with asb-cli!${colors.reset}`);
    console.log(`  ${colors.green}✅ System ready for multi-agent collaboration${colors.reset}`);
  }
  
  console.log();
}

// Main
if (require.main === module) {
  const command = process.argv[2];
  
  if (!command || command === '/mcp' || command === 'mcp') {
    showMCPStatus();
  } else if (command === 'fix') {
    console.log('Fixing MCP configurations...');
    // Auto-fix logic here
  } else {
    console.log(`Unknown command: ${command}`);
  }
}

module.exports = { detectAgent, showMCPStatus };
