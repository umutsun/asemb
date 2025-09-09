import { Pool } from 'pg';
import type { INode } from 'n8n-workflow';
interface PgCreds {
    host: string;
    port: number;
    database: string;
    user: string;
    password?: string;
    ssl?: boolean;
}
export declare function getPool(node: INode, creds: PgCreds): Pool;
export interface DeleteBySourceOptions {
    cascade?: boolean;
}
export interface DeleteBySourceResult {
    deleted: number;
    chunks_removed: number;
}
export declare function deleteBySourceId(pool: Pool, sourceId: string, options?: DeleteBySourceOptions): Promise<DeleteBySourceResult>;
export type IndexHealth = 'healthy' | 'degraded' | 'critical';
export interface StatisticsResult {
    documents: number;
    chunks: number;
    sources: string[];
    storage_mb: number;
    index_health: IndexHealth;
    performance: {
        avg_search_ms: number;
        avg_insert_ms: number;
        cache_hit_rate: number;
    };
}
export declare function getStatistics(pool: Pool, workspace?: string): Promise<StatisticsResult>;
export interface CleanupOptions {
    dryRun?: boolean;
    batchSize?: number;
}
export interface CleanupResult {
    orphaned_chunks: number;
    orphaned_embeddings: number;
    cleaned: boolean;
    details: string[];
}
export declare function cleanupOrphaned(pool: Pool, options?: CleanupOptions): Promise<CleanupResult>;
export {};
