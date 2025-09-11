-- Migration history table for tracking all migration activities
CREATE TABLE IF NOT EXISTS migration_history (
    id SERIAL PRIMARY KEY,
    migration_id UUID DEFAULT gen_random_uuid() UNIQUE,
    source_type VARCHAR(50) NOT NULL, -- 'database', 'scraper', 'document', 'api'
    source_name VARCHAR(255) NOT NULL, -- table name, URL, file name, etc.
    database_name VARCHAR(100),
    table_name VARCHAR(100),
    total_records INTEGER NOT NULL,
    processed_records INTEGER DEFAULT 0,
    successful_records INTEGER DEFAULT 0,
    failed_records INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'paused'
    batch_size INTEGER,
    model_used VARCHAR(100) DEFAULT 'text-embedding-ada-002',
    tokens_used INTEGER DEFAULT 0,
    estimated_cost DECIMAL(10, 6) DEFAULT 0,
    error_message TEXT,
    metadata JSONB, -- Additional flexible data
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_seconds INTEGER,
    created_by VARCHAR(100) DEFAULT 'system',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster queries
CREATE INDEX idx_migration_history_status ON migration_history(status);
CREATE INDEX idx_migration_history_source ON migration_history(source_type, source_name);
CREATE INDEX idx_migration_history_created_at ON migration_history(created_at DESC);
CREATE INDEX idx_migration_history_migration_id ON migration_history(migration_id);

-- Document processing history
CREATE TABLE IF NOT EXISTS document_processing_history (
    id SERIAL PRIMARY KEY,
    migration_id UUID REFERENCES migration_history(migration_id),
    document_type VARCHAR(50), -- 'pdf', 'txt', 'html', 'doc', 'json'
    document_name VARCHAR(500),
    document_url TEXT,
    file_size_bytes BIGINT,
    content_length INTEGER,
    chunks_created INTEGER DEFAULT 0,
    embedding_dimensions INTEGER DEFAULT 1536,
    processing_time_ms INTEGER,
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scraper history with more details
CREATE TABLE IF NOT EXISTS scraper_history_detailed (
    id SERIAL PRIMARY KEY,
    migration_id UUID REFERENCES migration_history(migration_id),
    url TEXT NOT NULL,
    domain VARCHAR(255),
    page_title TEXT,
    content_type VARCHAR(100),
    content_length INTEGER,
    chunks_created INTEGER DEFAULT 0,
    links_found INTEGER DEFAULT 0,
    images_found INTEGER DEFAULT 0,
    scrape_depth INTEGER DEFAULT 0,
    response_time_ms INTEGER,
    status_code INTEGER,
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    metadata JSONB,
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Migration statistics view
CREATE OR REPLACE VIEW migration_statistics AS
SELECT 
    DATE(started_at) as migration_date,
    source_type,
    COUNT(*) as total_migrations,
    SUM(total_records) as total_records_processed,
    SUM(successful_records) as total_successful,
    SUM(failed_records) as total_failed,
    SUM(tokens_used) as total_tokens_used,
    SUM(estimated_cost) as total_cost,
    AVG(duration_seconds) as avg_duration_seconds,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_migrations,
    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_migrations
FROM migration_history
GROUP BY DATE(started_at), source_type
ORDER BY migration_date DESC;

-- Recent activity view
CREATE OR REPLACE VIEW recent_migration_activity AS
SELECT 
    migration_id,
    source_type,
    source_name,
    table_name,
    status,
    ROUND((processed_records::NUMERIC / NULLIF(total_records, 0)) * 100, 2) as progress_percentage,
    total_records,
    processed_records,
    tokens_used,
    estimated_cost,
    started_at,
    completed_at,
    CASE 
        WHEN status = 'processing' THEN 
            EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
        ELSE duration_seconds 
    END as duration_seconds
FROM migration_history
ORDER BY started_at DESC
LIMIT 100;