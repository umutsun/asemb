/**
 * Manage Operations Architecture
 * @author Claude - Architecture Lead
 * @version Phase 3
 * @description Provides comprehensive management operations for ASEMB system
 */

import { Pool, PoolClient } from 'pg';
import { AsembError, ErrorCode } from '../../errors/AsembError';
import { CacheManager } from '../../shared/cache-manager';
import { ConnectionPool } from '../../shared/connection-pool';

/**
 * Delete operation options
 */
export interface DeleteOptions {
  cascade?: boolean;
  batchSize?: number;
  dryRun?: boolean;
}

/**
 * Cleanup operation options  
 */
export interface CleanupOptions {
  olderThan?: Date;
  workspace?: string;
  batchSize?: number;
}

/**
 * Vacuum operation options
 */
export interface VacuumOptions {
  analyze?: boolean;
  full?: boolean;
  tables?: string[];
}

/**
 * Reindex operation options
 */
export interface ReindexOptions {
  tables?: string[];
  concurrently?: boolean;
}

/**
 * Delete operation result
 */
export interface DeleteResult {
  deleted: number;
  chunks_removed: number;
  time_ms: number;
  errors?: string[];
}

/**
 * Statistics result
 */
export interface StatisticsResult {
  documents: number;
  chunks: number;
  sources: string[];
  storage_mb: number;
  index_health: 'healthy' | 'degraded' | 'critical';
  workspace_stats?: Record<string, {
    documents: number;
    chunks: number;
    size_mb: number;
  }>;
}

/**
 * Cleanup operation result
 */
export interface CleanupResult {
  removed_documents: number;
  removed_chunks: number;
  freed_space_mb: number;
  time_ms: number;
}

/**
 * Vacuum operation result
 */
export interface VacuumResult {
  tables_processed: string[];
  space_reclaimed_mb: number;
  time_ms: number;
}

/**
 * Reindex operation result
 */
export interface ReindexResult {
  indexes_rebuilt: string[];
  time_ms: number;
}

/**
 * Main interface for manage operations
 */
export interface ManageOperations {
  deleteBySourceId(sourceId: string, options?: DeleteOptions): Promise<DeleteResult>;
  getStatistics(workspace?: string): Promise<StatisticsResult>;
  cleanupOrphaned(options?: CleanupOptions): Promise<CleanupResult>;
  vacuum(options?: VacuumOptions): Promise<VacuumResult>;
  reindex(options?: ReindexOptions): Promise<ReindexResult>;
}

/**
 * Implementation of manage operations
 */
export class ManageOperationsImpl implements ManageOperations {
  private pool: Pool;
  private cache: CacheManager;

  constructor(pool: Pool) {
    this.pool = pool;
    this.cache = CacheManager.getInstance();
  }

  /**
   * Delete documents and chunks by source ID
   */
  async deleteBySourceId(sourceId: string, options: DeleteOptions = {}): Promise<DeleteResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let deleted = 0;
    let chunksRemoved = 0;

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Get statistics before deletion
      const statsResult = await client.query(
        `SELECT COUNT(DISTINCT e.id) as doc_count, COUNT(c.id) as chunk_count
         FROM embeddings e
         LEFT JOIN chunks c ON c.document_id = e.id
         WHERE e.source_id = $1`,
        [sourceId]
      );

      const docCount = parseInt(statsResult.rows[0]?.doc_count || '0');
      const chunkCount = parseInt(statsResult.rows[0]?.chunk_count || '0');

      if (options.dryRun) {
        await client.query('ROLLBACK');
        return {
          deleted: docCount,
          chunks_removed: chunkCount,
          time_ms: Date.now() - startTime,
          errors: ['Dry run - no actual deletion performed']
        };
      }

      // Delete chunks if cascade is enabled
      if (options.cascade) {
        const chunkResult = await client.query(
          `DELETE FROM chunks 
           WHERE document_id IN (
             SELECT id FROM embeddings WHERE source_id = $1
           )`,
          [sourceId]
        );
        chunksRemoved = chunkResult.rowCount || 0;
      }

      // Delete embeddings
      const embeddingResult = await client.query(
        'DELETE FROM embeddings WHERE source_id = $1',
        [sourceId]
      );
      deleted = embeddingResult.rowCount || 0;

      await client.query('COMMIT');

      // Invalidate cache for this source
      await this.cache.invalidatePattern(`*:${sourceId}:*`);

      return {
        deleted,
        chunks_removed: chunksRemoved,
        time_ms: Date.now() - startTime,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw new AsembError(
        ErrorCode.OPERATION_FAILED,
        `Failed to delete by source ID: ${error.message}`,
        { sourceId, error: error.message }
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get comprehensive statistics
   */
  async getStatistics(workspace?: string): Promise<StatisticsResult> {
    const cacheKey = this.cache.generateKey('stats', { workspace: workspace || 'all' });
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const client = await this.pool.connect();

    try {
      // Get document and chunk counts
      const countQuery = workspace
        ? `SELECT 
            COUNT(DISTINCT e.id) as doc_count,
            COUNT(DISTINCT c.id) as chunk_count,
            array_agg(DISTINCT e.source_id) as sources,
            SUM(pg_column_size(e.embedding) + pg_column_size(e.text)) / 1024 / 1024 as size_mb
           FROM embeddings e
           LEFT JOIN chunks c ON c.document_id = e.id
           WHERE e.metadata->>'workspace' = $1`
        : `SELECT 
            COUNT(DISTINCT e.id) as doc_count,
            COUNT(DISTINCT c.id) as chunk_count,
            array_agg(DISTINCT e.source_id) as sources,
            SUM(pg_column_size(e.embedding) + pg_column_size(e.text)) / 1024 / 1024 as size_mb
           FROM embeddings e
           LEFT JOIN chunks c ON c.document_id = e.id`;

      const params = workspace ? [workspace] : [];
      const result = await client.query(countQuery, params);

      // Get index health
      const indexHealthQuery = `
        SELECT 
          schemaname,
          tablename,
          indexname,
          idx_scan,
          idx_tup_read,
          idx_tup_fetch
        FROM pg_stat_user_indexes
        WHERE schemaname = 'public'
      `;
      const indexResult = await client.query(indexHealthQuery);
      
      // Determine index health based on usage
      let indexHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
      const unusedIndexes = indexResult.rows.filter(idx => idx.idx_scan === '0').length;
      if (unusedIndexes > indexResult.rows.length * 0.5) {
        indexHealth = 'critical';
      } else if (unusedIndexes > indexResult.rows.length * 0.2) {
        indexHealth = 'degraded';
      }

      // Get workspace statistics if not filtering
      let workspaceStats: Record<string, any> | undefined;
      if (!workspace) {
        const wsQuery = `
          SELECT 
            e.metadata->>'workspace' as workspace,
            COUNT(DISTINCT e.id) as documents,
            COUNT(DISTINCT c.id) as chunks,
            SUM(pg_column_size(e.embedding) + pg_column_size(e.text)) / 1024 / 1024 as size_mb
          FROM embeddings e
          LEFT JOIN chunks c ON c.document_id = e.id
          WHERE e.metadata->>'workspace' IS NOT NULL
          GROUP BY e.metadata->>'workspace'
        `;
        const wsResult = await client.query(wsQuery);
        
        workspaceStats = {};
        for (const row of wsResult.rows) {
          workspaceStats[row.workspace] = {
            documents: parseInt(row.documents),
            chunks: parseInt(row.chunks),
            size_mb: parseFloat(row.size_mb || '0')
          };
        }
      }

      const stats: StatisticsResult = {
        documents: parseInt(result.rows[0]?.doc_count || '0'),
        chunks: parseInt(result.rows[0]?.chunk_count || '0'),
        sources: result.rows[0]?.sources || [],
        storage_mb: parseFloat(result.rows[0]?.size_mb || '0'),
        index_health: indexHealth,
        workspace_stats: workspaceStats
      };

      // Cache for 5 minutes
      await this.cache.set(cacheKey, stats, 300);

      return stats;
    } catch (error: any) {
      throw new AsembError(
        ErrorCode.OPERATION_FAILED,
        `Failed to get statistics: ${error.message}`,
        { workspace, error: error.message }
      );
    } finally {
      client.release();
    }
  }

  /**
   * Clean up orphaned records
   */
  async cleanupOrphaned(options: CleanupOptions = {}): Promise<CleanupResult> {
    const startTime = Date.now();
    const client = await this.pool.connect();
    let removedDocuments = 0;
    let removedChunks = 0;

    try {
      await client.query('BEGIN');

      // Find and remove orphaned chunks (chunks without documents)
      const orphanedChunksQuery = `
        DELETE FROM chunks
        WHERE document_id NOT IN (SELECT id FROM embeddings)
        RETURNING id
      `;
      const chunksResult = await client.query(orphanedChunksQuery);
      removedChunks = chunksResult.rowCount || 0;

      // Remove old documents if date specified
      if (options.olderThan) {
        const deleteOldQuery = options.workspace
          ? `DELETE FROM embeddings 
             WHERE created_at < $1 AND metadata->>'workspace' = $2
             RETURNING id`
          : `DELETE FROM embeddings 
             WHERE created_at < $1
             RETURNING id`;
        
        const params = options.workspace
          ? [options.olderThan, options.workspace]
          : [options.olderThan];
        
        const oldResult = await client.query(deleteOldQuery, params);
        removedDocuments = oldResult.rowCount || 0;
      }

      // Calculate freed space before commit
      const sizeQuery = `
        SELECT 
          pg_size_pretty(pg_relation_size('embeddings')) as embeddings_size,
          pg_size_pretty(pg_relation_size('chunks')) as chunks_size
      `;
      const sizeResult = await client.query(sizeQuery);

      await client.query('COMMIT');

      // Clear relevant caches
      await this.cache.invalidatePattern('*');

      return {
        removed_documents: removedDocuments,
        removed_chunks: removedChunks,
        freed_space_mb: 0, // Would need before/after comparison for accurate value
        time_ms: Date.now() - startTime
      };
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw new AsembError(
        ErrorCode.OPERATION_FAILED,
        `Failed to cleanup orphaned records: ${error.message}`,
        { options, error: error.message }
      );
    } finally {
      client.release();
    }
  }

  /**
   * Vacuum database tables
   */
  async vacuum(options: VacuumOptions = {}): Promise<VacuumResult> {
    const startTime = Date.now();
    const tables = options.tables || ['embeddings', 'chunks'];
    const tablesProcessed: string[] = [];

    const client = await this.pool.connect();

    try {
      // Get size before vacuum
      const sizeBefore = await this.getTableSizes(client, tables);

      for (const table of tables) {
        const vacuumCommand = options.full
          ? `VACUUM FULL ${options.analyze ? 'ANALYZE' : ''} ${table}`
          : `VACUUM ${options.analyze ? 'ANALYZE' : ''} ${table}`;
        
        await client.query(vacuumCommand);
        tablesProcessed.push(table);
      }

      // Get size after vacuum
      const sizeAfter = await this.getTableSizes(client, tables);
      const spaceReclaimed = sizeBefore - sizeAfter;

      return {
        tables_processed: tablesProcessed,
        space_reclaimed_mb: Math.max(0, spaceReclaimed),
        time_ms: Date.now() - startTime
      };
    } catch (error: any) {
      throw new AsembError(
        ErrorCode.OPERATION_FAILED,
        `Failed to vacuum tables: ${error.message}`,
        { options, error: error.message }
      );
    } finally {
      client.release();
    }
  }

  /**
   * Reindex database tables
   */
  async reindex(options: ReindexOptions = {}): Promise<ReindexResult> {
    const startTime = Date.now();
    const tables = options.tables || ['embeddings', 'chunks'];
    const indexesRebuilt: string[] = [];

    const client = await this.pool.connect();

    try {
      // Get all indexes for specified tables
      const indexQuery = `
        SELECT indexname, tablename
        FROM pg_indexes
        WHERE tablename = ANY($1)
        AND schemaname = 'public'
      `;
      const indexResult = await client.query(indexQuery, [tables]);

      for (const idx of indexResult.rows) {
        const reindexCommand = options.concurrently
          ? `REINDEX INDEX CONCURRENTLY ${idx.indexname}`
          : `REINDEX INDEX ${idx.indexname}`;
        
        try {
          await client.query(reindexCommand);
          indexesRebuilt.push(idx.indexname);
        } catch (err: any) {
          console.warn(`Failed to reindex ${idx.indexname}: ${err.message}`);
        }
      }

      return {
        indexes_rebuilt: indexesRebuilt,
        time_ms: Date.now() - startTime
      };
    } catch (error: any) {
      throw new AsembError(
        ErrorCode.OPERATION_FAILED,
        `Failed to reindex tables: ${error.message}`,
        { options, error: error.message }
      );
    } finally {
      client.release();
    }
  }

  /**
   * Helper to get table sizes in MB
   */
  private async getTableSizes(client: PoolClient, tables: string[]): Promise<number> {
    const query = `
      SELECT SUM(pg_relation_size(tablename::regclass)) / 1024 / 1024 as size_mb
      FROM (
        SELECT unnest($1::text[]) as tablename
      ) t
    `;
    const result = await client.query(query, [tables]);
    return parseFloat(result.rows[0]?.size_mb || '0');
  }
}

/**
 * Factory function to create manage operations instance
 */
export function createManageOperations(pool: Pool): ManageOperations {
  return new ManageOperationsImpl(pool);
}