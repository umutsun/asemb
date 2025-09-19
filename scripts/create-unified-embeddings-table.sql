-- Create unified_embeddings table in the rag_chatbot database
-- This table stores all embeddings in a unified format for easy retrieval

-- First, drop the table if it exists to start fresh
DROP TABLE IF EXISTS unified_embeddings;

-- Create the unified_embeddings table
CREATE TABLE unified_embeddings (
    id SERIAL PRIMARY KEY,
    source_table VARCHAR(100) NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    source_id INTEGER NOT NULL,
    source_name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    embedding VECTOR(1536) NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Add constraints
    CONSTRAINT unique_source_record UNIQUE (source_table, source_id)
);

-- Create indexes for better performance
CREATE INDEX idx_unified_embeddings_source_table ON unified_embeddings(source_table);
CREATE INDEX idx_unified_embeddings_source_type ON unified_embeddings(source_type);
CREATE INDEX idx_unified_embeddings_source_id ON unified_embeddings(source_id);
CREATE INDEX idx_unified_embeddings_source_name ON unified_embeddings(source_name);
CREATE INDEX idx_unified_embeddings_created_at ON unified_embeddings(created_at);

-- Create a vector index for similarity search
CREATE INDEX idx_unified_embeddings_embedding_vector ON unified_embeddings
USING hnsw (embedding vector_cosine_ops);

-- Add trigger for automatic updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_unified_embeddings_updated_at
    BEFORE UPDATE ON unified_embeddings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments
COMMENT ON TABLE unified_embeddings IS 'Unified storage for all document embeddings across different source tables';
COMMENT ON COLUMN unified_embeddings.source_table IS 'The name of the source table (e.g., sorucevap, makaleler)';
COMMENT ON COLUMN unified_embeddings.source_type IS 'Type of the source (document, scraped_page, etc.)';
COMMENT ON COLUMN unified_embeddings.source_id IS 'The ID of the record in the source table';
COMMENT ON COLUMN unified_embeddings.source_name IS 'Human-readable name of the source';
COMMENT ON COLUMN unified_embeddings.content IS 'The text content that was embedded';
COMMENT ON COLUMN unified_embeddings.embedding IS 'The vector embedding of the content';
COMMENT ON COLUMN unified_embeddings.metadata IS 'Additional metadata including tokens, model info, etc.';