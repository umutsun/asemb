// Seed default settings FROM the typed settings registry (single source of truth).
//
// Registry: backend/src/config/settings-registry.ts. Only keys that declare a `default`
// and are not `runtime` telemetry are seeded — secrets (apiKey/password/...) have no
// default and are intentionally NOT seeded (set them in the Settings UI, Hard Rule #1).
//
// Idempotent: ON CONFLICT (key) DO NOTHING, so admin-tuned values are never clobbered.
// No hardcoded credentials — the connection comes from env only (.env.lsemb).

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env.lsemb') });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
// Compile-on-require the TypeScript registry so this stays the single source of truth.
require('ts-node/register');
const { Pool } = require('pg');
const { SETTINGS, serialize } = require('../src/config/settings-registry');

function buildConnectionConfig() {
  if (process.env.DATABASE_URL) return { connectionString: process.env.DATABASE_URL };
  const host = process.env.POSTGRES_HOST;
  const password = process.env.POSTGRES_PASSWORD;
  if (!host || password === undefined) {
    console.error(
      '❌ No database connection configured. Set DATABASE_URL or ' +
        'POSTGRES_HOST/PORT/DB/USER/PASSWORD in .env.lsemb.'
    );
    process.exit(1);
  }
  return {
    host,
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'lsemb',
    user: process.env.POSTGRES_USER || 'postgres',
    password,
  };
}

async function seedSettings() {
  const pool = new Pool(buildConnectionConfig());
  try {
    console.log('Seeding default settings from the registry...');

    // The canonical schema also lives in migrations; create-if-absent keeps a fresh DB working.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id SERIAL PRIMARY KEY,
        key VARCHAR(255) UNIQUE NOT NULL,
        value TEXT,
        category VARCHAR(255) DEFAULT 'general',
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const seedable = SETTINGS.filter((def) => def.default !== undefined && !def.runtime);
    let inserted = 0;
    for (const def of seedable) {
      const result = await pool.query(
        `INSERT INTO settings (key, value, category, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (key) DO NOTHING`,
        [def.key, serialize(def.default), def.category, def.description]
      );
      inserted += result.rowCount || 0;
    }

    console.log(
      `✅ Seed complete. ${seedable.length} default keys processed, ` +
        `${inserted} newly inserted (existing values left untouched).`
    );
  } catch (error) {
    console.error('❌ Error seeding settings:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seedSettings();
