const Redis = require('ioredis');
const logger = require('./utils').logger;

// Redis connection configuration with robust error handling
const redisConfig = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
  db: process.env.REDIS_DB || 2,
  
  // Connection timeout in milliseconds
  connectTimeout: process.env.REDIS_CONNECT_TIMEOUT || 10000,
  
  // Command timeout in milliseconds
  commandTimeout: process.env.REDIS_COMMAND_TIMEOUT || 5000,
  
  // Enable keep-alive functionality
  keepAlive: process.env.REDIS_KEEP_ALIVE !== 'false', // default true
  
  // Retry strategy for connection failures
  retryStrategy: (times) => {
    const delay = Math.min(times * 100, 3000);
    logger.warn(`Redis connection attempt ${times}, retrying in ${delay}ms`);
    return delay;
  },
  
  // Reconnect on specific errors
  reconnectOnError: (err) => {
    const errorMessage = err.message.toLowerCase();
    return errorMessage.includes('readonly') || 
           errorMessage.includes('econnreset') || 
           errorMessage.includes('etimedout') ||
           errorMessage.includes('connection reset') ||
           errorMessage.includes('socket closed');
  },
  
  // Maximum retry attempts per request
  maxRetriesPerRequest: process.env.REDIS_MAX_RETRIES || 3,
  
  // Enable auto-reconnection
  enableAutoPipelining: true,
  autoResendUnfulfilledCommands: true
};

const redis = new Redis(redisConfig);

// Health check function
redis.healthCheck = async () => {
  try {
    const start = Date.now();
    await redis.ping();
    const latency = Date.now() - start;
    logger.info(`Redis health check: OK, latency: ${latency}ms`);
    return { status: 'healthy', latency };
  } catch (error) {
    logger.error(`Redis health check failed: ${error.message}`);
    return { status: 'unhealthy', error: error.message };
  }
};

// Error event handling
redis.on('error', (error) => {
  logger.error(`Redis error: ${error.message}`, { 
    code: error.code, 
    stack: error.stack 
  });
});

redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

redis.on('ready', () => {
  logger.info('Redis is ready to accept commands');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', (ms) => {
  logger.warn(`Redis reconnecting in ${ms}ms`);
});

// Periodic health check (every 30 seconds)
setInterval(() => {
  redis.healthCheck().catch(() => {
    // Error already logged in healthCheck
  });
}, 30000);

module.exports = redis;
