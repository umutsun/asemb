# Database Schema Documentation

## Overview
PostgreSQL database with pgvector extension for semantic search capabilities.

## Core Tables

### 1. sources
Stores information about data sources (Google Docs, PostgreSQL, Web).

```sql
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('google_docs', 'postgres', 'web')),
  config JSONB NOT NULL,
  status VARCHAR(50) DEFAULT 'active',
  last_sync TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sources_type ON sources(type);
CREATE INDEX idx_sources_status ON sources(status);
CREATE INDEX idx_sources_config ON sources USING gin(config);
```

**Config Structure by Type:**

Google Docs:
```json
{
  "documentId": "string",
  "credentials": "encrypted_string",
  "syncInterval": "number (minutes)",
  "includeComments": "boolean"
}
```

PostgreSQL:
```json
{
  "connectionString": "encrypted_string",
  "query": "string",
  "updateColumn": "string",
  "syncInterval": "number (minutes)"
}
```

Web:
```json
{
  "url": "string",
  "selector": "string (CSS selector)",
  "crawlDepth": "number",
  "syncInterval": "number (minutes)"
}
```

### 2. embeddings
Stores text chunks and their vector embeddings.

```sql
CREATE TABLE embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536) NOT NULL,
  metadata JSONB DEFAULT '{}',
  chunk_index INTEGER NOT NULL,
  total_chunks INTEGER NOT NULL,
  token_count INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_embeddings_source ON embeddings(source_id);
CREATE INDEX idx_embeddings_vector ON embeddings 
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_embeddings_metadata ON embeddings USING gin(metadata);
CREATE INDEX idx_embeddings_created ON embeddings(created_at DESC);
```

### 3. sync_logs
Tracks synchronization history and status.

```sql
CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  records_processed INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_sync_logs_source ON sync_logs(source_id);
CREATE INDEX idx_sync_logs_status ON sync_logs(status);
CREATE INDEX idx_sync_logs_started ON sync_logs(started_at DESC);
```

### 4. queries
Stores search queries for analytics.

```sql
CREATE TABLE queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text TEXT NOT NULL,
  query_embedding vector(1536),
  results_count INTEGER,
  top_result_score FLOAT,
  execution_time_ms INTEGER,
  user_id VARCHAR(255),
  session_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_queries_user ON queries(user_id);
CREATE INDEX idx_queries_session ON queries(session_id);
CREATE INDEX idx_queries_created ON queries(created_at DESC);
CREATE INDEX idx_queries_metadata ON queries USING gin(metadata);
```

### 5. api_usage
Tracks API usage for cost monitoring.

```sql
CREATE TABLE api_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(100) NOT NULL,
  operation VARCHAR(50) NOT NULL,
  tokens_used INTEGER,
  cost_usd DECIMAL(10, 6),
  source_id UUID REFERENCES sources(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_api_usage_provider ON api_usage(provider);
CREATE INDEX idx_api_usage_created ON api_usage(created_at DESC);
CREATE INDEX idx_api_usage_source ON api_usage(source_id);
```

### 6. chunks_cache
Temporary storage for processing large documents.

```sql
CREATE TABLE chunks_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  chunk_hash VARCHAR(64) UNIQUE NOT NULL,
  content TEXT NOT NULL,
  position INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}',
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '7 days')
);

-- Indexes
CREATE INDEX idx_chunks_cache_source ON chunks_cache(source_id);
CREATE INDEX idx_chunks_cache_hash ON chunks_cache(chunk_hash);
CREATE INDEX idx_chunks_cache_processed ON chunks_cache(processed);
CREATE INDEX idx_chunks_cache_expires ON chunks_cache(expires_at);
```

## Views

### 1. source_statistics
Aggregated statistics per source.

```sql
CREATE VIEW source_statistics AS
SELECT 
  s.id,
  s.name,
  s.type,
  s.status,
  COUNT(DISTINCT e.id) as total_embeddings,
  COUNT(DISTINCT e.content) as unique_chunks,
  AVG(e.token_count) as avg_tokens_per_chunk,
  MAX(e.created_at) as last_embedding_created,
  s.last_sync,
  (
    SELECT COUNT(*) 
    FROM sync_logs sl 
    WHERE sl.source_id = s.id 
    AND sl.status = 'success'
  ) as successful_syncs,
  (
    SELECT COUNT(*) 
    FROM sync_logs sl 
    WHERE sl.source_id = s.id 
    AND sl.status = 'failed'
  ) as failed_syncs
FROM sources s
LEFT JOIN embeddings e ON s.id = e.source_id
GROUP BY s.id;
```

### 2. daily_usage
Daily API usage aggregation.

```sql
CREATE VIEW daily_usage AS
SELECT 
  DATE(created_at) as date,
  provider,
  model,
  SUM(tokens_used) as total_tokens,
  SUM(cost_usd) as total_cost,
  COUNT(*) as api_calls
FROM api_usage
GROUP BY DATE(created_at), provider, model
ORDER BY date DESC;
```

## Functions

### 1. search_embeddings
Semantic search function with metadata filtering.

```sql
CREATE OR REPLACE FUNCTION search_embeddings(
  query_embedding vector(1536),
  similarity_threshold FLOAT DEFAULT 0.7,
  limit_results INTEGER DEFAULT 10,
  source_filter UUID[] DEFAULT NULL,
  metadata_filter JSONB DEFAULT NULL
)
RETURNS TABLE(
  id UUID,
  source_id UUID,
  content TEXT,
  similarity FLOAT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.source_id,
    e.content,
    1 - (e.embedding <=> query_embedding) as similarity,
    e.metadata
  FROM embeddings e
  WHERE 
    (source_filter IS NULL OR e.source_id = ANY(source_filter))
    AND (metadata_filter IS NULL OR e.metadata @> metadata_filter)
    AND 1 - (e.embedding <=> query_embedding) > similarity_threshold
  ORDER BY e.embedding <=> query_embedding
  LIMIT limit_results;
END;
$$ LANGUAGE plpgsql;
```

### 2. update_updated_at
Trigger function to update timestamps.

```sql
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables
CREATE TRIGGER update_sources_updated_at
  BEFORE UPDATE ON sources
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_embeddings_updated_at
  BEFORE UPDATE ON embeddings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 3. cleanup_expired_cache
Cleanup function for expired cache entries.

```sql
CREATE OR REPLACE FUNCTION cleanup_expired_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM chunks_cache
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;
```

## Migrations

### Initial Setup
```sql
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Set up text search configuration
CREATE TEXT SEARCH CONFIGURATION IF NOT EXISTS simple_unaccent (COPY = simple);
```

### Performance Tuning
```sql
-- Adjust PostgreSQL settings for vector operations
ALTER SYSTEM SET shared_preload_libraries = 'vector';
ALTER SYSTEM SET effective_cache_size = '4GB';
ALTER SYSTEM SET maintenance_work_mem = '512MB';
ALTER SYSTEM SET work_mem = '50MB';

-- Vacuum and analyze regularly
VACUUM ANALYZE embeddings;
VACUUM ANALYZE sources;
```

## Security Considerations

1. **Encryption**: All sensitive config data (API keys, connection strings) must be encrypted
2. **Row-Level Security**: Implement RLS for multi-tenant scenarios
3. **Audit Logging**: Track all data modifications
4. **Backup Strategy**: Daily backups with point-in-time recovery
5. **Access Control**: Minimal privilege principle for database users

## Maintenance Tasks

### Daily
- Clean expired cache entries
- Update statistics: `ANALYZE;`

### Weekly
- Vacuum tables: `VACUUM ANALYZE;`
- Check index usage and efficiency
- Review slow query logs

### Monthly
- Reindex if needed: `REINDEX DATABASE;`
- Archive old sync logs
- Review and optimize query patterns