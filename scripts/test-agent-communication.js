// Test Agent Communication via Redis
const Redis = require('redis');
const { promisify } = require('util');

// Test configuration
const PROJECT_KEY = 'alice-semantic-bridge';
const REDIS_CONFIG = {
  host: 'localhost',
  port: 6379,
  db: 2
};

// Create Redis client
const redisClient = Redis.createClient(REDIS_CONFIG);
const get = promisify(redisClient.get).bind(redisClient);
const keys = promisify(redisClient.keys).bind(redisClient);

async function testAgentCommunication() {
  console.log('\n🔍 Testing Agent Communication System\n');
  console.log('=' .repeat(50));
  
  // 1. Check agent statuses
  console.log('\n📊 Agent Status Check:');
  const agents = ['claude', 'gemini', 'codex'];
  
  for (const agent of agents) {
    const statusKey = `${PROJECT_KEY}:agent:${agent}:status`;
    const status = await get(statusKey);
    
    if (status) {
      const data = JSON.parse(status);
      console.log(`\n✅ ${agent.toUpperCase()}:`);
      console.log(`   Status: ${data.status}`);
      console.log(`   Last Update: ${data.timestamp}`);
      if (data.memory) {
        console.log(`   Memory: ${Math.round(data.memory.heapUsed / 1024 / 1024)}MB`);
      }
    } else {
      console.log(`\n❌ ${agent.toUpperCase()}: OFFLINE`);
    }
  }
  
  // 2. Check shared data
  console.log('\n\n💾 Shared Data:');
  const sharedKeys = await keys(`${PROJECT_KEY}:shared:*`);
  
  if (sharedKeys.length > 0) {
    for (const key of sharedKeys) {
      const data = await get(key);
      if (data) {
        const parsed = JSON.parse(data);
        console.log(`\n📦 ${key}:`);
        console.log(`   From: ${parsed.agent}`);
        console.log(`   Time: ${parsed.timestamp}`);
        console.log(`   Data:`, parsed.data);
      }
    }
  } else {
    console.log('   No shared data found');
  }
  
  // 3. Check activity logs
  console.log('\n\n📜 Recent Activity:');
  for (const agent of agents) {
    const logKey = `${PROJECT_KEY}:logs:${agent}`;
    const logs = await redisClient.lrange(logKey, 0, 2); // Get last 3 entries
    
    if (logs && logs.length > 0) {
      console.log(`\n${agent.toUpperCase()}:`);
      logs.forEach(log => {
        const entry = JSON.parse(log);
        console.log(`   [${entry.timestamp}] ${entry.action}`);
      });
    }
  }
  
  // 4. Test publishing a message
  console.log('\n\n📡 Broadcasting Test Message...');
  redisClient.publish(`${PROJECT_KEY}:broadcast`, JSON.stringify({
    type: 'test',
    from: 'test-script',
    message: 'Testing agent communication system',
    timestamp: new Date().toISOString()
  }));
  
  console.log('\n' + '=' .repeat(50));
  console.log('\n✅ Communication test complete!\n');
  
  // Subscribe to monitor messages
  console.log('📻 Monitoring messages (press Ctrl+C to exit)...\n');
  
  const monitor = Redis.createClient(REDIS_CONFIG);
  monitor.subscribe(`${PROJECT_KEY}:broadcast`);
  monitor.subscribe(`${PROJECT_KEY}:agent:claude`);
  monitor.subscribe(`${PROJECT_KEY}:agent:gemini`);
  monitor.subscribe(`${PROJECT_KEY}:agent:codex`);
  
  monitor.on('message', (channel, message) => {
    try {
      const data = JSON.parse(message);
      console.log(`[${new Date().toLocaleTimeString()}] ${channel}:`);
      console.log('  ', data);
    } catch (e) {
      console.log(`[${new Date().toLocaleTimeString()}] ${channel}: ${message}`);
    }
  });
}

// Run test
testAgentCommunication().catch(console.error);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nShutting down...');
  redisClient.quit();
  process.exit(0);
});