# Gemini - Performance & Optimization Tasks

## 🎯 Remaining Phase 3 Tasks

### 1. Create Hybrid Search Indexes (Priority: HIGH)
```sql
-- Execute in PostgreSQL
CREATE INDEX idx_documents_content_trgm ON documents USING gin(content gin_trgm_ops);
CREATE INDEX idx_documents_embedding ON documents USING ivfflat(embedding vector_cosine_ops);
CREATE INDEX idx_documents_source_created ON documents(source_id, created_at DESC);
CREATE INDEX idx_documents_metadata ON documents USING gin(metadata);

-- Compound index for hybrid search
CREATE INDEX idx_documents_hybrid ON documents(source_id, doc_hash, created_at DESC) 
INCLUDE (content, embedding, metadata);
```

### 2. Redis Cache Integration
```typescript
// Update shared/cache-manager.ts
class HybridSearchCache {
  private readonly SEARCH_TTL = 3600; // 1 hour
  private readonly EMBEDDING_TTL = 86400; // 24 hours
  
  async cacheSearchResults(query: string, results: any[], ttl?: number) {
    const key = `search:${this.hashQuery(query)}`;
    await this.redis.setex(key, ttl || this.SEARCH_TTL, JSON.stringify(results));
  }
  
  async getCachedSearch(query: string): Promise<any[] | null> {
    const key = `search:${this.hashQuery(query)}`;
    const cached = await this.redis.get(key);
    return cached ? JSON.parse(cached) : null;
  }
  
  async warmCache(popularQueries: string[]) {
    // Pre-compute results for popular queries
  }
}
```

### 3. Performance Benchmarks
```typescript
// Create benchmark/hybrid-search.benchmark.ts
import { performance } from 'perf_hooks';

export async function runHybridSearchBenchmark() {
  const testQueries = [
    "machine learning algorithms",
    "natural language processing",
    "semantic search optimization",
    // Add more test queries
  ];
  
  const results = {
    vectorSearch: [],
    keywordSearch: [],
    hybridSearch: [],
    cachedSearch: []
  };
  
  // Run benchmarks and generate report
}
```

### 4. Query Optimization
- Implement query result caching
- Add connection pooling optimization
- Implement batch embedding generation
- Add query planning and execution stats

## 📊 Performance Targets
- Search latency: < 50ms (currently 85ms)
- Cache hit rate: > 80% (currently 62%)
- Concurrent queries: 100 QPS
- Index build time: < 5 minutes for 100k docs
