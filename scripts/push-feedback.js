// Push a consolidated feedback payload to Redis under key "feedback"
const Redis = require('ioredis');

async function main() {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const db = Number(process.env.REDIS_DB || 2);
  const password = process.env.REDIS_PASSWORD || undefined;

  const payload = {
    agent: 'codex',
    timestamp: new Date().toISOString(),
    status_summary: {
      backend: 'running (mocks), DB auth needs alignment',
      redis: 'running on 6379; shared memory uses DB 2',
      dashboard: 'present; some hardcoded URLs (3001) need env usage',
      tests: 'suite present; not executed in this session',
    },
    findings: [
      '- Postgres auth failed earlier (28P01). .env updated to local docker creds; ensure DB/user exists or revert to confirmed remote.',
      '- Port conflict on 3001; .env now uses PORT=3002. Some dashboard code hardcodes 3001 (BackendStatus.jsx).',
      '- Redis keys for coordination live in DB 2; server Redis client uses default DB (0). Align if server reads/writes keys.',
      '- LightRAG service queries rag_data.documents, but migrations define embeddings/chunks tables. Schema mismatch to resolve.',
      '- RAG service (rag.service.js) imports ../config/database and ../config/redis which are missing; likely not wired.',
      '- WebSocket client defaults to http://localhost:3002; server emits limited events (subscribe only). Consider emitting status/metrics.',
      '- Secrets in .env; ensure not committed and use .env.example for placeholders.',
      '- OpenAI models in code are older (gpt-3.5-turbo, text-embedding-ada-002); upgrade plan optional per architect.',
    ],
    immediate_actions: [
      { owner: 'codex', item: 'Replace hardcoded 3001 in BackendStatus.jsx with NEXT_PUBLIC_API_URL/NEXT_PUBLIC_WS_URL or api-client', status: 'pending' },
      { owner: 'codex', item: 'Implement Health/Status pages consuming /api/health and /api/backend/status with proper polling', status: 'in_progress' },
      { owner: 'claude_code', item: 'Decide DB config source of truth (DATABASE_URL vs POSTGRES_*); provide final .env.example', status: 'todo' },
      { owner: 'claude_code', item: 'Align LightRAG schema (rag_data.documents) with migrations or update queries', status: 'todo' },
      { owner: 'gemini', item: 'Backend endpoints for monitoring/metrics or adapt dashboard to existing routes', status: 'todo' },
      { owner: 'gemini', item: 'Run migrations on target DB and verify pgvector extension', status: 'todo' },
      { owner: 'all', item: 'Standardize Redis DB usage across services and CLI', status: 'todo' }
    ],
    notes: 'No architecture changes performed; Claude Code is the architect. All changes kept config-level and additive scripts.'
  };

  const key = 'feedback';
  const channel = 'asb:broadcast';

  const redis = new Redis({ host, port, db, password });
  try {
    await redis.set(key, JSON.stringify(payload), 'EX', 259200);
    await redis.publish(channel, JSON.stringify({ type: 'feedback_update', agent: 'codex', key }));
    console.log('Feedback pushed and broadcasted');
  } catch (e) {
    console.error('Redis push error:', e.message);
    process.exitCode = 1;
  } finally {
    redis.disconnect();
  }
}

main();

