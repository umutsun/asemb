// Push an update event to Redis and publish a notification
const Redis = require('ioredis');

async function main() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const db = Number(process.env.REDIS_DB || 2);
  const password = process.env.REDIS_PASSWORD || undefined;

  const payload = {
    event: 'config_update',
    agent: 'codex',
    timestamp: new Date().toISOString(),
    changes: [
      {
        file: '.env',
        updates: [
          'DATABASE_URL -> postgresql://asemb_user:asemb_password@localhost:5432/asemb',
          'REDIS_DB=2',
          'PORT=3002'
        ]
      },
      {
        file: 'tools/asb-cli/asb.config.json',
        updates: ['redis.db -> 2', 'mcp.server.port -> 3002']
      },
      {
        files_added: ['scripts/get-context.js', 'scripts/scan-keys.js'],
        note: 'Non-invasive helper scripts; no architecture changes.'
      }
    ],
    notes: 'Kept existing structure; Claude Code is architect.'
  };

  const key = 'asb:agent:codex:latest_update';
  const channel = 'asb:events';

  const redis = new Redis({ host, port, db, password });
  try {
    await redis.set(key, JSON.stringify(payload), 'EX', 259200);
    await redis.publish(channel, JSON.stringify({ type: 'config_update', agent: 'codex', key }));
    console.log('Context pushed and event published');
  } catch (e) {
    console.error('Redis push error:', e.message);
    process.exitCode = 1;
  } finally {
    redis.disconnect();
  }
}

main();

