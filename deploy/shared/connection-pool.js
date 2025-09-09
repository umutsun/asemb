"use strict";
/**
 * Connection Pool Management
 * @author Claude - Architecture Lead
 * @version Phase 3
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisPool = exports.pgPool = exports.ConnectionHealthChecker = exports.PoolMetrics = exports.RedisPool = exports.PostgresPool = void 0;
const pg_1 = require("pg");
const ioredis_1 = __importDefault(require("ioredis"));
const AsembError_1 = require("../errors/AsembError");
/**
 * Singleton PostgreSQL connection pool
 */
class PostgresPool {
    constructor(config) {
        this.activeConnections = new Map();
        // Optimized pool configuration
        this.pool = new pg_1.Pool({
            ...config,
            max: parseInt(process.env.PG_POOL_MAX || '20'),
            min: parseInt(process.env.PG_POOL_MIN || '5'),
            idleTimeoutMillis: parseInt(process.env.PG_IDLE_TIMEOUT || '30000'),
            connectionTimeoutMillis: parseInt(process.env.PG_CONNECT_TIMEOUT || '2000'),
            statement_timeout: parseInt(process.env.PG_STATEMENT_TIMEOUT || '30000'),
            query_timeout: parseInt(process.env.PG_QUERY_TIMEOUT || '30000'),
            // Connection retry
            allowExitOnIdle: false
        });
        this.metrics = new PoolMetrics();
        this.setupEventHandlers();
    }
    static getInstance(config) {
        if (!PostgresPool.instance) {
            if (!config) {
                config = {
                    host: process.env.POSTGRES_HOST || 'localhost',
                    port: parseInt(process.env.POSTGRES_PORT || '5432'),
                    database: process.env.POSTGRES_DB || 'asemb',
                    user: process.env.POSTGRES_USER || 'asemb_user',
                    password: process.env.POSTGRES_PASSWORD
                };
            }
            PostgresPool.instance = new PostgresPool(config);
        }
        return PostgresPool.instance;
    }
    setupEventHandlers() {
        this.pool.on('error', (err, client) => {
            console.error('PostgreSQL pool error:', err);
            this.metrics.recordError(err);
        });
        this.pool.on('connect', (client) => {
            this.metrics.recordConnection();
        });
        this.pool.on('acquire', (client) => {
            this.metrics.recordAcquisition();
        });
        this.pool.on('remove', (client) => {
            this.metrics.recordRemoval();
        });
    }
    async getClient(context) {
        const startTime = Date.now();
        try {
            const client = await AsembError_1.ErrorHandler.withRetry(() => this.pool.connect(), {
                maxAttempts: 3,
                backoffMs: 500,
                exponential: true,
                onRetry: (attempt, error) => {
                    console.warn(`PostgreSQL connection retry ${attempt}:`, error.message);
                }
            });
            const connectionId = `${context || 'default'}_${Date.now()}`;
            this.activeConnections.set(connectionId, client);
            // Wrap release to track metrics
            const originalRelease = client.release.bind(client);
            client.release = () => {
                this.activeConnections.delete(connectionId);
                this.metrics.recordRelease(Date.now() - startTime);
                originalRelease();
            };
            return client;
        }
        catch (error) {
            this.metrics.recordError(error);
            throw new AsembError_1.AsembError(AsembError_1.ErrorCode.DATABASE_CONNECTION_FAILED, `Failed to acquire database connection: ${error.message}`, {
                context: { pool: context },
                retryable: true
            });
        }
    }
    async transaction(fn, context) {
        const client = await this.getClient(context);
        try {
            await client.query('BEGIN');
            const result = await fn(client);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw AsembError_1.ErrorHandler.wrapError(error, AsembError_1.ErrorCode.DATABASE_TRANSACTION_FAILED, { context });
        }
        finally {
            client.release();
        }
    }
    async query(sql, params) {
        const client = await this.getClient('query');
        try {
            const result = await client.query(sql, params);
            return result.rows;
        }
        catch (error) {
            throw AsembError_1.ErrorHandler.wrapError(error, AsembError_1.ErrorCode.DATABASE_QUERY_FAILED, { sql, params });
        }
        finally {
            client.release();
        }
    }
    getMetrics() {
        return this.metrics;
    }
    async shutdown() {
        // Release all active connections
        for (const [id, client] of this.activeConnections.entries()) {
            try {
                client.release();
            }
            catch (error) {
                console.error(`Error releasing connection ${id}:`, error);
            }
        }
        await this.pool.end();
    }
}
exports.PostgresPool = PostgresPool;
/**
 * Redis connection pool manager
 */
class RedisPool {
    constructor() {
        this.clients = new Map();
        this.metrics = new PoolMetrics();
    }
    static getInstance() {
        if (!RedisPool.instance) {
            RedisPool.instance = new RedisPool();
        }
        return RedisPool.instance;
    }
    getClient(purpose = 'cache') {
        if (!this.clients.has(purpose)) {
            const client = new ioredis_1.default({
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD,
                db: this.getDbIndex(purpose),
                retryStrategy: (times) => {
                    const delay = Math.min(times * 100, 3000);
                    this.metrics.recordError(new Error(`Redis retry attempt ${times}`));
                    return delay;
                },
                enableReadyCheck: true,
                maxRetriesPerRequest: 3,
                lazyConnect: false,
                // Connection pool settings
                enableOfflineQueue: true,
                connectTimeout: 10000,
                disconnectTimeout: 2000
            });
            client.on('error', (err) => {
                console.error(`Redis ${purpose} error:`, err);
                this.metrics.recordError(err);
            });
            client.on('connect', () => {
                this.metrics.recordConnection();
            });
            this.clients.set(purpose, client);
        }
        return this.clients.get(purpose);
    }
    getDbIndex(purpose) {
        switch (purpose) {
            case 'cache': return 0;
            case 'pubsub': return 1;
            case 'queue': return 2;
            default: return 0;
        }
    }
    async shutdown() {
        const promises = [];
        for (const [purpose, client] of this.clients.entries()) {
            promises.push(client.quit().then(() => {
                console.log(`Redis ${purpose} client disconnected`);
            }));
        }
        await Promise.all(promises);
        this.clients.clear();
    }
    getMetrics() {
        return this.metrics;
    }
}
exports.RedisPool = RedisPool;
/**
 * Connection pool metrics
 */
class PoolMetrics {
    constructor() {
        this.connections = 0;
        this.acquisitions = 0;
        this.releases = 0;
        this.errors = 0;
        this.removals = 0;
        this.totalWaitTime = 0;
        this.errorLog = [];
    }
    recordConnection() {
        this.connections++;
    }
    recordAcquisition() {
        this.acquisitions++;
    }
    recordRelease(waitTime) {
        this.releases++;
        this.totalWaitTime += waitTime;
    }
    recordRemoval() {
        this.removals++;
    }
    recordError(error) {
        this.errors++;
        this.errorLog.push({
            timestamp: new Date(),
            error: error.message
        });
        // Keep only last 100 errors
        if (this.errorLog.length > 100) {
            this.errorLog.shift();
        }
    }
    getStats() {
        return {
            connections: this.connections,
            acquisitions: this.acquisitions,
            releases: this.releases,
            errors: this.errors,
            removals: this.removals,
            avgWaitTime: this.releases > 0 ? this.totalWaitTime / this.releases : 0,
            activeConnections: this.acquisitions - this.releases,
            recentErrors: this.errorLog.slice(-10)
        };
    }
    reset() {
        this.connections = 0;
        this.acquisitions = 0;
        this.releases = 0;
        this.errors = 0;
        this.removals = 0;
        this.totalWaitTime = 0;
        this.errorLog = [];
    }
}
exports.PoolMetrics = PoolMetrics;
/**
 * Connection health checker
 */
class ConnectionHealthChecker {
    static async checkPostgres() {
        try {
            const pool = PostgresPool.getInstance();
            const result = await pool.query('SELECT 1');
            return result.length > 0;
        }
        catch (error) {
            console.error('PostgreSQL health check failed:', error);
            return false;
        }
    }
    static async checkRedis() {
        try {
            const pool = RedisPool.getInstance();
            const client = pool.getClient('cache');
            const result = await client.ping();
            return result === 'PONG';
        }
        catch (error) {
            console.error('Redis health check failed:', error);
            return false;
        }
    }
    static async checkAll() {
        const [postgres, redis] = await Promise.all([
            this.checkPostgres(),
            this.checkRedis()
        ]);
        return {
            postgres,
            redis,
            healthy: postgres && redis
        };
    }
}
exports.ConnectionHealthChecker = ConnectionHealthChecker;
// Export singleton instances
exports.pgPool = PostgresPool.getInstance();
exports.redisPool = RedisPool.getInstance();
