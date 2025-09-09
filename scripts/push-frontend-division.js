// Push frontend division plan to Redis and publish an event
const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');

async function main() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const db = Number(process.env.REDIS_DB || 2);
  const password = process.env.REDIS_PASSWORD || undefined;

  const docPath = path.join(process.cwd(), 'FRONTEND_TASK_DIVISION.md');
  const doc = fs.readFileSync(docPath, 'utf8');

  const payload = {
    event: 'frontend_division',
    agent_owner: 'claude-code',
    agent_implementer: 'codex-cli',
    timestamp: new Date().toISOString(),
    doc_file: 'FRONTEND_TASK_DIVISION.md',
    summary: 'Frontend görev paylaşımı oluşturuldu; her iki ajan başlayabilir.',
  };

  const key = 'frontend-division-claude-codex';
  const channel = 'asb:events';

  const redis = new Redis({ host, port, db, password });
  try {
    await redis.set(key, JSON.stringify({ meta: payload, doc }), 'EX', 259200);
    await redis.publish(channel, JSON.stringify({ type: 'frontend_division', key, agents: ['claude-code','codex-cli'] }));
    console.log('Frontend division pushed and event published');
  } catch (e) {
    console.error('Redis push error:', e.message);
    process.exitCode = 1;
  } finally {
    redis.disconnect();
  }
}

main();

