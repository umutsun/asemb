/**
 * Shared settings/API-key reader for maintenance scripts.
 *
 * Source of truth for API keys = the `settings` table (Hard Rule #1: API keys are
 * DB/config-driven, managed via the Settings UI — never hardcoded). Mirrors the backend
 * settings.service.getApiKey resolution: the `settings` table (canonical key + legacy
 * variants, incl. JSON-wrapped {"apiKey": "..."}), then the legacy `chatbot_settings`
 * table. The caller may pass an env var name as a last-resort fallback.
 *
 * DB connection comes from env: DATABASE_URL, else POSTGRES_* (localhost/lsemb defaults
 * for local dev). When running against another instance (e.g. bookie), set DATABASE_URL
 * or POSTGRES_DB=bookie_lsemb in the shell.
 */
const { Pool } = require('pg');

let _pool;
function getPool() {
    if (_pool) return _pool;
    _pool = process.env.DATABASE_URL
        ? new Pool({ connectionString: process.env.DATABASE_URL })
        : new Pool({
            host: process.env.POSTGRES_HOST || 'localhost',
            port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
            user: process.env.POSTGRES_USER || 'postgres',
            password: process.env.POSTGRES_PASSWORD || '',
            database: process.env.POSTGRES_DB || 'lsemb',
        });
    return _pool;
}

// Canonical key first, then legacy aliases (matches settings.service / rag-chat.service).
const KEY_VARIANTS = {
    'openai.apiKey': ['openai.apiKey', 'openai_api_key', 'openaiApiKey'],
    'deepl.apiKey': ['deepl.apiKey', 'deepl_api_key', 'deeplApiKey'],
    'google.apiKey': ['google.apiKey', 'google_api_key', 'googleApiKey'],
    'anthropic.apiKey': ['anthropic.apiKey', 'claude.apiKey', 'anthropic_api_key'],
    'deepseek.apiKey': ['deepseek.apiKey', 'deepseek_api_key', 'deepseekApiKey'],
};

function unwrap(value) {
    if (typeof value !== 'string') return value;
    try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && parsed.apiKey) return parsed.apiKey;
    } catch (_) { /* plain string, not JSON-wrapped */ }
    return value;
}

/** Read an API key from the DB settings. Returns null if absent (caller may fall back to env). */
async function getApiKey(keyName) {
    const keys = KEY_VARIANTS[keyName] || [keyName];
    const pool = getPool();
    for (const k of keys) {
        const r = await pool.query('SELECT value FROM settings WHERE key = $1', [k]);
        if (r.rows[0] && r.rows[0].value) return unwrap(r.rows[0].value);
    }
    for (const k of keys) {
        const r = await pool.query('SELECT setting_value FROM chatbot_settings WHERE setting_key = $1', [k]);
        if (r.rows[0] && r.rows[0].setting_value) return unwrap(r.rows[0].setting_value);
    }
    return null;
}

/** Resolve a key: DB settings first (source of truth), then `envVar` as fallback. */
async function resolveApiKey(keyName, envVar) {
    let fromDb = null;
    try {
        fromDb = await getApiKey(keyName);
    } catch (e) {
        console.warn(`[db-settings] DB lookup for ${keyName} failed (${e.message}); falling back to env ${envVar || '(none)'}`);
    }
    return fromDb || (envVar ? process.env[envVar] : null) || null;
}

async function close() {
    if (_pool) { await _pool.end(); _pool = undefined; }
}

module.exports = { getApiKey, resolveApiKey, close };
