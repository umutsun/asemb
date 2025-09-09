// Scan Redis keys by pattern across DBs
const Redis = require('ioredis');

async function scanDb(db, pattern) {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD || undefined;
  const redis = new Redis({ host, port, password, db });
  const keys = [];
  let cursor = '0';
  do {
    const res = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
    cursor = res[0];
    keys.push(...res[1]);
  } while (cursor !== '0');
  await redis.quit();
  return keys;
}

async function main() {
  const pattern = process.argv[2] || '*';
  const dbs = [0, 2];
  for (const db of dbs) {
    try {
      const keys = await scanDb(db, pattern);
      console.log(`DB ${db} -> ${keys.length} keys`);
      keys.slice(0, 50).forEach((k) => console.log(`  ${k}`));
      if (keys.length > 50) console.log('  ...');
    } catch (e) {
      console.error(`DB ${db} scan error:`, e.message);
    }
  }
}

main();

