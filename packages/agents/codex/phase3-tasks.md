# Codex - Phase 3 Tasks: Manage Operations Implementation

## 🎯 Your Mission
Implement the manage operations in `db.ts`, focusing on deleteBySourceId, getStatistics, and cleanupOrphaned functions.

## 📋 Priority Tasks

### 1. Implement deleteBySourceId (HIGH)
**File:** `shared/db.ts`

Add this function to handle cascade deletion:

```typescript
export async function deleteBySourceId(
  sourceId: string,
  options: { cascade?: boolean } = { cascade: true }
): Promise<{ deleted: number; chunks_removed: number }> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // First, get all document IDs for this source
    const docsResult = await client.query(
      'SELECT id FROM embeddings WHERE source_id = $1',
      [sourceId]
    );
    
    const docIds = docsResult.rows.map(r => r.id);
    let chunksDeleted = 0;
    
    if (options.cascade && docIds.length > 0) {
      // Delete associated chunks
      const chunksResult = await client.query(
        'DELETE FROM chunks WHERE document_id = ANY($1::text[]) RETURNING id',
        [docIds]
      );
      chunksDeleted = chunksResult.rowCount || 0;
    }
    
    // Delete the embeddings
    const embedResult = await client.query(
      'DELETE FROM embeddings WHERE source_id = $1 RETURNING id',
      [sourceId]
    );
    
    await client.query('COMMIT');
    
    // Invalidate cache for this source
    await invalidateCache(`source:${sourceId}:*`);
    
    return {
      deleted: embedResult.rowCount || 0,
      chunks_removed: chunksDeleted
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(`Failed to delete by sourceId: ${error.message}`);
  } finally {
    client.release();
  }
}
```

### 2. Implement getStatistics (HIGH)
**File:** `shared/db.ts`

Add comprehensive statistics gathering:

```typescript
export async function getStatistics(
  workspace?: string
): Promise<{
  documents: number;
  chunks: number;
  sources: string[];
  storage_mb: number;
  index_health: 'healthy' | 'degraded' | 'critical';
  performance: {
    avg_search_ms: number;
    avg_insert_ms: number;
    cache_hit_rate: number;
  };
}> {
  const client = await pool.connect();
  
  try {
    // Get document count
    const docCount = await client.query(
      workspace 
        ? 'SELECT COUNT(*) FROM embeddings WHERE metadata->>\'workspace\' = $1'
        : 'SELECT COUNT(*) FROM embeddings',
      workspace ? [workspace] : []
    );
    
    // Get chunk count
    const chunkCount = await client.query(
      workspace
        ? `SELECT COUNT(*) FROM chunks c 
           JOIN embeddings e ON c.document_id = e.id 
           WHERE e.metadata->>'workspace' = $1`
        : 'SELECT COUNT(*) FROM chunks',
      workspace ? [workspace] : []
    );
    
    // Get unique sources
    const sources = await client.query(
      workspace
        ? 'SELECT DISTINCT source_id FROM embeddings WHERE metadata->>\'workspace\' = $1'
        : 'SELECT DISTINCT source_id FROM embeddings',
      workspace ? [workspace] : []
    );
    
    // Get storage size
    const storageQuery = `
      SELECT 
        pg_size_pretty(pg_total_relation_size('embeddings')) as embeddings_size,
        pg_size_pretty(pg_total_relation_size('chunks')) as chunks_size,
        pg_size_pretty(pg_database_size(current_database())) as total_size
    `;
    const storage = await client.query(storageQuery);
    
    // Check index health
    const indexHealth = await checkIndexHealth(client);
    
    // Get performance metrics from cache
    const performance = await getPerformanceMetrics();
    
    return {
      documents: parseInt(docCount.rows[0].count),
      chunks: parseInt(chunkCount.rows[0].count),
      sources: sources.rows.map(r => r.source_id),
      storage_mb: parseFloat(storage.rows[0].total_size),
      index_health: indexHealth,
      performance
    };
  } finally {
    client.release();
  }
}

async function checkIndexHealth(client: PoolClient): Promise<'healthy' | 'degraded' | 'critical'> {
  const result = await client.query(`
    SELECT 
      schemaname,
      tablename,
      indexname,
      idx_scan,
      idx_tup_read,
      idx_tup_fetch,
      pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
    FROM pg_stat_user_indexes
    WHERE schemaname = 'public'
    ORDER BY idx_scan DESC
  `);
  
  // Analyze index usage
  const unusedIndexes = result.rows.filter(r => r.idx_scan === '0').length;
  const totalIndexes = result.rows.length;
  
  if (unusedIndexes > totalIndexes * 0.5) return 'critical';
  if (unusedIndexes > totalIndexes * 0.2) return 'degraded';
  return 'healthy';
}
```

### 3. Implement cleanupOrphaned (HIGH)
**File:** `shared/db.ts`

Clean up orphaned records:

```typescript
export async function cleanupOrphaned(
  options: {
    dryRun?: boolean;
    batchSize?: number;
  } = { dryRun: false, batchSize: 100 }
): Promise<{
  orphaned_chunks: number;
  orphaned_embeddings: number;
  cleaned: boolean;
  details: string[];
}> {
  const client = await pool.connect();
  const details: string[] = [];
  
  try {
    await client.query('BEGIN');
    
    // Find orphaned chunks (chunks without parent documents)
    const orphanedChunks = await client.query(`
      SELECT c.id 
      FROM chunks c
      LEFT JOIN embeddings e ON c.document_id = e.id
      WHERE e.id IS NULL
      LIMIT $1
    `, [options.batchSize]);
    
    details.push(`Found ${orphanedChunks.rowCount} orphaned chunks`);
    
    // Find embeddings without vectors
    const orphanedEmbeddings = await client.query(`
      SELECT id 
      FROM embeddings 
      WHERE embedding IS NULL 
        OR cardinality(embedding) = 0
      LIMIT $1
    `, [options.batchSize]);
    
    details.push(`Found ${orphanedEmbeddings.rowCount} embeddings without vectors`);
    
    if (!options.dryRun) {
      // Delete orphaned chunks
      if (orphanedChunks.rowCount > 0) {
        const chunkIds = orphanedChunks.rows.map(r => r.id);
        await client.query(
          'DELETE FROM chunks WHERE id = ANY($1::text[])',
          [chunkIds]
        );
        details.push(`Deleted ${chunkIds.length} orphaned chunks`);
      }
      
      // Delete invalid embeddings
      if (orphanedEmbeddings.rowCount > 0) {
        const embeddingIds = orphanedEmbeddings.rows.map(r => r.id);
        await client.query(
          'DELETE FROM embeddings WHERE id = ANY($1::text[])',
          [embeddingIds]
        );
        details.push(`Deleted ${embeddingIds.length} invalid embeddings`);
      }
      
      await client.query('COMMIT');
      
      // Run VACUUM to reclaim space
      await client.query('VACUUM ANALYZE embeddings');
      await client.query('VACUUM ANALYZE chunks');
      details.push('Vacuum completed');
    } else {
      await client.query('ROLLBACK');
      details.push('Dry run - no changes made');
    }
    
    return {
      orphaned_chunks: orphanedChunks.rowCount || 0,
      orphaned_embeddings: orphanedEmbeddings.rowCount || 0,
      cleaned: !options.dryRun,
      details
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw new Error(`Cleanup failed: ${error.message}`);
  } finally {
    client.release();
  }
}
```

### 4. Add Batch Operations (MEDIUM)
**File:** `shared/db.ts`

Implement efficient batch processing:

```typescript
export async function batchUpsert(
  documents: Array<{
    id: string;
    text: string;
    embedding: number[];
    metadata?: any;
    sourceId?: string;
  }>,
  options: {
    batchSize?: number;
    onProgress?: (processed: number, total: number) => void;
  } = { batchSize: 100 }
): Promise<{ 
  inserted: number; 
  updated: number; 
  failed: number;
  errors: Array<{ id: string; error: string }>;
}> {
  const results = {
    inserted: 0,
    updated: 0,
    failed: 0,
    errors: [] as Array<{ id: string; error: string }>
  };
  
  const client = await pool.connect();
  
  try {
    // Process in batches
    for (let i = 0; i < documents.length; i += options.batchSize) {
      const batch = documents.slice(i, i + options.batchSize);
      
      await client.query('BEGIN');
      
      try {
        // Build multi-row insert
        const values: any[] = [];
        const placeholders: string[] = [];
        
        batch.forEach((doc, idx) => {
          const offset = idx * 5;
          placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}::vector, $${offset + 4}::jsonb, $${offset + 5})`
          );
          values.push(
            doc.id,
            doc.text,
            `[${doc.embedding.join(',')}]`,
            JSON.stringify(doc.metadata || {}),
            doc.sourceId || 'batch'
          );
        });
        
        const query = `
          INSERT INTO embeddings (id, text, embedding, metadata, source_id)
          VALUES ${placeholders.join(', ')}
          ON CONFLICT (id) DO UPDATE SET
            text = EXCLUDED.text,
            embedding = EXCLUDED.embedding,
            metadata = EXCLUDED.metadata,
            updated_at = NOW()
          RETURNING id, (xmax = 0) as inserted
        `;
        
        const result = await client.query(query, values);
        
        result.rows.forEach(row => {
          if (row.inserted) {
            results.inserted++;
          } else {
            results.updated++;
          }
        });
        
        await client.query('COMMIT');
        
        // Report progress
        if (options.onProgress) {
          options.onProgress(i + batch.length, documents.length);
        }
        
      } catch (batchError) {
        await client.query('ROLLBACK');
        
        // Try individual inserts for failed batch
        for (const doc of batch) {
          try {
            await upsertEmbedding(
              doc.id,
              doc.text,
              doc.embedding,
              doc.metadata,
              doc.sourceId
            );
            results.inserted++;
          } catch (docError) {
            results.failed++;
            results.errors.push({
              id: doc.id,
              error: docError.message
            });
          }
        }
      }
    }
    
    // Invalidate cache after batch operation
    await invalidateCache('search:*');
    
    return results;
    
  } finally {
    client.release();
  }
}
```

### 5. Create Unit Tests (MEDIUM)
**File:** `tests/db.test.ts`

Write comprehensive tests:

```typescript
import { 
  deleteBySourceId, 
  getStatistics, 
  cleanupOrphaned,
  batchUpsert 
} from '../shared/db';

describe('Manage Operations', () => {
  beforeEach(async () => {
    // Setup test data
    await setupTestData();
  });
  
  afterEach(async () => {
    // Cleanup
    await cleanupTestData();
  });
  
  describe('deleteBySourceId', () => {
    it('should delete all documents from a source', async () => {
      // Insert test documents
      const sourceId = 'test-source-001';
      await insertTestDocuments(sourceId, 5);
      
      // Delete by source
      const result = await deleteBySourceId(sourceId);
      
      expect(result.deleted).toBe(5);
      expect(result.chunks_removed).toBeGreaterThan(0);
      
      // Verify deletion
      const remaining = await getDocumentsBySource(sourceId);
      expect(remaining).toHaveLength(0);
    });
    
    it('should handle cascade deletion correctly', async () => {
      const sourceId = 'test-source-002';
      await insertTestDocumentsWithChunks(sourceId, 3);
      
      const result = await deleteBySourceId(sourceId, { cascade: true });
      
      expect(result.deleted).toBe(3);
      expect(result.chunks_removed).toBeGreaterThan(0);
    });
    
    it('should not delete chunks when cascade is false', async () => {
      const sourceId = 'test-source-003';
      await insertTestDocumentsWithChunks(sourceId, 2);
      
      const result = await deleteBySourceId(sourceId, { cascade: false });
      
      expect(result.deleted).toBe(2);
      expect(result.chunks_removed).toBe(0);
    });
  });
  
  describe('getStatistics', () => {
    it('should return accurate statistics', async () => {
      await insertTestDataSet();
      
      const stats = await getStatistics();
      
      expect(stats).toHaveProperty('documents');
      expect(stats).toHaveProperty('chunks');
      expect(stats).toHaveProperty('sources');
      expect(stats).toHaveProperty('storage_mb');
      expect(stats).toHaveProperty('index_health');
      expect(stats.index_health).toMatch(/healthy|degraded|critical/);
    });
    
    it('should filter by workspace', async () => {
      await insertWorkspaceData('workspace-1', 10);
      await insertWorkspaceData('workspace-2', 5);
      
      const stats1 = await getStatistics('workspace-1');
      const stats2 = await getStatistics('workspace-2');
      
      expect(stats1.documents).toBe(10);
      expect(stats2.documents).toBe(5);
    });
  });
  
  describe('cleanupOrphaned', () => {
    it('should identify orphaned records', async () => {
      await createOrphanedRecords();
      
      const result = await cleanupOrphaned({ dryRun: true });
      
      expect(result.orphaned_chunks).toBeGreaterThan(0);
      expect(result.orphaned_embeddings).toBeGreaterThan(0);
      expect(result.cleaned).toBe(false);
    });
    
    it('should clean orphaned records when not dry run', async () => {
      await createOrphanedRecords();
      
      const result = await cleanupOrphaned({ dryRun: false });
      
      expect(result.cleaned).toBe(true);
      expect(result.details).toContain('Vacuum completed');
      
      // Verify cleanup
      const checkResult = await cleanupOrphaned({ dryRun: true });
      expect(checkResult.orphaned_chunks).toBe(0);
    });
  });
  
  describe('batchUpsert', () => {
    it('should handle large batch inserts', async () => {
      const documents = generateTestDocuments(500);
      
      const result = await batchUpsert(documents, {
        batchSize: 100,
        onProgress: (processed, total) => {
          console.log(`Progress: ${processed}/${total}`);
        }
      });
      
      expect(result.inserted + result.updated).toBe(500);
      expect(result.failed).toBe(0);
    });
    
    it('should handle partial failures gracefully', async () => {
      const documents = [
        ...generateTestDocuments(3),
        { id: 'invalid', text: null, embedding: [] }, // Invalid document
        ...generateTestDocuments(2)
      ];
      
      const result = await batchUpsert(documents);
      
      expect(result.inserted + result.updated).toBe(5);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].id).toBe('invalid');
    });
  });
});
```

## 📊 Database Schema Updates

### Add necessary indexes and constraints:

```sql
-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_embeddings_source_id 
  ON embeddings(source_id);

CREATE INDEX IF NOT EXISTS idx_embeddings_created_at 
  ON embeddings(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chunks_document_id 
  ON chunks(document_id);

CREATE INDEX IF NOT EXISTS idx_embeddings_workspace 
  ON embeddings((metadata->>'workspace'));

-- Add constraints
ALTER TABLE chunks 
  ADD CONSTRAINT fk_chunks_document 
  FOREIGN KEY (document_id) 
  REFERENCES embeddings(id) 
  ON DELETE CASCADE;

-- Add statistics table for performance tracking
CREATE TABLE IF NOT EXISTS performance_metrics (
  id SERIAL PRIMARY KEY,
  operation VARCHAR(50) NOT NULL,
  duration_ms INTEGER NOT NULL,
  success BOOLEAN DEFAULT true,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_metrics_operation ON performance_metrics(operation);
CREATE INDEX idx_metrics_created_at ON performance_metrics(created_at DESC);
```

## 🔧 Implementation Checklist

### Core Functions:
- [ ] deleteBySourceId with cascade support
- [ ] getStatistics with workspace filtering
- [ ] cleanupOrphaned with dry run
- [ ] batchUpsert with progress callback
- [ ] Performance metric tracking

### Database Updates:
- [ ] Add required indexes
- [ ] Add foreign key constraints
- [ ] Create metrics table
- [ ] Optimize existing queries

### Testing:
- [ ] Unit tests for all functions
- [ ] Integration tests with real database
- [ ] Performance benchmarks
- [ ] Error handling tests

## 📈 Performance Considerations

### Connection Pooling:
```typescript
// Update pool configuration
const pool = new Pool({
  host: process.env.POSTGRES_HOST,
  port: parseInt(process.env.POSTGRES_PORT || '5432'),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  max: 20,                    // Maximum connections
  idleTimeoutMillis: 30000,   // Close idle connections
  connectionTimeoutMillis: 2000, // Connection timeout
  statement_timeout: 30000,    // Query timeout
});
```

### Query Optimization:
- Use prepared statements for repeated queries
- Batch operations when possible
- Use COPY for bulk inserts
- Implement query result caching

## 🔗 Coordination Points

### With Claude:
- Ensure error handling matches architecture
- Validate transaction boundaries
- Review connection pooling settings

### With Gemini:
- Optimize queries for performance
- Implement caching hooks
- Add performance metrics

### With DeepSeek:
- Provide test fixtures
- Document function behavior
- Create integration tests

## 📅 Timeline

### Day 1-2:
- [ ] Implement core manage functions
- [ ] Add database migrations
- [ ] Write unit tests

### Day 3-4:
- [ ] Add batch operations
- [ ] Optimize queries
- [ ] Performance testing

### Day 5:
- [ ] Integration testing
- [ ] Documentation
- [ ] Code review

## 💡 Implementation Notes

1. **Transaction Management**: Always use transactions for multi-table operations
2. **Error Recovery**: Implement retry logic for transient failures
3. **Cache Invalidation**: Clear relevant cache entries after modifications
4. **Monitoring**: Track all operations for performance analysis
5. **Security**: Validate and sanitize all inputs

Remember: These operations are critical for system maintenance. Ensure they're robust, well-tested, and performant.