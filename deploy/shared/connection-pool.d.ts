/**
 * Connection Pool Management
 * @author Claude - Architecture Lead
 * @version Phase 3
 */
import { PoolClient, PoolConfig } from 'pg';
import Redis from 'ioredis';
/**
 * Singleton PostgreSQL connection pool
 */
export declare class PostgresPool {
    private static instance;
    private pool;
    private activeConnections;
    private metrics;
    private constructor();
    static getInstance(config?: PoolConfig): PostgresPool;
    private setupEventHandlers;
    getClient(context?: string): Promise<PoolClient>;
    transaction<T>(fn: (client: PoolClient) => Promise<T>, context?: string): Promise<T>;
    query<T = any>(sql: string, params?: any[]): Promise<T[]>;
    getMetrics(): PoolMetrics;
    shutdown(): Promise<void>;
}
/**
 * Redis connection pool manager
 */
export declare class RedisPool {
    private static instance;
    private clients;
    private metrics;
    private constructor();
    static getInstance(): RedisPool;
    getClient(purpose?: 'cache' | 'pubsub' | 'queue'): Redis;
    private getDbIndex;
    shutdown(): Promise<void>;
    getMetrics(): PoolMetrics;
}
/**
 * Connection pool metrics
 */
export declare class PoolMetrics {
    private connections;
    private acquisitions;
    private releases;
    private errors;
    private removals;
    private totalWaitTime;
    private errorLog;
    recordConnection(): void;
    recordAcquisition(): void;
    recordRelease(waitTime: number): void;
    recordRemoval(): void;
    recordError(error: Error): void;
    getStats(): {
        connections: number;
        acquisitions: number;
        releases: number;
        errors: number;
        removals: number;
        avgWaitTime: number;
        activeConnections: number;
        recentErrors: {
            timestamp: Date;
            error: string;
        }[];
    };
    reset(): void;
}
/**
 * Connection health checker
 */
export declare class ConnectionHealthChecker {
    static checkPostgres(): Promise<boolean>;
    static checkRedis(): Promise<boolean>;
    static checkAll(): Promise<{
        postgres: boolean;
        redis: boolean;
        healthy: boolean;
    }>;
}
export declare const pgPool: PostgresPool;
export declare const redisPool: RedisPool;
