#!/usr/bin/env node
/**
 * RAG Migration Script
 * - Connects to Postgres and migrates chunk/text data into the `embeddings` table.
 * - Publishes progress to Redis DB 0 under keys prefixed with `asb:codex:`.
 *
 * Env vars (optional):
 * - PG_URL or PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD
 * - REDIS_HOST (default: localhost)
 * - REDIS_PORT (default: 6379)
 * - REDIS_DB   (default: 0)
 * - REDIS_PASSWORD (optional)
 */

const { Pool } = require('pg');
const crypto = require('crypto');
const Redis = require('redis');

// ---- Redis (DB 0 by default) ----
function createRedis() {
  const host = process.env.REDIS_HOST || 'localhost';
  const port = Number(process.env.REDIS_PORT || 6379);
  const db = Number(process.env.REDIS_DB || 0); // DB 0 as requested
  const password = process.env.REDIS_PASSWORD || undefined;

  const client = Redis.createClient({ host, port, db, password });
  client.on('error', (err) => console.error('[migration] Redis error:', err));

  // Promisify minimal commands we need
  const { promisify } = require('util');
  return {
    raw: client,
    get: promisify(client.get).bind(client),
    set: promisify(client.set).bind(client),
    setex: promisify(client.setex).bind(client),
    del: promisify(client.del).bind(client),
    quit: () => client.quit(),
  };
}

// ---- Postgres ----
function createPgPool() {
  const url = process.env.PG_URL;
  if (url) return new Pool({ connectionString: url });
  return new Pool({
    host: process.env.PGHOST || 'localhost',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'postgres',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
    ssl: process.env.PGSSL ? { rejectUnauthorized: false } : undefined,
  });
}

// ---- Helpers ----
async function tableExists(client, table) {
  const res = await client.query(
    `SELECT to_regclass($1) AS t`,
    [table],
  );
  return Boolean(res.rows[0]?.t);
}

async function ensureEmbeddingsSchema(client) {
  // Minimal schema, aligned with database/schema.sql
  await client.query('BEGIN');
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    await client.query('CREATE EXTENSION IF NOT EXISTS "vector"');

    await client.query(`
      CREATE TABLE IF NOT EXISTS sources (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        config JSONB NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        last_sync_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        source_id UUID NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        content_hash VARCHAR(64) NOT NULL,
        embedding vector(1536) NOT NULL,
        token_count INTEGER,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Indexes
    await client.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_embeddings_content_hash ON embeddings(content_hash)'
    );
    await client.query(
      'CREATE INDEX IF NOT EXISTS idx_embeddings_source_id ON embeddings(source_id)'
    );
    await client.query(
      "CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

// Try to infer a source table and columns
async function detectSourceShape(client) {
  // Common legacy shapes we may migrate from
  const candidates = [
    { table: 'chunks', textCols: ['content', 'text', 'body'], srcCols: ['source_id', 'document_id'], embedCols: ['embedding'] },
    { table: 'documents_chunks', textCols: ['content', 'text'], srcCols: ['document_id'], embedCols: ['embedding'] },
    { table: 'old_embeddings', textCols: ['content', 'text'], srcCols: ['source_id', 'document_id'], embedCols: ['embedding'] },
  ];

  for (const c of candidates) {
    if (!(await tableExists(client, c.table))) continue;
    const colsRes = await client.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1`,
      [c.table]
    );
    const cols = colsRes.rows.map((r) => r.column_name);
    const textCol = c.textCols.find((x) => cols.includes(x));
    const srcCol = c.srcCols.find((x) => cols.includes(x)) || null;
    const embedCol = c.embedCols.find((x) => cols.includes(x)) || null;
    if (textCol) {
      return { table: c.table, textCol, srcCol, embedCol };
    }
  }
  return null;
}

async function upsertSource(client, name, type = 'text', config = {}) {
  // Try find existing by name; otherwise insert
  const sel = await client.query(
    'SELECT id FROM sources WHERE name = $1 LIMIT 1',
    [name]
  );
  if (sel.rows[0]?.id) return sel.rows[0].id;
  const ins = await client.query(
    'INSERT INTO sources(name, type, config) VALUES ($1, $2, $3) RETURNING id',
    [name, type, config]
  );
  return ins.rows[0].id;
}

async function migrateBatch(client, rows, shape, sourceId) {
  const values = [];
  const placeholders = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const content = r[shape.textCol];
    if (!content || typeof content !== 'string') continue;
    const contentHash = sha256Hex(content);
    // embedding: either present or zero-vector placeholder
    let embedding = r[shape.embedCol];
    if (Array.isArray(embedding)) {
      // ok
    } else if (typeof embedding === 'string') {
      try { embedding = JSON.parse(embedding); } catch { embedding = null; }
    }
    if (!Array.isArray(embedding)) {
      // 1536-d zero vector placeholder; replace later via backfill job
      embedding = new Array(1536).fill(0);
    }

    const metadata = {
      migrated_from: shape.table,
      original_source_id: shape.srcCol ? r[shape.srcCol] : null,
    };

    const base = i * 6;
    placeholders.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`);
    values.push(sourceId, content, contentHash, embedding, null, metadata);
  }

  if (!values.length) return { inserted: 0 };

  const sql = `
    INSERT INTO embeddings (source_id, content, content_hash, embedding, token_count, metadata)
    VALUES ${placeholders.join(',\n')}
    ON CONFLICT (content_hash) DO NOTHING
  `;
  const res = await client.query(sql, values);
  return { inserted: res.rowCount || 0 };
}

async function main() {
  const redis = createRedis();
  const pool = createPgPool();
  const client = await pool.connect();
  const taskKey = 'asb:codex:tasks:current';
  const cmdKey = 'asb:codex:migration:commands';
  const scriptKey = 'asb:codex:migration:script';

  try {
    await redis.set(taskKey, JSON.stringify({ status: 'starting', ts: new Date().toISOString() }));
    await redis.set(cmdKey, JSON.stringify({ action: 'migrate', db: 0, note: 'RAG migration started' }));
    await redis.set(scriptKey, 'scripts/migrate-rag-data.js');

    await ensureEmbeddingsSchema(client);

    const shape = await detectSourceShape(client);
    if (!shape) {
      await redis.set(taskKey, JSON.stringify({ status: 'idle', message: 'No known source table found', ts: new Date().toISOString() }));
      console.log('[migration] No source table found (tried chunks/documents_chunks/old_embeddings).');
      return;
    }

    console.log('[migration] Detected source:', shape);
    await redis.set(taskKey, JSON.stringify({ status: 'running', stage: 'detected_source', shape, ts: new Date().toISOString() }));

    // Prepare a synthetic/aggregated source row in `sources`
    const sourceName = `migration:${shape.table}`;
    const sourceId = await upsertSource(client, sourceName, 'migration', { table: shape.table });

    // Count rows
    const countRes = await client.query(`SELECT COUNT(*)::int AS c FROM ${shape.table}`);
    const total = countRes.rows[0].c || 0;
    console.log(`[migration] Rows to process from ${shape.table}:`, total);
    await redis.set(taskKey, JSON.stringify({ status: 'running', stage: 'counted', total, ts: new Date().toISOString() }));

    const batchSize = Number(process.env.MIGRATION_BATCH_SIZE || 500);
    let processed = 0;
    let insertedTotal = 0;

    for (let offset = 0; offset < total; offset += batchSize) {
      const q = `SELECT * FROM ${shape.table} ORDER BY 1 OFFSET $1 LIMIT $2`;
      const { rows } = await client.query(q, [offset, batchSize]);
      const { inserted } = await migrateBatch(client, rows, shape, sourceId);
      processed += rows.length;
      insertedTotal += inserted;
      const pct = total ? Math.min(100, Math.round((processed / total) * 100)) : 100;
      await redis.set(taskKey, JSON.stringify({ status: 'running', stage: 'batch', processed, insertedTotal, total, progress: pct, ts: new Date().toISOString() }));
      console.log(`[migration] Batch done. processed=${processed}/${total} inserted=${insertedTotal}`);
    }

    await redis.set(taskKey, JSON.stringify({ status: 'done', processed, insertedTotal, total, ts: new Date().toISOString() }));
    console.log('[migration] Completed. inserted:', insertedTotal, 'of', total);
  } catch (err) {
    console.error('[migration] Error:', err);
    await redis.set(taskKey, JSON.stringify({ status: 'error', error: String(err?.message || err), ts: new Date().toISOString() }));
    process.exitCode = 1;
  } finally {
    try { await redis.quit(); } catch {}
    try { client.release(); } catch {}
    try { await pool.end(); } catch {}
  }
}

if (require.main === module) {
  main();
}

