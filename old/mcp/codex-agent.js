#!/usr/bin/env node

/**
 * Codex CLI Alternative Runner
 * Run this to act as Codex agent without CLI
 */

const readline = require('readline');
const ASBSharedMemory = require('./shared/asb-memory');

class CodexAgent {
  constructor() {
    this.memory = null;
    this.agentName = 'codex-cli';
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'codex> '
    });
  }

  async initialize() {
    this.memory = new ASBSharedMemory('alice-semantic-bridge');
    await this.memory.connect();
    
    await this.memory.registerAgent(this.agentName, [
      'automation',
      'infrastructure', 
      'ci-cd',
      'monitoring'
    ]);
    
    console.log('✅ Codex agent connected to shared memory');
    console.log('📋 Available commands:');
    console.log('  status       - Get project status');
    console.log('  agents       - List active agents');
    console.log('  share <json> - Share context');
    console.log('  get <key>    - Get context');
    console.log('  task <desc>  - Create task');
    console.log('  broadcast <msg> - Broadcast message');
    console.log('  exit         - Quit');
    console.log('');
  }

  async handleCommand(input) {
    const [cmd, ...args] = input.trim().split(' ');
    
    try {
      switch(cmd) {
        case 'status':
          const stats = await this.memory.getStats();
          const project = await this.memory.getContext('project');
          console.log('Project Status:', JSON.stringify({ stats, project }, null, 2));
          break;
          
        case 'agents':
          const agents = await this.memory.getAgents();
          console.log('Active Agents:');
          agents.forEach(a => {
            console.log(`  - ${a.name}: ${a.status} (${a.capabilities.join(', ')})`);
          });
          break;
          
        case 'share':
          const shareData = args.join(' ');
          try {
            const parsed = JSON.parse(shareData);
            const key = parsed.key || 'codex:shared';
            delete parsed.key;
            await this.memory.setContext(key, parsed);
            console.log(`✅ Shared context: ${key}`);
          } catch (e) {
            console.log('Usage: share {"key":"name","data":"value"}');
          }
          break;
          
        case 'get':
          const key = args[0];
          const context = await this.memory.getContext(key);
          console.log(`Context '${key}':`, JSON.stringify(context, null, 2));
          break;
          
        case 'task':
          const description = args.join(' ');
          const task = await this.memory.queueTask('automation', {
            description,
            priority: 'medium',
            createdBy: this.agentName
          });
          console.log(`✅ Task created: ${task.id}`);
          break;
          
        case 'broadcast':
          const message = args.join(' ');
          await this.memory.broadcast({
            type: 'message',
            from: this.agentName,
            message
          });
          console.log('📢 Message broadcast');
          break;
          
        case 'exit':
        case 'quit':
          await this.memory.disconnect();
          process.exit(0);
          break;
          
        default:
          console.log('Unknown command. Try: status, agents, share, get, task, broadcast, exit');
      }
    } catch (error) {
      console.error('Error:', error.message);
    }
  }

  async start() {
    console.log('🚀 Codex Agent (Alternative Runner)');
    console.log('   DevOps & Automation Engineer');
    console.log('=====================================\n');
    
    await this.initialize();
    
    this.rl.prompt();
    
    this.rl.on('line', async (line) => {
      await this.handleCommand(line);
      this.rl.prompt();
    });
    
    this.rl.on('close', async () => {
      await this.memory.disconnect();
      process.exit(0);
    });
  }
}

// Start the agent
if (require.main === module) {
  const agent = new CodexAgent();
  agent.start().catch(console.error);
}

module.exports = CodexAgent;
