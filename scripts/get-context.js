// Simple Redis context getter: node scripts/get-context.js <key> [db]
const Redis = require('ioredis');

async function main() {
  const key = process.argv[2] || 'codex-cli-tasks';
  const db = Number(process.argv[3] || process.env.REDIS_DB || 2);
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD || undefined;

  const redis = new Redis({ host, port, password, db });
  try {
    const pong = await redis.ping();
    if (pong !== 'PONG') throw new Error('Redis not responding');
    const val = await redis.get(key);
    if (val == null) {
      console.log(`Key not found in db ${db}: ${key}`);
    } else {
      try {
        const parsed = JSON.parse(val);
        console.log(JSON.stringify(parsed, null, 2));
      } catch {
        console.log(val);
      }
    }
  } catch (e) {
    console.error('Redis error:', e.message);
    process.exitCode = 1;
  } finally {
    redis.disconnect();
  }
}

main();

