#!/usr/bin/env node

/**
 * Update Agent Roles to v2.1 - Without Codex, DeepSeek for small tasks only
 */

const ASBSharedMemory = require('./shared/asb-memory');

async function updateAgentRoles() {
  console.log('🔄 Updating Agent Roles to v2.1 (Adjusted Team)...\n');
  
  const memory = new ASBSharedMemory('alice-semantic-bridge');
  
  try {
    await memory.connect();
    console.log('✅ Connected to shared memory\n');
    
    // Define adjusted roles (without Codex, DeepSeek minimal)
    const agentRoles = {
      claude: {
        title: 'CTO & System Architect',
        role: 'Technical Leadership & Architecture',
        status: 'ACTIVE',
        workload: 'HIGH',
        responsibilities: [
          'System architecture design',
          'Code review and quality assurance',
          'API design and documentation',
          'Security and best practices',
          'Technical debt management',
          'Infrastructure decisions',
          'Agent coordination'
        ],
        capabilities: [
          'architecture-design',
          'code-review',
          'documentation',
          'security-audit',
          'api-design',
          'infrastructure-planning',
          'coordination'
        ]
      },
      gemini: {
        title: 'Senior Full-Stack Developer + DevOps',
        role: 'Implementation, Testing & Deployment',
        status: 'CONFIGURING',
        workload: 'VERY HIGH',
        responsibilities: [
          'Full-stack development',
          'Feature implementation',
          'Code optimization',
          'Testing strategies',
          'Deployment (covering for Codex)',
          'CI/CD setup (covering for Codex)',
          'Performance monitoring',
          'Build processes'
        ],
        capabilities: [
          'frontend-development',
          'backend-development',
          'database-design',
          'testing',
          'optimization',
          'deployment',
          'ci-cd',
          'monitoring'
        ]
      },
      codex: {
        title: 'DevOps & Automation Engineer',
        role: 'NOT AVAILABLE',
        status: 'OFFLINE',
        workload: 'NONE',
        responsibilities: [
          '(Tasks redistributed to Gemini and Claude)'
        ],
        capabilities: []
      },
      deepseek: {
        title: 'AI Assistant - Support Role',
        role: 'Small Tasks & Documentation Only',
        status: 'STANDBY',
        workload: 'MINIMAL',
        maxWorkloadPercent: 10,
        responsibilities: [
          'Documentation updates only',
          'README maintenance',
          'Code comments and JSDoc',
          'Simple file operations',
          'Data formatting',
          'Configuration file updates',
          'Test data generation'
        ],
        capabilities: [
          'documentation',
          'file-operations',
          'data-formatting',
          'comments'
        ],
        restrictions: [
          'NO critical tasks',
          'NO architecture decisions',
          'NO deployment tasks',
          'NO security tasks',
          'Only activated for specific small tasks'
        ]
      }
    };
    
    // Update agent roles in shared memory
    console.log('📝 Updating agent roles...\n');
    await memory.setContext('agent-roles-v2.1', agentRoles);
    
    // Update individual agent contexts
    for (const [agentName, roleInfo] of Object.entries(agentRoles)) {
      await memory.setContext(`agent:${agentName}:role`, roleInfo);
      console.log(`${roleInfo.status === 'ACTIVE' ? '✅' : roleInfo.status === 'OFFLINE' ? '❌' : '🔧'} ${agentName}:`);
      console.log(`   Title: ${roleInfo.title}`);
      console.log(`   Status: ${roleInfo.status}`);
      console.log(`   Workload: ${roleInfo.workload}`);
      if (roleInfo.maxWorkloadPercent) {
        console.log(`   Max Workload: ${roleInfo.maxWorkloadPercent}%`);
      }
      console.log(`   Capabilities: ${roleInfo.capabilities.length || 0} defined\n`);
    }
    
    // Create adjusted collaboration matrix
    const collaborationMatrix = {
      'architecture-design': {
        primary: 'claude',
        secondary: null,
        reviewer: null
      },
      'api-development': {
        primary: 'gemini',
        secondary: 'claude',
        reviewer: 'claude'
      },
      'frontend-development': {
        primary: 'gemini',
        secondary: null,
        reviewer: 'claude'
      },
      'backend-development': {
        primary: 'gemini',
        secondary: 'claude',
        reviewer: 'claude'
      },
      'deployment': {
        primary: 'gemini', // Covering for Codex
        secondary: 'claude',
        reviewer: 'claude'
      },
      'ci-cd': {
        primary: 'gemini', // Covering for Codex
        secondary: 'claude',
        reviewer: null
      },
      'monitoring': {
        primary: 'gemini', // Covering for Codex
        secondary: null,
        reviewer: 'claude'
      },
      'documentation': {
        primary: 'deepseek', // Only for small docs
        secondary: 'claude',
        reviewer: 'claude'
      },
      'small-tasks': {
        primary: 'deepseek',
        secondary: null,
        reviewer: null
      }
    };
    
    await memory.setContext('collaboration-matrix-v2.1', collaborationMatrix);
    console.log('✅ Updated collaboration matrix (adjusted for missing Codex)\n');
    
    // Set task priority rules
    const taskPriorityRules = {
      high_priority: {
        agents: ['claude', 'gemini'],
        task_types: [
          'architecture-design',
          'implementation',
          'code-review',
          'testing',
          'deployment',
          'security',
          'api-development'
        ]
      },
      low_priority: {
        agents: ['deepseek'],
        task_types: [
          'documentation',
          'formatting',
          'comments',
          'test-data',
          'config-updates'
        ],
        max_percentage: 10
      }
    };
    
    await memory.setContext('task-priority-rules', taskPriorityRules);
    console.log('✅ Set task priority rules (DeepSeek limited to 10%)\n');
    
    // Broadcast role update to all agents
    await memory.broadcast({
      type: 'role_update',
      version: '2.1',
      message: 'Agent roles updated: Codex unavailable, DeepSeek limited to small tasks',
      changes: [
        'Codex marked as OFFLINE',
        'Gemini covering DevOps tasks',
        'DeepSeek limited to 10% workload',
        'Claude coordinating all agents'
      ],
      timestamp: new Date().toISOString()
    });
    
    console.log('📢 Broadcast role update to all agents\n');
    
    // Display summary
    const stats = await memory.getStats();
    console.log('📊 Summary:');
    console.log(`   Active agents: 2 (Claude, Gemini configuring)`);
    console.log(`   Standby agents: 1 (DeepSeek)`);
    console.log(`   Offline agents: 1 (Codex)`);
    console.log(`   Context keys: ${stats.contextKeys}`);
    
    console.log('\n✨ Agent roles successfully updated to v2.1!');
    console.log('\n🎭 Current Team Status:');
    console.log('   ✅ Claude   → CTO & System Architect (ACTIVE)');
    console.log('   🔧 Gemini   → Senior Dev + DevOps (CONFIGURING)');
    console.log('   ❌ Codex    → Not Available (OFFLINE)');
    console.log('   💤 DeepSeek → Support only, max 10% tasks (STANDBY)');
    
    console.log('\n⚠️  Important:');
    console.log('   - Gemini is covering DevOps tasks');
    console.log('   - DeepSeek only for small documentation tasks');
    console.log('   - Install Codex CLI when available');
    
    await memory.disconnect();
    
  } catch (error) {
    console.error('❌ Error updating roles:', error);
    process.exit(1);
  }
}

// Run the update
updateAgentRoles();
