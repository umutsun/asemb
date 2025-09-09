"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPool = getPool;
exports.deleteBySourceId = deleteBySourceId;
exports.getStatistics = getStatistics;
exports.cleanupOrphaned = cleanupOrphaned;
const pg_1 = require("pg");
// Use a Map to store pools, keyed by a unique identifier for the credentials.
// This allows for multiple different database connections to be pooled.
const pools = new Map();
function getPool(node, creds) {
    // Create a unique key for the connection pool based on the credentials.
    const key = `${creds.user}:${creds.host}:${creds.port}:${creds.database}`;
    let pool = pools.get(key);
    if (!pool) {
        // If a pool for these credentials doesn't exist, create one.
        pool = new pg_1.Pool({
            host: creds.host,
            port: creds.port,
            database: creds.database,
            user: creds.user,
            password: creds.password,
            ssl: creds.ssl ? { rejectUnauthorized: false } : undefined,
            max: 20, // Max number of clients in the pool
            idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
            connectionTimeoutMillis: 2000, // How long to wait for a client to connect
        });
        pools.set(key, pool);
        // Add an error listener to the pool. This is important for handling
        // errors on idle clients and preventing the application from crashing.
        pool.on('error', (err) => {
            console.error(`Unexpected error on idle client in pool ${key}`, err);
            // On error, remove the faulty pool. It will be recreated on the next request.
            pools.delete(key);
        });
    }
    return pool;
}
async function deleteBySourceId(pool, sourceId, options = { cascade: true }) {
    var _a;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Count rows to be deleted from embeddings
        const countRes = await client.query('SELECT COUNT(*)::text AS count FROM embeddings WHERE source_id = $1', [sourceId]);
        const toDelete = parseInt(((_a = countRes.rows[0]) === null || _a === void 0 ? void 0 : _a.count) || '0', 10);
        let chunksRemoved = 0;
        if (options.cascade) {
            // Remove any cached chunks for this source if the table exists
            const cacheExists = await tableExists(client, 'chunks_cache');
            if (cacheExists) {
                const delCache = await client.query('DELETE FROM chunks_cache WHERE source_id = $1 RETURNING id', [sourceId]);
                chunksRemoved = delCache.rowCount || 0;
            }
        }
        // Delete embeddings for the source
        await client.query('DELETE FROM embeddings WHERE source_id = $1', [sourceId]);
        await client.query('COMMIT');
        return { deleted: toDelete, chunks_removed: chunksRemoved };
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Failed to delete by sourceId: ${(err === null || err === void 0 ? void 0 : err.message) || String(err)}`);
    }
    finally {
        client.release();
    }
}
async function getStatistics(pool, workspace) {
    var _a, _b, _c, _d;
    const client = await pool.connect();
    try {
        // Embeddings (chunks) count with optional workspace metadata filter
        const chunksQuery = workspace
            ? "SELECT COUNT(*)::text AS count FROM embeddings WHERE metadata->>'workspace' = $1"
            : 'SELECT COUNT(*)::text AS count FROM embeddings';
        const chunksParams = workspace ? [workspace] : [];
        const chunksRes = await client.query(chunksQuery, chunksParams);
        const chunks = parseInt(((_a = chunksRes.rows[0]) === null || _a === void 0 ? void 0 : _a.count) || '0', 10);
        // Distinct sources from embeddings (respects workspace filter)
        const sourcesQuery = workspace
            ? "SELECT DISTINCT source_id::text AS source_id FROM embeddings WHERE metadata->>'workspace' = $1"
            : 'SELECT DISTINCT source_id::text AS source_id FROM embeddings';
        const sourcesRes = await client.query(sourcesQuery, chunksParams);
        const sources = sourcesRes.rows.map((r) => r.source_id);
        // Documents = number of sources represented
        const documents = sources.length;
        // Storage: sum relation sizes for relevant tables; fallback to database size
        const tables = ['embeddings', 'sources', 'sync_logs', 'queries', 'api_usage', 'chunks_cache'];
        let totalBytes = 0;
        for (const t of tables) {
            const exists = await tableExists(client, t);
            if (!exists)
                continue;
            const r = await client.query("SELECT pg_total_relation_size($1)::text AS size", [t]);
            totalBytes += parseInt(((_b = r.rows[0]) === null || _b === void 0 ? void 0 : _b.size) || '0', 10);
        }
        if (totalBytes === 0) {
            const r = await client.query('SELECT pg_database_size(current_database())::text AS size');
            totalBytes = parseInt(((_c = r.rows[0]) === null || _c === void 0 ? void 0 : _c.size) || '0', 10);
        }
        const storage_mb = Number((totalBytes / (1024 * 1024)).toFixed(2));
        // Index health using pg_stat_user_indexes
        const index_health = await checkIndexHealth(client);
        // Performance: derive from queries table if present; otherwise defaults
        let avg_search_ms = 0;
        let avg_insert_ms = 0; // not readily available; leave as 0
        let cache_hit_rate = 0; // requires external cache metrics; 0 as default
        if (await tableExists(client, 'queries')) {
            const q = workspace
                ? "SELECT AVG(execution_time_ms)::text AS avg_ms FROM queries WHERE metadata->>'workspace' = $1"
                : 'SELECT AVG(execution_time_ms)::text AS avg_ms FROM queries';
            const r = await client.query(q, chunksParams);
            avg_search_ms = ((_d = r.rows[0]) === null || _d === void 0 ? void 0 : _d.avg_ms) ? parseFloat(r.rows[0].avg_ms) : 0;
        }
        return {
            documents,
            chunks,
            sources,
            storage_mb,
            index_health,
            performance: {
                avg_search_ms,
                avg_insert_ms,
                cache_hit_rate,
            },
        };
    }
    finally {
        client.release();
    }
}
async function cleanupOrphaned(pool, options = { dryRun: false, batchSize: 100 }) {
    var _a, _b, _c;
    const client = await pool.connect();
    const details = [];
    const batchSize = (_a = options.batchSize) !== null && _a !== void 0 ? _a : 100;
    try {
        await client.query('BEGIN');
        // Orphaned embeddings (should be rare due to FK)
        const orphanedEmbeddingsRes = await client.query(`SELECT e.id::text AS id
       FROM embeddings e
       LEFT JOIN sources s ON e.source_id = s.id
       WHERE s.id IS NULL
       LIMIT $1`, [batchSize]);
        const orphanedEmbeddings = orphanedEmbeddingsRes.rows.map((r) => r.id);
        details.push(`Found ${orphanedEmbeddings.length} orphaned embeddings`);
        // Orphaned cached chunks (if table exists)
        let orphanedChunks = [];
        if (await tableExists(client, 'chunks_cache')) {
            const orphanedChunksRes = await client.query(`SELECT c.id::text AS id
         FROM chunks_cache c
         LEFT JOIN sources s ON c.source_id = s.id
         WHERE s.id IS NULL
         LIMIT $1`, [batchSize]);
            orphanedChunks = orphanedChunksRes.rows.map((r) => r.id);
            details.push(`Found ${orphanedChunks.length} orphaned cached chunks`);
        }
        if (!options.dryRun) {
            if (orphanedChunks.length > 0) {
                await client.query('DELETE FROM chunks_cache WHERE id = ANY($1::uuid[])', [orphanedChunks]);
                details.push(`Deleted ${orphanedChunks.length} orphaned cached chunks`);
            }
            if (orphanedEmbeddings.length > 0) {
                await client.query('DELETE FROM embeddings WHERE id = ANY($1::uuid[])', [orphanedEmbeddings]);
                details.push(`Deleted ${orphanedEmbeddings.length} orphaned embeddings`);
            }
            // Optional: clean up expired cache if function exists
            if (await functionExists(client, 'cleanup_expired_cache')) {
                const r = await client.query('SELECT cleanup_expired_cache()');
                details.push(`Expired cache rows cleaned: ${(_c = (_b = r.rows[0]) === null || _b === void 0 ? void 0 : _b.cleanup_expired_cache) !== null && _c !== void 0 ? _c : 0}`);
            }
            await client.query('COMMIT');
        }
        else {
            await client.query('ROLLBACK');
            details.push('Dry run - no changes made');
        }
        return {
            orphaned_chunks: orphanedChunks.length,
            orphaned_embeddings: orphanedEmbeddings.length,
            cleaned: !options.dryRun,
            details,
        };
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Cleanup failed: ${(err === null || err === void 0 ? void 0 : err.message) || String(err)}`);
    }
    finally {
        client.release();
    }
}
async function checkIndexHealth(client) {
    const res = await client.query(`SELECT idx_scan FROM pg_stat_user_indexes WHERE schemaname = 'public'`);
    const total = res.rowCount || 0;
    const unused = res.rows.filter((r) => {
        const v = typeof r.idx_scan === 'string' ? parseInt(r.idx_scan, 10) : r.idx_scan;
        return !v || v === 0;
    }).length;
    if (total === 0)
        return 'healthy';
    if (unused > total * 0.5)
        return 'critical';
    if (unused > total * 0.2)
        return 'degraded';
    return 'healthy';
}
async function tableExists(client, table) {
    var _a;
    const r = await client.query(`SELECT EXISTS (
       SELECT 1 FROM information_schema.tables 
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`, [table]);
    return !!((_a = r.rows[0]) === null || _a === void 0 ? void 0 : _a.exists);
}
async function functionExists(client, fnName) {
    var _a;
    const r = await client.query(`SELECT EXISTS (
       SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = $1
     ) AS exists`, [fnName]);
    return !!((_a = r.rows[0]) === null || _a === void 0 ? void 0 : _a.exists);
}
