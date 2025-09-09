-- LightRAG Database Schema for ASB

-- Entities table
CREATE TABLE IF NOT EXISTS lightrag_entities (
    id VARCHAR(32) PRIMARY KEY,
    name TEXT NOT NULL,
    type VARCHAR(50),
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create text search index
CREATE INDEX IF NOT EXISTS idx_lightrag_entities_search 
ON lightrag_entities USING gin(to_tsvector('turkish', name || ' ' || COALESCE(description, '')));

-- Relationships table
CREATE TABLE IF NOT EXISTS lightrag_relationships (
    id VARCHAR(32) PRIMARY KEY,
    source_id VARCHAR(32) REFERENCES lightrag_entities(id),
    target_id VARCHAR(32) REFERENCES lightrag_entities(id),
    type VARCHAR(100),
    description TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for relationships
CREATE INDEX IF NOT EXISTS idx_lightrag_rel_source ON lightrag_relationships(source_id);
CREATE INDEX IF NOT EXISTS idx_lightrag_rel_target ON lightrag_relationships(target_id);
CREATE INDEX IF NOT EXISTS idx_lightrag_rel_type ON lightrag_relationships(type);

-- Facts table
CREATE TABLE IF NOT EXISTS lightrag_facts (
    id VARCHAR(32) PRIMARY KEY,
    fact TEXT NOT NULL,
    related_entities JSONB,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create text search index for facts
CREATE INDEX IF NOT EXISTS idx_lightrag_facts_search 
ON lightrag_facts USING gin(to_tsvector('turkish', fact));

-- Create function to update timestamp
CREATE OR REPLACE FUNCTION update_lightrag_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for entities
CREATE TRIGGER update_lightrag_entities_timestamp
BEFORE UPDATE ON lightrag_entities
FOR EACH ROW
EXECUTE FUNCTION update_lightrag_timestamp();