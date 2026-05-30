/**
 * Knex configuration — WS4-B (Redis Iris alignment).
 *
 * Why this exists: until now every schema change was a raw `.sql` file applied
 * by hand with `psql` (see database/migrations/*.sql and that dir's README).
 * That has no ordering guarantee, no rollback, and no record of what ran.
 * Knex gives us tracked, ordered, reversible migrations going forward.
 *
 * Coexistence with the 12 legacy raw-SQL migrations:
 *   - Knex migrations live in database/migrations/ alongside the old .sql files.
 *   - `loadExtensions: ['.js']` makes Knex ignore every .sql file, so the legacy
 *     migrations are NOT re-run and NOT tracked here. They stay applied as-is.
 *   - Knex tracks only its own .js migrations in the `knex_migrations` table.
 *
 * Connection: reads DATABASE_URL — the SAME source as src/config/database.ts —
 * so local (lsemb) and bookie (bookie_lsemb) are driven by env, never hardcoded
 * (Hard Rule #4). Loads .env.lsemb first (matches the `dev` npm script), then .env.
 */
const path = require('path');

// Mirror the env-loading order the app uses: .env.lsemb (dev script) then .env.
require('dotenv').config({ path: path.resolve(__dirname, '../.env.lsemb') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config(); // backend/.env fallback

if (!process.env.DATABASE_URL) {
  throw new Error(
    '[knexfile] DATABASE_URL is not set. Knex migrations need it (same var as src/config/database.ts). ' +
    'Set it in .env.lsemb / .env before running migrations.'
  );
}

/** @type {import('knex').Knex.Config} */
const base = {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 1, max: 5 },
  migrations: {
    directory: path.resolve(__dirname, 'database/migrations'),
    // Only pick up Knex .js migrations; ignore the legacy raw-SQL files that
    // share this directory. Without this, Knex would try to run the .sql files.
    loadExtensions: ['.js'],
    tableName: 'knex_migrations',
    extension: 'js',
  },
  // No seeds: domain seed data lives in DEFAULT_LLM_CONFIG / DEFAULT_SCHEMAS (code),
  // not in Knex seeds, per Hard Rule #1 (config-driven, not migration-driven).
};

module.exports = {
  development: base,
  production: base,
  // Single config: the target DB is always chosen by DATABASE_URL (env), so we
  // do not branch by NODE_ENV here. bookie sets DATABASE_URL=...bookie_lsemb.
  default: base,
};
