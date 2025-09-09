-- Schema for LightRAG v2 - PostgreSQL Graph Implementation

-- Create a dedicated schema for graph data to avoid conflicts
CREATE SCHEMA IF NOT EXISTS lightrag;

-- Table to store all unique entities (nodes in the graph)
CREATE TABLE IF NOT EXISTS lightrag.entities (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type VARCHAR(50) NOT NULL, -- e.g., 'Person', 'Organization', 'Law', 'Concept'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(name, type) -- Ensure each entity is unique by its name and type
);

-- Table to store relationships between entities (edges in the graph)
CREATE TABLE IF NOT EXISTS lightrag.relationships (
    id SERIAL PRIMARY KEY,
    source_entity_id INTEGER NOT NULL REFERENCES lightrag.entities(id) ON DELETE CASCADE,
    target_entity_id INTEGER NOT NULL REFERENCES lightrag.entities(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- e.g., 'RELATED_TO', 'WORKS_FOR', 'CITES_LAW'
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_entity_id, target_entity_id, type) -- Avoid duplicate relationships
);

-- Join table to link entities to the documents they appear in
-- Assumes a `documents` table exists, e.g., `rag_data.documents`
CREATE TABLE IF NOT EXISTS lightrag.entity_documents (
    entity_id INTEGER NOT NULL REFERENCES lightrag.entities(id) ON DELETE CASCADE,
    document_id INTEGER NOT NULL, -- Assuming document IDs are integers. Adjust if they are UUIDs or other types.
    -- If your documents table has a foreign key constraint, you can add it here:
    -- FOREIGN KEY (document_id) REFERENCES rag_data.documents(id) ON DELETE CASCADE,
    PRIMARY KEY (entity_id, document_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_entities_name ON lightrag.entities(name);
CREATE INDEX IF NOT EXISTS idx_entities_type ON lightrag.entities(type);
CREATE INDEX IF NOT EXISTS idx_relationships_source ON lightrag.relationships(source_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_target ON lightrag.relationships(target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON lightrag.relationships(type);
CREATE INDEX IF NOT EXISTS idx_entity_documents_document_id ON lightrag.entity_documents(document_id);

COMMIT;

-- Log completion
-- (This is a comment, but in a script you might insert into a migrations table)
-- MIGRATION '001_create_graph_schema.sql' APPLIED SUCCESSFULLY.
