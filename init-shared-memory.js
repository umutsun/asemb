// Initialize ASB Shared Memory for all agents
const ASBSharedMemory = require('./shared/asb-memory');

async function initializeSharedMemory() {
  console.log('🚀 Initializing Alice Semantic Bridge Shared Memory\n');
  console.log('=' .repeat(60));
  
  const memory = new ASBSharedMemory('alice-semantic-bridge');
  
  try {
    await memory.connect();
    
    // Clear old data
    console.log('\n🧹 Cleaning up old agent data...');
    const cleaned = await memory.cleanupInactiveAgents(0); // Clean all
    if (cleaned.length > 0) {
      console.log(`  Removed ${cleaned.length} inactive agents`);
    }
    
    // Set up initial project context
    console.log('\n📋 Setting up project context...');
    
    await memory.setContext('project', {
      name: 'Alice Semantic Bridge',
      version: '2.0.0',
      environment: 'development',
      status: 'active',
      components: {
        'n8n': 'http://91.99.229.96:5678',
        'redis': 'localhost:6379',
        'mysql': 'localhost:3306',
        'api': 'http://localhost:3000'
      }
    });
    console.log('  ✓ Project context set');
    
    await memory.setContext('mcp-servers', {
      'asb-cli': {
        status: 'active',
        commands: ['asb_project', 'asb_file', 'asb_exec'],
        path: 'C:\\mcp-servers\\asb-cli'
      },
      'notion': {
        status: 'active', 
        commands: ['notion-create-pages', 'notion-update-page'],
        path: 'configured'
      },
      'filesystem': {
        status: 'active',
        commands: ['read_file', 'write_file', 'list_directory'],
        path: 'configured'
      },
      'github': {
        status: 'active',
        commands: ['create_repository', 'push_files'],
        path: 'configured'
      },
      'n8n-mcp': {
        status: 'active',
        commands: ['n8n_create_workflow', 'n8n_trigger_webhook_workflow'],
        path: 'configured'
      }
    });
    console.log('  ✓ MCP servers configuration set');
    
    await memory.setContext('agent-roles', {
      claude: {
        role: 'CTO Agent',
        responsibilities: [
          'Architecture design',
          'Code review',
          'Documentation',
          'System integration'
        ]
      },
      gemini: {
        role: 'Performance Agent',
        responsibilities: [
          'Performance optimization',
          'Load testing',
          'Resource monitoring',
          'Caching strategies'
        ]
      },
      codex: {
        role: 'Generator Agent',
        responsibilities: [
          'Code generation',
          'Template creation',
          'Refactoring',
          'Automation scripts'
        ]
      }
    });
    console.log('  ✓ Agent roles defined');
    
    // Create initial task queues
    console.log('\n📝 Setting up task queues...');
    const taskTypes = [
      'code-review',
      'performance-test',
      'code-generation',
      'documentation',
      'integration-test'
    ];
    
    for (const taskType of taskTypes) {
      // Clear any existing tasks
      const existingTask = await memory.getNextTask(taskType);
      if (existingTask) {
        console.log(`  Cleared existing ${taskType} task`);
      }
    }
    console.log('  ✓ Task queues ready');
    
    // Get and display stats
    console.log('\n📊 System Status:');
    const stats = await memory.getStats();
    console.log(`  Project: ${stats.projectKey}`);
    console.log(`  Context Keys: ${stats.contextKeys}`);
    console.log(`  Active Agents: ${stats.activeAgents}`);
    console.log(`  Task Queues: ${Object.keys(stats.queues).length || 'None'}`);
    
    // Test message broadcasting
    console.log('\n📡 Testing broadcast system...');
    await memory.broadcast({
      type: 'system_ready',
      message: 'ASB Shared Memory initialized and ready for agents'
    });
    console.log('  ✓ Broadcast system operational');
    
    console.log('\n' + '=' .repeat(60));
    console.log('✅ Shared Memory Initialized Successfully!');
    console.log('\n💡 Agents can now connect using:');
    console.log('   const ASBSharedMemory = require("./shared/asb-memory");');
    console.log('   const memory = new ASBSharedMemory("alice-semantic-bridge");');
    console.log('   await memory.connect();');
    
    await memory.disconnect();
    
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  }
}

// Run initialization
initializeSharedMemory();
