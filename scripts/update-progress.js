// Update codex-progress with a partial completion note
const Redis = require('ioredis');

async function main() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const db = Number(process.env.REDIS_DB || 2);
  const password = process.env.REDIS_PASSWORD || undefined;

  const key = 'codex-progress';
  const redis = new Redis({ host, port, db, password });
  try {
    const cur = await redis.get(key);
    const now = new Date().toISOString();
    let obj = cur ? JSON.parse(cur) : { agent: 'codex', timestamp: now };
    obj.timestamp = now;
    obj.status = 'working';
    obj.current_task = {
      name: 'URLs → Health Pages → WebSocket',
      progress: 40,
      blockers: [],
      notes: 'Replaced hardcoded URLs in BackendStatus.jsx; added /pages/health with polling to /api/health.'
    };
    obj.completed = (obj.completed || []).concat([
      'Replace hardcoded 3001 with NEXT_PUBLIC_API_URL (BackendStatus.jsx)',
      'Add health page with polling'
    ]);
    obj.next_tasks = [
      'Wire WebSocket client for backend status updates via socket.io',
      'Implement Status page polish and tests'
    ];
    await redis.set(key, JSON.stringify(obj), 'EX', 259200);
    await redis.publish('asb:frontend:sync', JSON.stringify({ type: 'progress_update', agent: 'codex', key }));
    console.log('Progress updated');
  } catch (e) {
    console.error('Redis update error:', e.message);
    process.exitCode = 1;
  } finally {
    redis.disconnect();
  }
}

main();

