CREATE INDEX IF NOT EXISTS embedding_vector_idx 
ON embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100)
