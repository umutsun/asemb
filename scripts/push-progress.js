// Push Codex progress to Redis and publish an update event
const Redis = require('ioredis');

async function main() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const db = Number(process.env.REDIS_DB || 2);
  const password = process.env.REDIS_PASSWORD || undefined;

  const progress = {
    agent: 'codex',
    timestamp: new Date().toISOString(),
    status: 'working',
    current_task: {
      name: 'GraphVisualization.tsx with React Flow',
      progress: 0,
      blockers: [],
      notes: 'Initializing graph canvas and basic node/edge rendering.'
    },
    next_tasks: [
      'Add zoom/pan controls and GraphControls.tsx',
      'Wire socket events for realtime graph updates'
    ]
  };

  const key = 'codex-progress';
  const channel = 'asb:frontend:sync';

  const redis = new Redis({ host, port, db, password });
  try {
    await redis.set(key, JSON.stringify(progress), 'EX', 259200);
    await redis.publish(channel, JSON.stringify({ type: 'progress_update', agent: 'codex', key }));
    console.log('Progress pushed and event published');
  } catch (e) {
    console.error('Redis push error:', e.message);
    process.exitCode = 1;
  } finally {
    redis.disconnect();
  }
}

main();

