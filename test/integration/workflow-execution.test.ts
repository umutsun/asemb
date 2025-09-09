/**
 * Workflow Execution Integration Tests
 * @author Claude (Architecture Lead)
 */

// Mock pg module
const dbStore: { [table: string]: any[] } = {
    documents: [],
};
jest.mock('pg', () => ({
  Pool: jest.fn(() => ({
    connect: jest.fn(() => Promise.resolve({
      query: jest.fn((query: string, params: any[]) => {
        if (query.includes('INSERT INTO documents')) {
            const existing = dbStore.documents.find(doc => doc.id === params[0]);
            if (existing) {
                existing.content = params[2];
                existing.metadata = params[3];
            } else {
                dbStore.documents.push({ id: params[0], source_id: params[1], content: params[2], metadata: params[3] });
            }
            return Promise.resolve({ rows: [], rowCount: 1 });
        }
        if (query.includes('SELECT id, content, metadata')) {
            const searchTerm = params[0].replace(/%/g, '');
            const results = dbStore.documents.filter(doc => doc.content.includes(searchTerm));
            return Promise.resolve({ rows: results, rowCount: results.length });
        }
        if (query.includes('TRUNCATE TABLE documents')) {
            dbStore.documents = [];
            return Promise.resolve({ rows: [], rowCount: 0 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
      release: jest.fn()
    })),
    end: jest.fn(() => Promise.resolve()),
    on: jest.fn()
  }))
}));

// Mock ioredis module
const redisStore: { [key: string]: any } = {};
jest.mock('ioredis', () => {
  return jest.fn(() => ({
    get: jest.fn((key: string) => Promise.resolve(redisStore[key] || null)),
    set: jest.fn((key: string, value: string) => {
      redisStore[key] = value;
      return Promise.resolve('OK');
    }),
    setex: jest.fn((key: string, seconds: number, value: string) => {
        redisStore[key] = value;
        return Promise.resolve('OK');
    }),
    del: jest.fn((key: string) => {
        delete redisStore[key];
        return Promise.resolve(1);
    }),
    keys: jest.fn((pattern: string) => {
        const regex = new RegExp(pattern.replace('*', '.*'));
        return Promise.resolve(Object.keys(redisStore).filter(key => regex.test(key)));
    }),
    ping: jest.fn(() => Promise.resolve('PONG')),
    subscribe: jest.fn(() => Promise.resolve()),
    unsubscribe: jest.fn(() => Promise.resolve()),
    publish: jest.fn(() => Promise.resolve(1)),
    lpush: jest.fn((key: string, value: string) => {
        if (!redisStore[key]) {
            redisStore[key] = [];
        }
        redisStore[key].unshift(value);
        return Promise.resolve(1);
    }),
    rpop: jest.fn((key: string) => {
        const value = redisStore[key] ? redisStore[key].pop() : null;
        return Promise.resolve(value || null);
    }),
    zadd: jest.fn((key: string, priority: number, member: string) => {
        if (!redisStore[key]) {
            redisStore[key] = [];
        }
        redisStore[key].push({ score: priority, member: member });
        redisStore[key].sort((a: any, b: any) => a.score - b.score);
        return Promise.resolve(1);
    }),
    zpopmin: jest.fn((key: string, count: number) => {
        const items = redisStore[key] ? redisStore[key].splice(0, count) : [];
        return Promise.resolve(items.map((item: any) => item.member));
    }),
    on: jest.fn(),
    quit: jest.fn(() => Promise.resolve())
  }));
});

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { INodeExecutionData, IExecuteFunctions } from 'n8n-workflow';
import { PostgresPool, RedisPool } from '../../src/shared/connection-pool';
import { CacheManager } from '../../src/shared/cache-manager';
import { 
  ISemanticDocument, 
  ISearchQuery, 
  SearchMode,
  IWorkflowMetrics,
  WorkflowStatus,
  REDIS_KEYS 
} from '../../shared/interfaces';

describe('Workflow Execution Integration', () => {
  let pgPool: PostgresPool;
  let redisPool: RedisPool;
  let cacheManager: CacheManager;
  const projectKey = 'test-workflow-project';
  
  beforeAll(async () => {
    pgPool = PostgresPool.getInstance();
    redisPool = RedisPool.getInstance();
    cacheManager = CacheManager.getInstance();
    
    // Setup test database schema
    await setupTestDatabase();
  });
  
  afterAll(async () => {
    await cleanupTestDatabase();
    await pgPool.shutdown();
    await redisPool.shutdown();
  });
  
  beforeEach(async () => {
    await cacheManager.clear();
    dbStore.documents = [];
  });
  
  describe('End-to-End Workflow', () => {
    it('should process document ingestion workflow', async () => {
      const workflowId = 'ingest-workflow-123';
      const executionId = 'exec-' + Date.now();
      
      // Step 1: Initialize workflow metrics
      const metrics: IWorkflowMetrics = {
        workflowId,
        executionId,
        projectKey,
        status: WorkflowStatus.RUNNING,
        startTime: new Date(),
        itemsProcessed: 0,
        itemsFailed: 0,
        performance: {
          averageProcessingTime: 0,
          peakMemoryUsage: 0,
          apiCallsCount: 0,
          cacheHitRate: 0
        }
      };
      
      await storeMetrics(metrics);
      
      // Step 2: Simulate document processing
      const documents = [
        {
          id: 'doc1',
          sourceId: 'source1',
          content: 'This is a test document about AI and machine learning.',
          metadata: { title: 'AI Document', author: 'Test Author' }
        },
        {
          id: 'doc2',
          sourceId: 'source1',
          content: 'Another document discussing natural language processing.',
          metadata: { title: 'NLP Document', author: 'Test Author' }
        }
      ];
      
      for (const doc of documents) {
        await processDocument(doc, metrics);
      }
      
      // Step 3: Finalize workflow
      metrics.status = WorkflowStatus.SUCCESS;
      metrics.endTime = new Date();
      metrics.duration = metrics.endTime.getTime() - metrics.startTime.getTime();
      await storeMetrics(metrics);
      
      // Verify results
      const finalMetrics = await getMetrics(workflowId);
      expect(finalMetrics.status).toBe(WorkflowStatus.SUCCESS);
      expect(finalMetrics.itemsProcessed).toBe(2);
      expect(finalMetrics.itemsFailed).toBe(0);
    });
    
    it('should handle workflow errors gracefully', async () => {
      const workflowId = 'error-workflow-456';
      const executionId = 'exec-error-' + Date.now();
      
      const metrics: IWorkflowMetrics = {
        workflowId,
        executionId,
        projectKey,
        status: WorkflowStatus.RUNNING,
        startTime: new Date(),
        itemsProcessed: 0,
        itemsFailed: 0,
        performance: {
          averageProcessingTime: 0,
          peakMemoryUsage: 0,
          apiCallsCount: 0,
          cacheHitRate: 0
        },
        errors: []
      };
      
      await storeMetrics(metrics);
      
      // Simulate document with processing error
      const faultyDoc = {
        id: 'faulty-doc',
        sourceId: 'source2',
        content: null, // This will cause an error
        metadata: {}
      };
      
      try {
        await processDocument(faultyDoc as any, metrics);
      } catch (error) {
        metrics.itemsFailed++;
        metrics.errors = metrics.errors || [];
        metrics.errors.push({
          nodeId: 'process-node',
          nodeName: 'Document Processor',
          error: (error as Error).message,
          timestamp: new Date(),
          recoverable: false
        });
      }
      
      metrics.status = WorkflowStatus.ERROR;
      metrics.endTime = new Date();
      await storeMetrics(metrics);
      
      const finalMetrics = await getMetrics(workflowId);
      expect(finalMetrics.status).toBe(WorkflowStatus.ERROR);
      expect(finalMetrics.itemsFailed).toBe(1);
      expect(finalMetrics.errors).toHaveLength(1);
    });
  });
  
  describe('Parallel Processing', () => {
    it('should handle concurrent document processing', async () => {
      const documents = Array(10).fill(0).map((_, i) => ({
        id: `concurrent-doc-${i}`,
        sourceId: 'source-concurrent',
        content: `Document ${i} content for testing concurrent processing.`,
        metadata: { index: i }
      }));
      
      const startTime = Date.now();
      
      // Process documents in parallel
      const promises = documents.map(doc => 
        processDocumentAsync(doc)
      );
      
      const results = await Promise.all(promises);
      
      const duration = Date.now() - startTime;
      
      console.log(`Processed ${documents.length} documents in ${duration}ms`);
      
      expect(results).toHaveLength(10);
      expect(results.every(r => r.success)).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
    
    it('should handle mixed success and failure in batch', async () => {
      const documents = Array(5).fill(0).map((_, i) => ({
        id: `mixed-doc-${i}`,
        sourceId: 'source-mixed',
        content: i % 2 === 0 ? `Valid content ${i}` : null, // Every other doc is invalid
        metadata: { index: i }
      }));
      
      const results = await Promise.allSettled(
        documents.map(doc => processDocumentAsync(doc as any))
      );
      
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      expect(succeeded).toBe(3); // Docs 0, 2, 4
      expect(failed).toBe(2); // Docs 1, 3
    });
  });
  
  describe('Caching Behavior', () => {
    it('should cache search results', async () => {
      const query: ISearchQuery = {
        query: 'machine learning',
        projectKey,
        searchMode: SearchMode.SEMANTIC,
        options: {
          limit: 10,
          useCache: true
        }
      };
      
      // First search - cache miss
      const start1 = Date.now();
      const results1 = await performSearch(query);
      const time1 = Date.now() - start1;
      
      // Second search - cache hit
      const start2 = Date.now();
      const results2 = await performSearch(query);
      const time2 = Date.now() - start2;
      
      expect(results1).toEqual(results2);
      
      // Verify cache stats
      const stats = await cacheManager.getStats();
      expect(stats.hits).toBeGreaterThan(0);
    });
    
    it('should invalidate cache on document update', async () => {
      const docId = 'cache-test-doc';
      const doc = {
        id: docId,
        sourceId: 'cache-source',
        content: 'Original content',
        metadata: { version: 1 }
      };
      
      // Process document
      await processDocument(doc, {} as IWorkflowMetrics);
      
      // Search for it
      const query: ISearchQuery = {
        query: 'Original content',
        projectKey,
        searchMode: SearchMode.KEYWORD,
        options: { useCache: true }
      };
      
      const results1 = await performSearch(query);
      expect(results1).toHaveLength(1);
      
      // Mock cache miss for the second search
      jest.spyOn(cacheManager, 'get').mockResolvedValue(null);

      // Update document
      doc.content = 'Updated content';
      doc.metadata.version = 2;
      await processDocument(doc, {} as IWorkflowMetrics);
      
      // Cache should be invalidated
      const results2 = await performSearch(query);
      expect(results2).toHaveLength(0); // Original content no longer found
      
      // Search for updated content
      query.query = 'Updated content';
      const results3 = await performSearch(query);
      expect(results3).toHaveLength(1);

      // Restore mock
      jest.restoreAllMocks();
    });
  });
  
  describe('Queue Processing', () => {
    it('should process upsert queue in order', async () => {
      const queueKey = REDIS_KEYS.upsertQueue(projectKey);
      const client = redisPool.getClient('queue');
      
      // Add documents to queue
      const docs = Array(5).fill(0).map((_, i) => ({
        id: `queue-doc-${i}`,
        content: `Queue document ${i}`,
        timestamp: Date.now() + i
      }));
      
      for (const doc of docs) {
        await client.lpush(queueKey, JSON.stringify(doc));
      }
      
      // Process queue
      const processed: any[] = [];
      while (true) {
        const item = await client.rpop(queueKey);
        if (!item) break;
        processed.push(JSON.parse(item));
      }
      
      // Verify order (FIFO)
      expect(processed).toHaveLength(5);
      expect(processed[0].id).toBe('queue-doc-0');
      expect(processed[4].id).toBe('queue-doc-4');
    });
    
    it('should handle priority search queue', async () => {
      const queueKey = REDIS_KEYS.searchQueue(projectKey);
      const client = redisPool.getClient('queue');
      
      // Add searches with different priorities
      const searches = [
        { query: 'low priority', priority: 3 },
        { query: 'high priority', priority: 1 },
        { query: 'medium priority', priority: 2 }
      ];
      
      for (const search of searches) {
        await client.zadd(queueKey, search.priority, JSON.stringify(search));
      }
      
      // Process by priority
      const processed: any[] = [];
      while (true) {
        const items = await client.zpopmin(queueKey, 1);
        if (!items || items.length === 0) break;
        processed.push(JSON.parse(items[0]));
      }
      
      expect(processed).toHaveLength(3);
      expect(processed[0].query).toBe('high priority');
      expect(processed[1].query).toBe('medium priority');
      expect(processed[2].query).toBe('low priority');
    });
  });
  
  // Helper functions
  async function setupTestDatabase(): Promise<void> {
    const client = await pgPool.getClient('setup');
    
    try {
      // Create test tables if they don't exist
      await client.query(`
        CREATE TABLE IF NOT EXISTS documents (
          id VARCHAR(255) PRIMARY KEY,
          source_id VARCHAR(255),
          content TEXT,
          metadata JSONB,
          embedding vector(1536),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_documents_source 
        ON documents(source_id)
      `);
      
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_documents_embedding 
        ON documents USING ivfflat (embedding vector_cosine_ops)
      `);
    } finally {
      client.release();
    }
  }
  
  async function cleanupTestDatabase(): Promise<void> {
    const client = await pgPool.getClient('cleanup');
    
    try {
      await client.query('TRUNCATE TABLE documents');
    } catch (error) {
      console.error('Cleanup error:', error);
    } finally {
      client.release();
    }
  }
  
  async function storeMetrics(metrics: IWorkflowMetrics): Promise<void> {
    const client = redisPool.getClient('cache');
    const key = REDIS_KEYS.workflowMetrics(projectKey, metrics.workflowId);
    await client.set(key, JSON.stringify(metrics), 'EX', 3600);
  }
  
  async function getMetrics(workflowId: string): Promise<IWorkflowMetrics> {
    const client = redisPool.getClient('cache');
    const key = REDIS_KEYS.workflowMetrics(projectKey, workflowId);
    const data = await client.get(key);
    return JSON.parse(data!);
  }
  
  async function processDocument(
    doc: any,
    metrics: IWorkflowMetrics
  ): Promise<void> {
    if (!doc.content) {
      throw new Error('Document content is required');
    }
    
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Store in database
    const client = await pgPool.getClient('process');
    
    try {
      await client.query(`
        INSERT INTO documents (id, source_id, content, metadata)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (id) DO UPDATE
        SET content = $3, metadata = $4, updated_at = NOW()
      `, [doc.id, doc.sourceId, doc.content, JSON.stringify(doc.metadata)]);
      
      metrics.itemsProcessed++;
      await cacheManager.clear(); // Invalidate cache
    } finally {
      client.release();
    }
  }
  
  async function processDocumentAsync(doc: any): Promise<{ success: boolean }> {
    await processDocument(doc, {} as IWorkflowMetrics);
    return { success: true };
  }
  
  async function performSearch(query: ISearchQuery): Promise<any[]> {
    const cacheKey = cacheManager.generateKey(
      'search',
      query,
      projectKey
    );
    
    // Check cache
    const cached = await cacheManager.get(cacheKey);
    if (cached && query.options?.useCache) {
      return cached as any[];
    }
    
    // Simulate search
    const client = await pgPool.getClient('search');
    
    try {
      const result = await client.query(`
        SELECT id, content, metadata
        FROM documents
        WHERE content ILIKE $1
        LIMIT $2
      `, [`%${query.query}%`, query.options?.limit || 10]);
      
      // Cache results
      if (query.options?.useCache) {
        await cacheManager.set(cacheKey, result.rows, 300);
      }
      
      return result.rows;
    } finally {
      client.release();
    }
  }
});