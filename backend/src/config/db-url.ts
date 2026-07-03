// Side-effect-free resolver for the PostgreSQL connection string.
// Kept separate from database.config.ts so scripts/routes can import it WITHOUT
// triggering the shared pool (and its monitor interval) at module load.
//
// Credentials come from environment ONLY — no hardcoded fallbacks (Hard Rule #2).

/**
 * Resolve the PostgreSQL connection string from environment. Prefers DATABASE_URL /
 * ASEMB_DATABASE_URL / LSEMB_DATABASE_URL, else builds one from POSTGRES_* vars.
 * Throws a clear error when nothing is configured, so a misconfigured environment
 * fails loudly instead of silently connecting to a wrong hardcoded default.
 */
export function resolveDatabaseUrl(): string {
  const url =
    process.env.DATABASE_URL || process.env.ASEMB_DATABASE_URL || process.env.LSEMB_DATABASE_URL;
  if (url) return url;

  const host = process.env.POSTGRES_HOST;
  const user = process.env.POSTGRES_USER;
  const password = process.env.POSTGRES_PASSWORD;
  const database = process.env.POSTGRES_DB;
  if (host && user && password !== undefined && database) {
    const port = process.env.POSTGRES_PORT || '5432';
    return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
  }

  throw new Error(
    'Database connection is not configured. Set DATABASE_URL (or ASEMB_DATABASE_URL), ' +
      'or POSTGRES_HOST/PORT/DB/USER/PASSWORD.'
  );
}
