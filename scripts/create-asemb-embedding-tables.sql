-- ASEMB Database Embedding Infrastructure
-- This script creates all necessary tables and structures for the embedding system

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Main documents table to store all embeddings
CREATE TABLE IF NOT EXISTS public.documents (
    id SERIAL PRIMARY KEY,
    source_table VARCHAR(255) NOT NULL,
    source_id VARCHAR(255),
    title TEXT,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    embedding_model VARCHAR(100) DEFAULT 'text-embedding-ada-002',
    tokens_used INTEGER DEFAULT 0
);

-- Turkish Law Tables (Static copies in ASEMB)
CREATE TABLE IF NOT EXISTS public.ozelgeler (
    id SERIAL PRIMARY KEY,
    belge_no VARCHAR(255),
    tarih DATE,
    konu TEXT,
    ozet TEXT,
    madde_metni TEXT,
    ilgili_kanun VARCHAR(500),
    embedding vector(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.makaleler (
    id SERIAL PRIMARY KEY,
    baslik TEXT,
    yazar VARCHAR(500),
    yayim_tarihi DATE,
    dergi VARCHAR(500),
    icerik TEXT,
    ozet TEXT,
    anahtar_kelimeler TEXT,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.sorucevap (
    id SERIAL PRIMARY KEY,
    soru TEXT,
    cevap TEXT,
    kategori VARCHAR(255),
    etiketler TEXT,
    goruntuleme_sayisi INTEGER DEFAULT 0,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS public.danistay_kararlari (
    id SERIAL PRIMARY KEY,
    esas_no VARCHAR(255),
    karar_no VARCHAR(255),
    karar_tarihi DATE,
    daire VARCHAR(100),
    karar_ozeti TEXT,
    karar_metni TEXT,
    ilgili_mevzuat TEXT,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scraped web content table
CREATE TABLE IF NOT EXISTS public.scraped_content (
    id SERIAL PRIMARY KEY,
    url TEXT UNIQUE NOT NULL,
    title TEXT,
    content TEXT,
    html_content TEXT,
    metadata JSONB DEFAULT '{}',
    embedding vector(1536),
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chat history for context
CREATE TABLE IF NOT EXISTS public.chat_history (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255),
    user_message TEXT,
    assistant_message TEXT,
    context_used TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Embedding queue for batch processing
CREATE TABLE IF NOT EXISTS public.embedding_queue (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(255) NOT NULL,
    record_id INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    UNIQUE(table_name, record_id)
);

-- Embedding statistics
CREATE TABLE IF NOT EXISTS public.embedding_stats (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(255) NOT NULL,
    total_records INTEGER DEFAULT 0,
    embedded_records INTEGER DEFAULT 0,
    pending_records INTEGER DEFAULT 0,
    failed_records INTEGER DEFAULT 0,
    total_tokens_used INTEGER DEFAULT 0,
    estimated_cost DECIMAL(10, 6) DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(table_name)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_documents_source ON documents(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_documents_embedding ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ozelgeler_embedding ON ozelgeler USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_makaleler_embedding ON makaleler USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_sorucevap_embedding ON sorucevap USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_danistay_embedding ON danistay_kararlari USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_scraped_embedding ON scraped_content USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_embedding_queue_status ON embedding_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_chat_history_session ON chat_history(session_id, created_at DESC);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updating timestamps
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ozelgeler_updated_at BEFORE UPDATE ON ozelgeler
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_makaleler_updated_at BEFORE UPDATE ON makaleler
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sorucevap_updated_at BEFORE UPDATE ON sorucevap
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_danistay_updated_at BEFORE UPDATE ON danistay_kararlari
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_scraped_updated_at BEFORE UPDATE ON scraped_content
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to search across all embedded content
CREATE OR REPLACE FUNCTION search_embeddings(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 5
)
RETURNS TABLE (
    source_table varchar,
    source_id varchar,
    title text,
    content text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.source_table,
        d.source_id,
        d.title,
        d.content,
        1 - (d.embedding <=> query_embedding) as similarity
    FROM documents d
    WHERE d.embedding IS NOT NULL
        AND 1 - (d.embedding <=> query_embedding) > match_threshold
    ORDER BY d.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- View for monitoring embedding progress
CREATE OR REPLACE VIEW v_embedding_progress AS
SELECT 
    table_name,
    total_records,
    embedded_records,
    pending_records,
    failed_records,
    CASE 
        WHEN total_records > 0 THEN 
            ROUND((embedded_records::float / total_records::float) * 100, 2)
        ELSE 0 
    END as completion_percentage,
    total_tokens_used,
    estimated_cost,
    last_updated
FROM embedding_stats
ORDER BY table_name;

-- Grant permissions (adjust as needed)
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres;

COMMENT ON TABLE documents IS 'Central table for all document embeddings';
COMMENT ON TABLE ozelgeler IS 'Turkish tax rulings and official letters';
COMMENT ON TABLE makaleler IS 'Legal articles and publications';
COMMENT ON TABLE sorucevap IS 'Q&A pairs from legal forums';
COMMENT ON TABLE danistay_kararlari IS 'Council of State decisions';
COMMENT ON TABLE scraped_content IS 'Web scraped content with embeddings';
COMMENT ON TABLE embedding_queue IS 'Queue for batch embedding processing';
COMMENT ON TABLE embedding_stats IS 'Statistics for embedding operations';