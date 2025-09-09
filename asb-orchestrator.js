#!/usr/bin/env node

/**
 * Alice Shell Bridge - Main Orchestrator
 * Multi-Agent Terminal CLI Command Center
 */

const ASBSharedMemory = require('./shared/asb-memory');
const readline = require('readline');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// ANSI Color codes (chalk yerine)
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Text colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  
  // Background colors
  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m'
};

// Color helper functions
const color = {
  cyan: (text) => `${colors.cyan}${text}${colors.reset}`,
  cyanBold: (text) => `${colors.cyan}${colors.bright}${text}${colors.reset}`,
  green: (text) => `${colors.green}${text}${colors.reset}`,
  red: (text) => `${colors.red}${text}${colors.reset}`,
  yellow: (text) => `${colors.yellow}${text}${colors.reset}`,
  gray: (text) => `${colors.gray}${text}${colors.reset}`,
  white: (text) => `${colors.white}${text}${colors.reset}`,
  bold: (text) => `${colors.bright}${text}${colors.reset}`
};

class ASBOrchestrator {
  constructor() {
    this.memory = new ASBSharedMemory('alice-semantic-bridge');
    this.currentProject = 'alice-semantic-bridge';
    this.activeAgents = new Map();
    this.taskQueue = [];
    this.sessionId = `session-${Date.now()}`;
  }

  async initialize() {
    console.log(color.cyanBold('\n🚀 Alice Shell Bridge Orchestrator'));
    console.log(color.gray('=' .repeat(60)));
    
    await this.memory.connect();
    await this.memory.registerAgent('orchestrator', [
      'coordination',
      'task-distribution',
      'monitoring',
      'reporting'
    ]);
    
    // Set orchestration context
    await this.memory.setContext('orchestration', {
      sessionId: this.sessionId,
      startTime: new Date().toISOString(),
      mode: 'cli-vibe-coding',
      cto: 'claude-desktop',
      pm: 'chatgpt-desktop'
    });
    
    console.log(color.green('✓ Orchestrator initialized'));
    console.log(color.gray(`Session: ${this.sessionId}`));
  }

  async showDashboard() {
    console.clear();
    console.log(color.cyanBold('\n╔══════════════════════════════════════════════════════════╗'));
    console.log(color.cyanBold('║         ALICE SHELL BRIDGE - COMMAND CENTER             ║'));
    console.log(color.cyanBold('╚══════════════════════════════════════════════════════════╝'));
    
    // Get system stats
    const stats = await this.memory.getStats();
    const agents = await this.memory.getAgents();
    const project = await this.memory.getContext('project');
    const tasks = await this.memory.getContext('active-tasks') || [];
    
    // Project Info
    console.log(color.yellow('\n📁 PROJECT'));
    console.log(color.white(`   Name: ${project?.name || 'N/A'}`));
    console.log(color.white(`   Version: ${project?.version || 'N/A'}`));
    console.log(color.white(`   Environment: ${project?.environment || 'N/A'}`));
    
    // Agents Status
    console.log(color.yellow('\n👥 AGENTS'));
    agents.forEach(agent => {
      const statusIcon = agent.status === 'active' ? '🟢' : '🔴';
      console.log(`   ${statusIcon} ${agent.name.padEnd(15)} ${color.gray(agent.capabilities.slice(0, 2).join(', '))}`);
    });
    
    // Active Tasks
    console.log(color.yellow('\n📋 ACTIVE TASKS'));
    if (tasks.length > 0) {
      tasks.slice(0, 5).forEach(task => {
        console.log(`   • ${task.type.padEnd(20)} ${color.gray(task.status)}`);
      });
    } else {
      console.log(color.gray('   No active tasks'));
    }
    
    // Available Commands
    console.log(color.yellow('\n⚡ QUICK COMMANDS'));
    console.log(color.gray('   [1] Create Task     [2] Assign Agent    [3] Review Code'));
    console.log(color.gray('   [4] Deploy         [5] Test Suite     [6] Performance'));
    console.log(color.gray('   [7] Git Sync       [8] n8n Workflow   [9] Documentation'));
    console.log(color.gray('   [0] Settings       [h] Help           [q] Quit'));
    
    console.log(color.cyan('\n' + '─' .repeat(60)));
  }

  async createTask(type, description, priority = 'medium') {
    const task = {
      id: `task-${Date.now()}`,
      type,
      description,
      priority,
      status: 'pending',
      createdBy: 'orchestrator',
      createdAt: new Date().toISOString()
    };
    
    await this.memory.queueTask(type, task);
    
    // Notify agents
    await this.memory.broadcast({
      type: 'new_task',
      task: task,
      message: `New ${priority} priority task: ${type}`
    });
    
    console.log(color.green(`✓ Task created: ${task.id}`));
    return task;
  }

  async assignTask(taskId, agentName) {
    await this.memory.sendToAgent(agentName, {
      type: 'task_assignment',
      taskId,
      action: 'process',
      priority: 'high'
    });
    
    console.log(color.green(`✓ Task ${taskId} assigned to ${agentName}`));
  }

  async executeCommand(command) {
    const [cmd, ...args] = command.split(' ');
    
    switch(cmd) {
      case 'task':
        await this.handleTaskCommand(args);
        break;
        
      case 'agent':
        await this.handleAgentCommand(args);
        break;
        
      case 'deploy':
        await this.handleDeployCommand(args);
        break;
        
      case 'test':
        await this.handleTestCommand(args);
        break;
        
      case 'git':
        await this.handleGitCommand(args);
        break;
        
      case 'n8n':
        await this.handleN8nCommand(args);
        break;
        
      case 'code':
        await this.handleCodeCommand(args);
        break;
        
      case 'perf':
        await this.handlePerfCommand(args);
        break;
        
      case 'docs':
        await this.handleDocsCommand(args);
        break;
        
      case 'status':
        await this.showDashboard();
        break;
        
      case 'help':
        this.showHelp();
        break;
        
      case 'quit':
      case 'exit':
        await this.shutdown();
        process.exit(0);
        break;
        
      default:
        // Pass to shell
        await this.executeShell(command);
    }
  }

  async handleTaskCommand(args) {
    const subCmd = args[0];
    
    switch(subCmd) {
      case 'create':
        const type = args[1] || 'general';
        const description = args.slice(2).join(' ') || 'No description';
        await this.createTask(type, description);
        break;
        
      case 'list':
        const tasks = await this.memory.getContext('active-tasks') || [];
        console.log(color.yellow('\n📋 Tasks:'));
        tasks.forEach(task => {
          console.log(`  ${task.id}: ${task.type} - ${task.status}`);
        });
        break;
        
      case 'assign':
        const taskId = args[1];
        const agent = args[2];
        await this.assignTask(taskId, agent);
        break;
        
      default:
        console.log(color.red('Unknown task command'));
    }
  }

  async handleAgentCommand(args) {
    const subCmd = args[0];
    
    switch(subCmd) {
      case 'list':
        const agents = await this.memory.getAgents();
        console.log(color.yellow('\n👥 Active Agents:'));
        agents.forEach(agent => {
          console.log(`  ${agent.name}: ${agent.status}`);
          console.log(color.gray(`    Capabilities: ${agent.capabilities.join(', ')}`));
        });
        break;
        
      case 'start':
        const agentName = args[1];
        console.log(color.yellow(`Starting ${agentName} agent...`));
        exec(`node .${agentName}/agent-bridge.js`, (err) => {
          if (err) console.error(color.red(`Failed to start ${agentName}`));
        });
        break;
        
      case 'stop':
        // Implement agent stop logic
        break;
        
      default:
        console.log(color.red('Unknown agent command'));
    }
  }

  async handleDeployCommand(args) {
    const target = args[0] || 'staging';
    
    console.log(color.yellow(`\n🚀 Deploying to ${target}...`));
    
    // Queue deployment task
    await this.createTask('deployment', `Deploy to ${target}`, 'high');
    
    // Execute deployment script
    if (target === 'luwi') {
      await this.executeShell('deploy-to-luwi.bat');
    } else if (target === 'n8n') {
      await this.executeShell('deploy-to-n8n-luwi.bat');
    }
  }

  async handleTestCommand(args) {
    const type = args[0] || 'all';
    
    console.log(color.yellow(`\n🧪 Running ${type} tests...`));
    
    switch(type) {
      case 'mcp':
        await this.executeShell('npm run mcp:test');
        break;
      case 'memory':
        await this.executeShell('npm run shared-memory:test');
        break;
      case 'all':
        await this.executeShell('npm test');
        break;
    }
  }

  async handleGitCommand(args) {
    const subCmd = args[0];
    
    switch(subCmd) {
      case 'status':
        await this.executeShell('git status');
        break;
      case 'commit':
        const message = args.slice(1).join(' ');
        await this.executeShell(`git add . && git commit -m "${message}"`);
        break;
      case 'push':
        await this.executeShell('git push');
        break;
      case 'sync':
        await this.executeShell('git pull && git push');
        break;
    }
  }

  async handleN8nCommand(args) {
    const subCmd = args[0];
    
    console.log(color.yellow('\n⚡ n8n Integration'));
    
    switch(subCmd) {
      case 'deploy':
        console.log('Deploying to n8n...');
        await this.executeShell('npm run deploy:prepare');
        break;
      case 'test':
        console.log('Testing n8n connection...');
        // Implement n8n test
        break;
    }
  }

  async handleCodeCommand(args) {
    const action = args[0];
    const file = args[1];
    
    switch(action) {
      case 'review':
        await this.createTask('code-review', `Review ${file}`, 'high');
        await this.memory.broadcast({
          type: 'code_review_request',
          file,
          requestedBy: 'orchestrator'
        });
        break;
        
      case 'generate':
        const description = args.slice(1).join(' ');
        await this.createTask('code-generation', description, 'medium');
        break;
        
      case 'refactor':
        await this.createTask('refactoring', `Refactor ${file}`, 'low');
        break;
    }
  }

  async handlePerfCommand(args) {
    console.log(color.yellow('\n📊 Performance Metrics'));
    
    const metrics = await this.memory.getContext('performance-metrics');
    if (metrics) {
      console.log(`  Response Time: ${metrics.responseTime}`);
      console.log(`  Memory Usage: ${metrics.memoryUsage}`);
      console.log(`  CPU Usage: ${metrics.cpuUsage}`);
    }
    
    // Queue performance test
    await this.createTask('performance-test', 'Full system performance test', 'medium');
  }

  async handleDocsCommand(args) {
    const type = args[0] || 'readme';
    
    console.log(color.yellow(`\n📚 Generating ${type} documentation...`));
    
    await this.createTask('documentation', `Generate ${type} docs`, 'low');
  }

  async executeShell(command) {
    try {
      const { stdout, stderr } = await execPromise(command);
      if (stdout) console.log(stdout);
      if (stderr) console.error(color.red(stderr));
    } catch (error) {
      console.error(color.red(`Command failed: ${error.message}`));
    }
  }

  showHelp() {
    console.log(color.cyan('\n📖 ASB Orchestrator Commands'));
    console.log(color.gray('=' .repeat(40)));
    
    const commands = [
      ['task create <type> <desc>', 'Create new task'],
      ['task list', 'List all tasks'],
      ['task assign <id> <agent>', 'Assign task to agent'],
      ['agent list', 'List active agents'],
      ['agent start <name>', 'Start an agent'],
      ['deploy <target>', 'Deploy to target'],
      ['test <type>', 'Run tests'],
      ['git <cmd>', 'Git operations'],
      ['n8n <cmd>', 'n8n operations'],
      ['code review <file>', 'Request code review'],
      ['perf', 'Show performance metrics'],
      ['docs <type>', 'Generate documentation'],
      ['status', 'Show dashboard'],
      ['help', 'Show this help'],
      ['quit', 'Exit orchestrator']
    ];
    
    commands.forEach(([cmd, desc]) => {
      console.log(`  ${color.cyan(cmd.padEnd(25))} ${color.gray(desc)}`);
    });
  }

  async startInteractiveMode() {
    await this.showDashboard();
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: color.cyan('\nASB> ')
    });
    
    rl.prompt();
    
    rl.on('line', async (line) => {
      const command = line.trim();
      
      if (command) {
        await this.executeCommand(command);
      }
      
      rl.prompt();
    });
    
    rl.on('close', async () => {
      await this.shutdown();
      process.exit(0);
    });
  }

  async shutdown() {
    console.log(color.yellow('\n👋 Shutting down orchestrator...'));
    
    // Save session data
    await this.memory.setContext('last-session', {
      sessionId: this.sessionId,
      endTime: new Date().toISOString()
    });
    
    await this.memory.disconnect();
    console.log(color.green('✓ Goodbye!'));
  }
}

// Main execution
async function main() {
  const orchestrator = new ASBOrchestrator();
  
  try {
    await orchestrator.initialize();
    
    // Check for command line arguments
    const args = process.argv.slice(2);
    
    if (args.length > 0) {
      // Execute single command
      await orchestrator.executeCommand(args.join(' '));
      await orchestrator.shutdown();
    } else {
      // Start interactive mode
      await orchestrator.startInteractiveMode();
    }
  } catch (error) {
    console.error(color.red('Fatal error:'), error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = ASBOrchestrator;
