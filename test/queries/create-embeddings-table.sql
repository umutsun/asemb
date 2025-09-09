CREATE TABLE IF NOT EXISTS embeddings (
  id SERIAL PRIMARY KEY,
  source_id VARCHAR(255),
  content TEXT,
  embedding vector(1536),
  chunk_index INTEGER,
  total_chunks INTEGER,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(source_id, chunk_index)
)
