-- Template for PostgreSQL queries with pgvector support
-- {{QueryName}}: {{Description}}

-- Basic CRUD Operations Template
-- ================================

-- CREATE: Insert new record with embedding
INSERT INTO {{table_name}} (
  id,
  content,
  metadata,
  embedding,
  created_at,
  updated_at
) VALUES (
  gen_random_uuid(),
  $1,  -- content
  $2,  -- metadata (JSONB)
  $3,  -- embedding vector
  NOW(),
  NOW()
) RETURNING *;

-- READ: Select with vector similarity search
WITH vector_search AS (
  SELECT 
    id,
    content,
    metadata,
    embedding,
    1 - (embedding <=> $1::vector) AS similarity,  -- Cosine similarity
    created_at,
    updated_at
  FROM {{table_name}}
  WHERE 1 - (embedding <=> $1::vector) > $2  -- Similarity threshold
  ORDER BY embedding <=> $1::vector  -- Order by distance
  LIMIT $3  -- Result limit
)
SELECT * FROM vector_search;

-- UPDATE: Update record with new embedding
UPDATE {{table_name}}
SET 
  content = COALESCE($2, content),
  metadata = COALESCE($3, metadata),
  embedding = COALESCE($4::vector, embedding),
  updated_at = NOW()
WHERE id = $1
RETURNING *;

-- DELETE: Remove record
DELETE FROM {{table_name}}
WHERE id = $1
RETURNING id;

-- Advanced Queries Template
-- ================================

-- Hybrid search: Combine vector similarity with text search
WITH hybrid_search AS (
  SELECT 
    id,
    content,
    metadata,
    embedding,
    -- Vector similarity score
    1 - (embedding <=> $1::vector) AS vector_score,
    -- Full text search score
    ts_rank(to_tsvector('english', content), plainto_tsquery('english', $2)) AS text_score,
    -- Combined score (adjust weights as needed)
    (0.7 * (1 - (embedding <=> $1::vector))) + 
    (0.3 * ts_rank(to_tsvector('english', content), plainto_tsquery('english', $2))) AS combined_score,
    created_at,
    updated_at
  FROM {{table_name}}
  WHERE 
    -- Vector similarity threshold
    1 - (embedding <=> $1::vector) > $3
    -- Text search filter
    AND to_tsvector('english', content) @@ plainto_tsquery('english', $2)
  ORDER BY combined_score DESC
  LIMIT $4
)
SELECT * FROM hybrid_search;

-- Metadata filtering with vector search
SELECT 
  id,
  content,
  metadata,
  embedding,
  1 - (embedding <=> $1::vector) AS similarity
FROM {{table_name}}
WHERE 
  -- Vector similarity
  1 - (embedding <=> $1::vector) > $2
  -- JSONB metadata filters
  AND metadata @> $3::jsonb  -- Contains all specified key-value pairs
  AND metadata->>'category' = $4  -- Specific field match
  AND (metadata->>'score')::float > $5  -- Numeric comparison
ORDER BY embedding <=> $1::vector
LIMIT $6;

-- Batch insert with embeddings
INSERT INTO {{table_name}} (id, content, metadata, embedding, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  unnest($1::text[]),  -- Array of contents
  unnest($2::jsonb[]),  -- Array of metadata
  unnest($3::vector[]),  -- Array of embeddings
  NOW(),
  NOW()
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  metadata = EXCLUDED.metadata,
  embedding = EXCLUDED.embedding,
  updated_at = NOW();

-- Performance Optimization Queries
-- ================================

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_{{table_name}}_embedding 
ON {{table_name}} 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);  -- Adjust lists parameter based on data size

-- Create GIN index for JSONB metadata
CREATE INDEX IF NOT EXISTS idx_{{table_name}}_metadata 
ON {{table_name}} 
USING gin (metadata);

-- Create text search index
CREATE INDEX IF NOT EXISTS idx_{{table_name}}_content_search 
ON {{table_name}} 
USING gin (to_tsvector('english', content));

-- Analyze table for query optimization
ANALYZE {{table_name}};

-- Maintenance Queries
-- ================================

-- Vacuum and reindex for performance
VACUUM ANALYZE {{table_name}};
REINDEX TABLE {{table_name}};

-- Get table statistics
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  n_live_tup AS row_count,
  n_dead_tup AS dead_rows,
  last_vacuum,
  last_autovacuum
FROM pg_stat_user_tables
WHERE tablename = '{{table_name}}';

-- Check index usage
SELECT 
  indexname,
  idx_scan AS index_scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE tablename = '{{table_name}}'
ORDER BY idx_scan DESC;