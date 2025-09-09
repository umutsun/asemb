-- ASEMB Database Migration Script
-- Includes all indexes from URGENT_TODO.md and optimization commands

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create indexes for embeddings table
CREATE INDEX IF NOT EXISTS idx_embeddings_vector 
  ON embeddings USING ivfflat (embedding vector_l2_ops)
  WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_embeddings_source_id 
  ON embeddings(source_id);

CREATE INDEX IF NOT EXISTS idx_embeddings_created_at 
  ON embeddings(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_embeddings_workspace 
  ON embeddings((metadata->>'workspace'));

-- Create indexes for chunks table
CREATE INDEX IF NOT EXISTS idx_chunks_document_id 
  ON chunks(document_id);

-- Text search index for better hybrid search performance
CREATE INDEX IF NOT EXISTS idx_embeddings_content_gin 
  ON embeddings USING gin(to_tsvector('english', text));

-- Additional performance indexes
CREATE INDEX IF NOT EXISTS idx_embeddings_metadata 
  ON embeddings USING gin(metadata);

CREATE INDEX IF NOT EXISTS idx_embeddings_status 
  ON embeddings(status);

CREATE INDEX IF NOT EXISTS idx_embeddings_embedding_type 
  ON embeddings(embedding_type);

-- Optimize tables with VACUUM ANALYZE
VACUUM ANALYZE embeddings;
VACUUM ANALYZE chunks;
VACUUM ANALYZE documents;

-- Update statistics for query planner
ANALYZE embeddings;
ANALYZE chunks;
ANALYZE documents;

-- Verify indexes were created
SELECT 
  tablename, 
  indexname, 
  indexdef 
FROM pg_indexes 
WHERE tablename IN ('embeddings', 'chunks', 'documents')
ORDER BY tablename, indexname;