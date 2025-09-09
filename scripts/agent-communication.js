// Agent Communication via Redis
const Redis = require('redis');
const { promisify } = require('util');

class AgentCommunication {
  constructor(agentName) {
    this.agentName = agentName;
    this.projectKey = process.env.PROJECT_KEY || 'alice-semantic-bridge';
    this.redisClient = Redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      db: process.env.REDIS_DB || 0, // default to DB 0 for Codex
      password: process.env.REDIS_PASSWORD
    });

    // Promisify Redis methods
    this.get = promisify(this.redisClient.get).bind(this.redisClient);
    this.set = promisify(this.redisClient.set).bind(this.redisClient);
    this.publish = promisify(this.redisClient.publish).bind(this.redisClient);
    this.subscribe = this.redisClient.subscribe.bind(this.redisClient);
    this.on = this.redisClient.on.bind(this.redisClient);
    
    this.setupListeners();
  }

  setupListeners() {
    // Subscribe to agent-specific channel
    this.subscribe(`${this.projectKey}:agent:${this.agentName}`);
    this.subscribe(`${this.projectKey}:broadcast`);

    // Handle incoming messages
    this.on('message', (channel, message) => {
      try {
        const data = JSON.parse(message);
        this.handleMessage(channel, data);
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    });
  }

  async handleMessage(channel, data) {
    console.log(`[${this.agentName}] Received on ${channel}:`, data);
    
    // Handle different message types
    switch (data.type) {
      case 'task':
        await this.handleTask(data);
        break;
      case 'query':
        await this.handleQuery(data);
        break;
      case 'status':
        await this.reportStatus();
        break;
      default:
        console.log(`Unknown message type: ${data.type}`);
    }
  }

  async handleTask(task) {
    console.log(`[${this.agentName}] Processing task:`, task.name);
    
    // Update status
    await this.updateStatus('busy', task.name);
    
    // Simulate task processing
    setTimeout(async () => {
      await this.updateStatus('idle');
      await this.sendMessage(task.sender, {
        type: 'task-complete',
        taskId: task.id,
        result: `Task ${task.name} completed by ${this.agentName}`
      });
    }, 3000);
  }

  async handleQuery(query) {
    console.log(`[${this.agentName}] Handling query:`, query.question);
    
    // Respond to query
    await this.sendMessage(query.sender, {
      type: 'query-response',
      queryId: query.id,
      answer: `Response from ${this.agentName}: ${query.question}`
    });
  }

  async sendMessage(recipient, message) {
    const channel = recipient === 'broadcast' 
      ? `${this.projectKey}:broadcast`
      : `${this.projectKey}:agent:${recipient}`;
    
    const payload = {
      ...message,
      sender: this.agentName,
      timestamp: new Date().toISOString()
    };
    
    await this.publish(channel, JSON.stringify(payload));
    console.log(`[${this.agentName}] Sent to ${channel}:`, payload);
  }

  async updateStatus(status, currentTask = null) {
    const statusKey = `${this.projectKey}:agent:${this.agentName}:status`;
    const statusData = {
      status,
      currentTask,
      lastUpdate: new Date().toISOString(),
      memory: process.memoryUsage().heapUsed / 1024 / 1024, // MB
      uptime: process.uptime()
    };
    
    await this.set(statusKey, JSON.stringify(statusData));
    
    // Broadcast status update
    await this.sendMessage('broadcast', {
      type: 'status-update',
      agent: this.agentName,
      ...statusData
    });
  }

  async reportStatus() {
    const statusKey = `${this.projectKey}:agent:${this.agentName}:status`;
    const status = await this.get(statusKey);
    
    if (status) {
      console.log(`[${this.agentName}] Current status:`, JSON.parse(status));
    } else {
      await this.updateStatus('idle');
    }
  }

  async getSharedMemory(key) {
    const memKey = `${this.projectKey}:memory:${key}`;
    const data = await this.get(memKey);
    return data ? JSON.parse(data) : null;
  }

  async setSharedMemory(key, value, ttl = 3600) {
    const memKey = `${this.projectKey}:memory:${key}`;
    await this.set(memKey, JSON.stringify(value), 'EX', ttl);
  }

  // Test communication
  async testCommunication() {
    console.log(`[${this.agentName}] Testing communication...`);
    
    // Send test message to all agents
    await this.sendMessage('broadcast', {
      type: 'test',
      message: `Hello from ${this.agentName}!`
    });
    
    // Update status
    await this.updateStatus('active', 'Testing communication');
    
    // Set shared memory
    await this.setSharedMemory('test-data', {
      agent: this.agentName,
      timestamp: new Date().toISOString(),
      data: 'Test shared memory data'
    });
    
    console.log(`[${this.agentName}] Communication test complete!`);
  }

  close() {
    this.redisClient.quit();
  }
}

// Export for use in MCP servers
module.exports = AgentCommunication;

// If run directly, start test mode
if (require.main === module) {
  const agentName = process.argv[2] || 'test-agent';
  const agent = new AgentCommunication(agentName);
  
  console.log(`Starting ${agentName}...`);
  
  // Test communication every 5 seconds
  setInterval(() => {
    agent.testCommunication();
  }, 5000);
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log(`\nShutting down ${agentName}...`);
    agent.close();
    process.exit(0);
  });
}
