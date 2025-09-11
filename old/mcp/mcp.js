#!/usr/bin/env node

/**
 * MCP Command Line Interface for VS Code
 * Usage: node mcp.js <command> [options]
 */

const ASBSharedMemory = require('./shared/asb-memory');
const readline = require('readline');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

class MCPCLI {
  constructor() {
    this.memory = new ASBSharedMemory('alice-semantic-bridge');
    this.agentName = 'claude-code-cli';
    this.commands = {
      'status': 'Show project and agent status',
      'agents': 'List all active agents',
      'context': 'Get/set shared context (context <key> [value])',
      'task': 'Queue a task (task <type> <data>)',
      'tasks': 'List pending tasks',
      'broadcast': 'Send message to all agents',
      'init': 'Initialize shared memory',
      'test': 'Test all MCP connections',
      'help': 'Show this help message'
    };
  }

  async connect() {
    try {
      await this.memory.connect();
      await this.memory.registerAgent(this.agentName, ['cli', 'debugging']);
      return true;
    } catch (error) {
      console.error('Failed to connect to shared memory:', error.message);
      return false;
    }
  }

  async status() {
    const stats = await this.memory.getStats();
    const project = await this.memory.getContext('project');
    const mcpServers = await this.memory.getContext('mcp-servers');
    
    console.log('\n📊 Project Status');
    console.log('================');
    if (project) {
      console.log(`Name: ${project.name}`);
      console.log(`Version: ${project.version}`);
      console.log(`Environment: ${project.environment}`);
      console.log(`Status: ${project.status}`);
    }
    
    console.log('\n👥 Active Agents:', stats.activeAgents);
    stats.agents.forEach(agent => {
      console.log(`  - ${agent.name}: ${agent.status}`);
    });
    
    console.log('\n🔧 MCP Servers:');
    if (mcpServers) {
      Object.entries(mcpServers).forEach(([name, config]) => {
        console.log(`  - ${name}: ${config.status}`);
      });
    }
    
    console.log('\n📦 Context Keys:', stats.contextKeys);
    console.log('📋 Task Queues:', Object.keys(stats.queues).length || 'None');
  }

  async listAgents() {
    const agents = await this.memory.getAgents();
    console.log('\n👥 Active Agents');
    console.log('================');
    agents.forEach(agent => {
      console.log(`\n${agent.name}`);
      console.log(`  Status: ${agent.status}`);
      console.log(`  Capabilities: ${agent.capabilities.join(', ')}`);
      console.log(`  Last Heartbeat: ${agent.lastHeartbeat}`);
    });
  }

  async context(key, value) {
    if (value) {
      // Set context
      await this.memory.setContext(key, value);
      console.log(`✓ Context set: ${key}`);
    } else if (key) {
      // Get context
      const data = await this.memory.getContext(key);
      if (data) {
        console.log(`\n📋 Context: ${key}`);
        console.log('================');
        console.log(JSON.stringify(data, null, 2));
      } else {
        console.log(`No context found for key: ${key}`);
      }
    } else {
      // List all context keys
      const stats = await this.memory.getStats();
      console.log('\n📋 Available Context Keys:');
      console.log('==========================');
      const keys = await this.memory.client.keys('alice-semantic-bridge:context:*');
      keys.forEach(key => {
        const shortKey = key.replace('alice-semantic-bridge:context:', '');
        console.log(`  - ${shortKey}`);
      });
    }
  }

  async queueTask(type, data) {
    const task = await this.memory.queueTask(type, data);
    console.log(`✓ Task queued: ${task.id}`);
    console.log(`  Type: ${task.type}`);
    console.log(`  Status: ${task.status}`);
  }

  async listTasks() {
    const taskTypes = ['code-review', 'performance-test', 'code-generation', 'documentation'];
    console.log('\n📋 Pending Tasks');
    console.log('================');
    
    let found = false;
    for (const type of taskTypes) {
      const queueLength = await this.memory.client.lLen(`alice-semantic-bridge:queue:${type}`);
      if (queueLength > 0) {
        console.log(`  ${type}: ${queueLength} tasks`);
        found = true;
      }
    }
    
    if (!found) {
      console.log('  No pending tasks');
    }
  }

  async broadcast(message) {
    await this.memory.broadcast({
      type: 'cli_message',
      from: this.agentName,
      message: message,
      timestamp: new Date().toISOString()
    });
    console.log('✓ Message broadcast to all agents');
  }

  async testConnections() {
    console.log('\n🔧 Testing MCP Connections');
    console.log('==========================');
    
    // Test Redis
    console.log('\n1. Redis Connection:');
    try {
      await this.memory.client.ping();
      console.log('   ✓ Redis connected (DB 2)');
    } catch (error) {
      console.log('   ✗ Redis failed:', error.message);
    }
    
    // Test filesystem MCP
    console.log('\n2. Filesystem MCP:');
    try {
      const { stdout } = await execPromise('npx @modelcontextprotocol/server-filesystem --version');
      console.log('   ✓ Filesystem MCP available');
    } catch (error) {
      console.log('   ✗ Filesystem MCP not installed');
      console.log('   Run: npm install -g @modelcontextprotocol/server-filesystem');
    }
    
    // Test ASB shared memory
    console.log('\n3. ASB Shared Memory:');
    const stats = await this.memory.getStats();
    console.log(`   ✓ Connected to project: ${stats.projectKey}`);
    console.log(`   Active agents: ${stats.activeAgents}`);
    
    // Test n8n connection
    console.log('\n4. n8n Connection:');
    try {
      const response = await fetch('http://91.99.229.96:5678/healthz');
      if (response.ok) {
        console.log('   ✓ n8n API reachable');
      } else {
        console.log('   ⚠ n8n API returned:', response.status);
      }
    } catch (error) {
      console.log('   ✗ n8n API unreachable');
    }
  }

  async initialize() {
    console.log('🚀 Initializing ASB Shared Memory...');
    
    // Run the initialization script
    try {
      const { stdout } = await execPromise('node init-shared-memory.js');
      console.log(stdout);
    } catch (error) {
      console.error('Initialization failed:', error.message);
    }
  }

  showHelp() {
    console.log('\n🔧 MCP CLI - Available Commands');
    console.log('================================\n');
    
    Object.entries(this.commands).forEach(([cmd, desc]) => {
      console.log(`  ${cmd.padEnd(12)} - ${desc}`);
    });
    
    console.log('\nUsage:');
    console.log('  node mcp.js <command> [options]');
    console.log('\nExamples:');
    console.log('  node mcp.js status');
    console.log('  node mcp.js context project');
    console.log('  node mcp.js context current-task "Testing MCP"');
    console.log('  node mcp.js task code-review \'{"file": "app.js"}\'');
    console.log('  node mcp.js broadcast "Hello agents!"');
  }

  async run(args) {
    const command = args[2];
    
    if (!command || command === 'help') {
      this.showHelp();
      return;
    }
    
    if (!(await this.connect())) {
      console.error('\n❌ Failed to connect to shared memory');
      console.error('Make sure Redis is running and try: node mcp.js init');
      process.exit(1);
    }
    
    try {
      switch (command) {
        case 'status':
          await this.status();
          break;
          
        case 'agents':
          await this.listAgents();
          break;
          
        case 'context':
          const key = args[3];
          const value = args[4];
          await this.context(key, value ? JSON.parse(value) : null);
          break;
          
        case 'task':
          const type = args[3];
          const data = args[4] ? JSON.parse(args[4]) : {};
          await this.queueTask(type, data);
          break;
          
        case 'tasks':
          await this.listTasks();
          break;
          
        case 'broadcast':
          const message = args[3] || 'Test message';
          await this.broadcast(message);
          break;
          
        case 'test':
          await this.testConnections();
          break;
          
        case 'init':
          await this.initialize();
          break;
          
        default:
          console.error(`Unknown command: ${command}`);
          this.showHelp();
      }
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      if (error.message.includes('JSON')) {
        console.error('Tip: Make sure to use valid JSON for data parameters');
        console.error('Example: node mcp.js context test \'{"key": "value"}\'');
      }
    } finally {
      await this.memory.disconnect();
    }
  }
}

// Run CLI
const cli = new MCPCLI();
cli.run(process.argv);
