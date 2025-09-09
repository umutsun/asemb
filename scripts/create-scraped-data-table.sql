-- Create scraped_data table for dynamic scraper results
CREATE TABLE IF NOT EXISTS scraped_data (
    id SERIAL PRIMARY KEY,
    url TEXT NOT NULL,
    title TEXT,
    content TEXT,
    content_chunks TEXT[],
    embeddings vector(1536)[],
    chunk_count INTEGER DEFAULT 0,
    scraping_mode VARCHAR(20) DEFAULT 'static',
    metadata JSONB DEFAULT '{}',
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX idx_scraped_data_url ON scraped_data(url);
CREATE INDEX idx_scraped_data_scraped_at ON scraped_data(scraped_at DESC);
CREATE INDEX idx_scraped_data_metadata ON scraped_data USING gin(metadata);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_scraped_data_updated_at BEFORE UPDATE
    ON scraped_data FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Grant permissions
GRANT ALL ON scraped_data TO postgres;
GRANT ALL ON scraped_data_id_seq TO postgres;
