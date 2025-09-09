-- Hybrid Search Indexes for ASEMB
-- Execute these in PostgreSQL to optimize search performance

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- 1. Trigram index for fuzzy text search
CREATE INDEX IF NOT EXISTS idx_documents_content_trgm 
ON documents USING gin(content gin_trgm_ops);

-- 2. Full-text search index
CREATE INDEX IF NOT EXISTS idx_documents_content_fts 
ON documents USING gin(to_tsvector('english', content));

-- 3. Vector similarity index (IVFFlat for large datasets)
CREATE INDEX IF NOT EXISTS idx_documents_embedding 
ON documents USING ivfflat(embedding vector_cosine_ops)
WITH (lists = 100);

-- 4. Compound index for filtering
CREATE INDEX IF NOT EXISTS idx_documents_source_created 
ON documents(source_id, created_at DESC);

-- 5. JSONB index for metadata queries
CREATE INDEX IF NOT EXISTS idx_documents_metadata 
ON documents USING gin(metadata);

-- 6. Covering index for hybrid search queries
CREATE INDEX IF NOT EXISTS idx_documents_hybrid 
ON documents(source_id, doc_hash, created_at DESC) 
INCLUDE (content, embedding, metadata);

-- 7. Index for chunk references
CREATE INDEX IF NOT EXISTS idx_documents_chunk_ref
ON documents(chunk_index, total_chunks, source_id);

-- Update table statistics for query planner
ANALYZE documents;

-- Create materialized view for popular searches (optional)
CREATE MATERIALIZED VIEW IF NOT EXISTS popular_search_cache AS
SELECT 
    content,
    embedding,
    metadata,
    source_id,
    1 - (embedding <=> (SELECT embedding FROM documents LIMIT 1)) as base_similarity
FROM documents
WHERE created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC
LIMIT 1000;

-- Create index on materialized view
CREATE INDEX IF NOT EXISTS idx_popular_search_cache_embedding 
ON popular_search_cache USING ivfflat(embedding vector_cosine_ops);

-- Function to calculate hybrid score
CREATE OR REPLACE FUNCTION calculate_hybrid_score(
    vector_score FLOAT,
    keyword_score FLOAT,
    vector_weight FLOAT DEFAULT 0.7,
    keyword_weight FLOAT DEFAULT 0.3
) RETURNS FLOAT AS $$
BEGIN
    RETURN (vector_score * vector_weight) + (keyword_score * keyword_weight);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Optimize PostgreSQL settings for vector search
-- Add these to postgresql.conf or set at session level:
-- SET ivfflat.probes = 10;  -- Increase for better recall
-- SET work_mem = '256MB';   -- Increase for large sorts
-- SET shared_buffers = '2GB'; -- Adjust based on available RAM

-- Create search statistics table
CREATE TABLE IF NOT EXISTS search_metrics (
    id SERIAL PRIMARY KEY,
    query_text TEXT,
    query_type VARCHAR(20), -- 'vector', 'keyword', 'hybrid'
    result_count INTEGER,
    execution_time_ms FLOAT,
    cache_hit BOOLEAN,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_search_metrics_created 
ON search_metrics(created_at DESC);

CREATE INDEX idx_search_metrics_query 
ON search_metrics(query_text, query_type);

-- Function to log search metrics
CREATE OR REPLACE FUNCTION log_search_metric(
    p_query_text TEXT,
    p_query_type VARCHAR(20),
    p_result_count INTEGER,
    p_execution_time_ms FLOAT,
    p_cache_hit BOOLEAN
) RETURNS VOID AS $$
BEGIN
    INSERT INTO search_metrics (
        query_text, 
        query_type, 
        result_count, 
        execution_time_ms, 
        cache_hit
    ) VALUES (
        p_query_text, 
        p_query_type, 
        p_result_count, 
        p_execution_time_ms, 
        p_cache_hit
    );
END;
$$ LANGUAGE plpgsql;

-- View for search performance analysis
CREATE OR REPLACE VIEW search_performance_stats AS
SELECT 
    query_type,
    COUNT(*) as total_queries,
    AVG(execution_time_ms) as avg_execution_time,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY execution_time_ms) as median_execution_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY execution_time_ms) as p95_execution_time,
    AVG(result_count) as avg_result_count,
    SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END)::FLOAT / COUNT(*) as cache_hit_rate,
    DATE_TRUNC('hour', created_at) as hour
FROM search_metrics
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY query_type, DATE_TRUNC('hour', created_at)
ORDER BY hour DESC, query_type;
