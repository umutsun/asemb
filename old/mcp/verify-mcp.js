#!/usr/bin/env node

/**
 * ASB-CLI Verification Script
 * Checks if MCP server is properly installed and accessible
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔍 ASB-CLI MCP Server Verification\n');
console.log('=' .repeat(50));

// Check if MCP server exists
const mpcServerPath = 'C:\\mcp-servers\\asb-cli\\index.js';
if (fs.existsSync(mpcServerPath)) {
    console.log('✅ MCP Server found at:', mpcServerPath);
    
    // Check file size
    const stats = fs.statSync(mpcServerPath);
    console.log(`   Size: ${stats.size} bytes`);
    console.log(`   Modified: ${stats.mtime}`);
} else {
    console.log('❌ MCP Server NOT FOUND at:', mpcServerPath);
    console.log('   Run: npm install -g @modelcontextprotocol/server-asb-cli');
}

console.log('\n' + '=' .repeat(50));
console.log('📁 Agent MCP Configurations:\n');

// Check each agent's config
const agents = ['codex', 'gemini', 'claude'];
agents.forEach(agent => {
    const configPath = path.join(__dirname, `.${agent}`, 'mcp.json');
    if (fs.existsSync(configPath)) {
        console.log(`✅ ${agent.toUpperCase()} config: ${configPath}`);
        
        // Parse and verify config
        try {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (config.mcpServers && config.mcpServers['asb-cli']) {
                console.log(`   ✓ asb-cli configured`);
                console.log(`   ✓ Agent name: ${config.mcpServers['asb-cli'].env.AGENT_NAME}`);
            }
        } catch (e) {
            console.log(`   ❌ Invalid JSON in config`);
        }
    } else {
        console.log(`❌ ${agent.toUpperCase()} config NOT FOUND: ${configPath}`);
    }
});

console.log('\n' + '=' .repeat(50));
console.log('🚀 Next Steps:\n');
console.log('1. For each terminal agent (Codex, Gemini, Claude):');
console.log('   - Navigate to their directory (.codex, .gemini, .claude)');
console.log('   - Run: /add mcp');
console.log('   - Paste the content from their mcp.json file');
console.log('');
console.log('2. Test with:');
console.log('   /mcp                     - List configured servers');
console.log('   /use asb-cli asb_status  - Get project status');
console.log('');
console.log('3. If not working:');
console.log('   - Run: /restart');
console.log('   - Check if node.exe is in PATH');
console.log('   - Verify Redis is running on port 6379');

console.log('\n' + '=' .repeat(50));
