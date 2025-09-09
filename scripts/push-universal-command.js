// Push the UNIVERSAL COMMAND to Redis and broadcast
const Redis = require('ioredis');

async function main() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const db = Number(process.env.REDIS_DB || 2);
  const password = process.env.REDIS_PASSWORD || undefined;

  const payload = {
    type: 'UNIVERSAL_COMMAND',
    command: 'START_SPRINT',
    time: '13:25',
    target: 'MVP COMPLETION TODAY',
    priority_execution_order: {
      codex: ['URLs', 'Health Pages', 'WebSocket'],
      claude: ['Tests', 'Redis Fix', 'RAG'],
      gemini: ['APIs', 'Docker', 'n8n']
    },
    shared_config: {
      PORT: 3002,
      REDIS_DB: 2,
      DATABASE: 'asemb@91.99.229.96',
      TEST_TABLE: 'rag_data'
    },
    success_metrics: {
      test_coverage_min: 70,
      all_apis_working: true,
      frontend_live: true,
      zero_critical_bugs: true
    },
    sync_points: ['14:00 - First Progress Report', '17:00 - Mid-Sprint Check', '20:00 - Final Status'],
    communication_keys: {
      blockers: 'asb:agent:blockers',
      progress_template: 'asb:agent:{yourname}:progress'
    },
    motivation: {
      current: { tests: 47, frontend: 30, backend: 70 },
      target: '100% MVP by EOD',
      method: 'PARALLEL EXECUTION',
      result: 'SHIP IT!'
    },
    message: 'ALL AGENTS - START YOUR ENGINES! Context is synced, tasks are clear, config is shared. Report at 14:00 sharp!'
  };

  const key = 'asb:command:all';
  const alias = 'asb:commands:universal:last';
  const channel = 'asb:broadcast';

  const redis = new Redis({ host, port, db, password });
  try {
    await redis.set(key, JSON.stringify(payload), 'EX', 86400);
    await redis.set(alias, JSON.stringify(payload), 'EX', 86400);
    await redis.publish(channel, JSON.stringify({ type: 'universal_command', key, command: payload.command }));
    console.log('Universal command pushed and broadcasted');
  } catch (e) {
    console.error('Redis push error:', e.message);
    process.exitCode = 1;
  } finally {
    redis.disconnect();
  }
}

main();

