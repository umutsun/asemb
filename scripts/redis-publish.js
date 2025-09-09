// Publish a JSON message to a Redis channel
const Redis = require('ioredis');

async function main() {
  const [channel, type, key, dbArg] = process.argv.slice(2);
  if (!channel || !type) {
    console.error('Usage: node scripts/redis-publish.js <channel> <type> [key] [db=2]');
    process.exit(1);
  }
  const db = Number(dbArg || process.env.REDIS_DB || 2);
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD || undefined;

  const message = {
    type,
    key: key || undefined,
    agent: 'codex',
    timestamp: new Date().toISOString(),
  };

  const redis = new Redis({ host, port, password, db });
  try {
    const result = await redis.publish(channel, JSON.stringify(message));
    console.log(`Published to ${channel} (subscribers: ${result})`);
  } catch (e) {
    console.error('Redis publish error:', e.message);
    process.exit(1);
  } finally {
    redis.disconnect();
  }
}

main();

