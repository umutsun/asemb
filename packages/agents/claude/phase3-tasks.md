# Claude - Phase 3 Tasks: Architecture & Error Handling

## 🎯 Your Mission
Lead the architectural improvements and standardize error handling across the entire ASEMB system.

## 📋 Priority Tasks

### 1. Design Manage Operation Architecture (HIGH)
**File:** `src/nodes/operations/manage.ts`

Create the architectural blueprint for manage operations:

```typescript
// Define the interface for manage operations
export interface ManageOperations {
  deleteBySourceId(sourceId: string, options?: DeleteOptions): Promise<DeleteResult>;
  getStatistics(workspace?: string): Promise<StatisticsResult>;
  cleanupOrphaned(options?: CleanupOptions): Promise<CleanupResult>;
  vacuum(options?: VacuumOptions): Promise<VacuumResult>;
  reindex(options?: ReindexOptions): Promise<ReindexResult>;
}

// Define response types
export interface DeleteResult {
  deleted: number;
  chunks_removed: number;
  time_ms: number;
}

export interface StatisticsResult {
  documents: number;
  chunks: number;
  sources: string[];
  storage_mb: number;
  index_health: 'healthy' | 'degraded' | 'critical';
}
```

### 2. Standardize Error Handling (HIGH)
**File:** `src/shared/error-handler.ts`

```typescript
export class ASEMBError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: any,
    public recoverable: boolean = false
  ) {
    super(message);
    this.name = 'ASEMBError';
  }
}

export enum ErrorCode {
  // Database errors
  DB_CONNECTION_FAILED = 'DB_001',
  DB_QUERY_FAILED = 'DB_002',
  DB_TRANSACTION_FAILED = 'DB_003',
  
  // Validation errors
  INVALID_INPUT = 'VAL_001',
  MISSING_REQUIRED = 'VAL_002',
  
  // Operation errors
  OPERATION_FAILED = 'OP_001',
  OPERATION_TIMEOUT = 'OP_002',
  
  // Search errors
  SEARCH_FAILED = 'SEARCH_001',
  NO_RESULTS = 'SEARCH_002',
}

// Error recovery strategies
export interface RecoveryStrategy {
  retry?: RetryConfig;
  fallback?: () => Promise<any>;
  notify?: NotificationConfig;
}
```

### 3. Redis Integration Pattern (MEDIUM)
**File:** `src/shared/cache-manager.ts`

Design the caching layer architecture:

```typescript
export class CacheManager {
  private redis: Redis;
  private ttl: number = 3600;
  
  async getCachedOrCompute<T>(
    key: string,
    computeFn: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    // Check cache first
    const cached = await this.get(key);
    if (cached) return cached;
    
    // Compute and cache
    const result = await computeFn();
    await this.set(key, result, options?.ttl || this.ttl);
    return result;
  }
  
  // Invalidation strategies
  async invalidatePattern(pattern: string): Promise<void> {
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
```

### 4. Update README with Architecture (MEDIUM)
**File:** `README.md`

Add comprehensive architecture documentation:
- System overview diagram
- Data flow documentation
- Error handling guide
- Performance considerations
- Security best practices

### 5. Create Workflow Examples (LOW)
**File:** `examples/workflows/`

Create example n8n workflows:
```json
{
  "name": "Document Processing Pipeline",
  "nodes": [
    {
      "type": "n8n-nodes-alice-semantic-bridge.webScrape",
      "name": "Fetch Content"
    },
    {
      "type": "n8n-nodes-alice-semantic-bridge.textChunk",
      "name": "Chunk Content"
    },
    {
      "type": "n8n-nodes-alice-semantic-bridge.pgvectorUpsert",
      "name": "Store Vectors"
    }
  ]
}
```

## 📊 Architecture Decisions to Document

### Database Schema Evolution
```sql
-- Add indexes for performance
CREATE INDEX idx_embeddings_source_id ON embeddings(source_id);
CREATE INDEX idx_embeddings_created_at ON embeddings(created_at DESC);
CREATE INDEX idx_chunks_document_id ON chunks(document_id);

-- Add composite indexes for common queries
CREATE INDEX idx_embeddings_source_created 
  ON embeddings(source_id, created_at DESC);
```

### Connection Pooling Strategy
```typescript
export const connectionConfig = {
  postgres: {
    min: 5,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  },
  redis: {
    minIdle: 2,
    maxIdle: 10,
    enableReadyCheck: true,
    retryStrategy: (times: number) => Math.min(times * 50, 2000),
  }
};
```

### Performance Optimization Guidelines
1. **Query Optimization**
   - Use prepared statements
   - Implement query result caching
   - Add EXPLAIN ANALYZE for slow queries

2. **Memory Management**
   - Stream large results
   - Implement pagination
   - Clear unused cache entries

3. **Concurrency Control**
   - Use connection pooling
   - Implement rate limiting
   - Add circuit breakers

## 🔍 Code Review Checklist

### For Every PR:
- [ ] TypeScript strict mode compliant
- [ ] Error handling follows standards
- [ ] Unit tests included
- [ ] JSDoc comments added
- [ ] No security vulnerabilities
- [ ] Performance impact assessed

### Security Considerations:
- [ ] Input sanitization
- [ ] SQL injection prevention
- [ ] Rate limiting implemented
- [ ] Audit logging added

## 📈 Success Metrics

Your architectural improvements should achieve:
- Error recovery rate > 95%
- Cache hit rate > 60%
- Query performance < 50ms p95
- Zero security vulnerabilities
- 100% critical path test coverage

## 🔗 Coordination Points

### With Codex:
- Review manage operation implementations
- Ensure error codes match API responses
- Validate connection pooling works

### With Gemini:
- Align on performance requirements
- Review caching strategy
- Coordinate on user-facing errors

### With DeepSeek:
- Provide test requirements
- Document architectural decisions
- Review security test cases

## 📅 Timeline

### Day 1-2:
- [x] Review current architecture
- [ ] Design manage operations
- [ ] Create error handling framework

### Day 3-4:
- [ ] Implement Redis patterns
- [ ] Update documentation
- [ ] Create workflow examples

### Day 5:
- [ ] Code review
- [ ] Performance testing
- [ ] Security audit

## 💡 Notes

- Focus on making the system resilient
- Every error should be recoverable when possible
- Cache invalidation is critical - design carefully
- Document all architectural decisions in ADRs
- Consider backward compatibility

## 🚨 Blockers to Watch

- Database connection limits
- Redis memory constraints
- TypeScript version conflicts
- n8n API changes

Remember: Your architectural decisions will impact the entire system. Think long-term, build for scale, and prioritize reliability.