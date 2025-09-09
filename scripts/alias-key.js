// Alias a Redis key: read source and write to destination (copy TTL if present)
const Redis = require('ioredis');

async function main() {
  const [src, dest, dbArg] = process.argv.slice(2);
  if (!src || !dest) {
    console.error('Usage: node scripts/alias-key.js <sourceKey> <destKey> [db=2]');
    process.exit(1);
  }
  const db = Number(dbArg || process.env.REDIS_DB || 2);
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD || undefined;

  const redis = new Redis({ host, port, password, db });
  try {
    const val = await redis.get(src);
    if (val == null) {
      console.error(`Source key not found in db ${db}: ${src}`);
      process.exit(2);
    }
    const ttl = await redis.ttl(src); // seconds, -1 no expire, -2 key does not exist
    await redis.set(dest, val);
    if (ttl > 0) {
      await redis.expire(dest, ttl);
    }
    console.log(`Aliased ${src} -> ${dest} (db ${db}, ttl=${ttl})`);
  } catch (e) {
    console.error('Redis alias error:', e.message);
    process.exit(1);
  } finally {
    redis.disconnect();
  }
}

main();

