-- Migration: Multimodal RAG — Cross-Modal (CLIP) vector space
-- Date: 2026-06-25
-- Description: Adds the media asset registry + the CLIP cross-modal embedding space
--              that lives ALONGSIDE the existing text space (unified_embeddings, vector(1536)).
--
--              Two tables:
--                * media_assets      — file registry + async processing status
--                * media_embeddings  — CLIP image<->text shared space, vector(1024), HNSW
--
--              Text-bridge (captions / transcripts) is NOT stored here; it flows into the
--              existing unified_embeddings (source_type='media') so BM25 + 1536 vector +
--              rerank keep working for free. See 20260218_bm25_search_vector.sql.
--
--              Everything is gated behind the `mediaEmbedding.enabled` setting (default
--              'false') so a system that runs this migration but does not turn the feature
--              on behaves byte-for-byte like before.

-- =============================================================================
-- TABLE: media_assets  — one row per uploaded/ingested media file
-- =============================================================================
CREATE TABLE IF NOT EXISTS media_assets (
    id              SERIAL PRIMARY KEY,
    asset_type      VARCHAR(20)  NOT NULL,            -- image | scanned | audio | video
    file_path       TEXT,                             -- local docs/ path (NULL when source_url-only)
    source_url      TEXT,                             -- yt-dlp / remote source (NULL for uploads)
    mime_type       VARCHAR(120),
    file_size       BIGINT,
    duration_sec    DOUBLE PRECISION,                 -- audio/video length
    segment_count   INTEGER      DEFAULT 0,           -- frames / audio segments / pages produced
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending', -- pending|processing|done|failed
    error           TEXT,
    document_id     INTEGER,                          -- optional link to documents(id)
    metadata        JSONB        DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT media_assets_asset_type_chk
        CHECK (asset_type IN ('image', 'scanned', 'audio', 'video')),
    CONSTRAINT media_assets_status_chk
        CHECK (status IN ('pending', 'processing', 'done', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_media_assets_status      ON media_assets (status);
CREATE INDEX IF NOT EXISTS idx_media_assets_type        ON media_assets (asset_type);
CREATE INDEX IF NOT EXISTS idx_media_assets_document_id ON media_assets (document_id);

-- =============================================================================
-- TABLE: media_embeddings  — CLIP cross-modal vectors (image<->text shared space)
-- Dimension is FIXED at 1024 (config: mediaEmbedding.dimension). Rationale: pgvector
-- columns are fixed-length and HNSW is per-column. 1024 covers Jina CLIP v2 /
-- Cohere embed-v4 / Voyage multimodal-3. Smaller models zero-pad to 1024.
-- Mixing model families with different native dims requires a separate column/table.
-- =============================================================================
CREATE TABLE IF NOT EXISTS media_embeddings (
    id              SERIAL PRIMARY KEY,
    asset_id        INTEGER      NOT NULL REFERENCES media_assets (id) ON DELETE CASCADE,
    segment_index   INTEGER      NOT NULL DEFAULT 0,  -- video frame # / audio segment # / page #
    embedding       vector(1024),                     -- CLIP shared space
    clip_model      VARCHAR(100),                     -- e.g. 'jina-clip-v2'
    clip_dim        INTEGER,                           -- native dim of the model used
    clip_provider   VARCHAR(50),                       -- e.g. 'jina' | 'cohere' | 'openclip-onnx'
    caption         TEXT,                              -- text-bridge source (also written to unified_embeddings)
    content_hash    VARCHAR(64),                       -- dedupe per (asset, segment)
    segment_meta    JSONB        DEFAULT '{}'::jsonb,  -- bbox / timestamp / frame_ts etc.
    created_at      TIMESTAMPTZ  DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT media_embeddings_asset_segment_uniq
        UNIQUE (asset_id, segment_index)
);

CREATE INDEX IF NOT EXISTS idx_media_embeddings_asset_id ON media_embeddings (asset_id);

-- HNSW cosine index on the CLIP column (mirrors unified_embeddings vector index strategy).
-- CONCURRENTLY avoids locking; safe to skip if the table is empty at create time.
CREATE INDEX IF NOT EXISTS idx_media_embeddings_hnsw
    ON media_embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- =============================================================================
-- SETTINGS: mediaEmbedding.*  (master flag default OFF → no behavior change)
-- Canonical prefix is `mediaEmbedding.` (NOT the inconsistent embedding.* keys).
-- ON CONFLICT DO NOTHING so re-running the migration never clobbers admin-tuned values.
-- =============================================================================
INSERT INTO settings (key, value, category, description) VALUES
    ('mediaEmbedding.enabled',   'false',         'media', 'Master flag for cross-modal multimodal RAG. OFF = legacy text-only behavior.'),
    ('mediaEmbedding.provider',  'jina',          'media', 'Cross-modal embedding provider: jina | cohere | voyage | openclip-onnx (air-gap).'),
    ('mediaEmbedding.model',     'jina-clip-v2',  'media', 'Cross-modal model id within the chosen provider.'),
    ('mediaEmbedding.dimension', '1024',          'media', 'CLIP vector dimension. MUST match the media_embeddings.embedding column width.'),
    ('mediaEmbedding.apiKey',    '',              'media', 'API key for the cross-modal provider (blank = fall back to env var).'),
    ('mediaEmbedding.captionModel', 'gpt-4o',     'media', 'Vision LLM used to caption images/frames for the text-bridge.'),
    ('ragSettings.mediaWeight',  '0.4',           'rag',   'RRF weight for cross-modal media results in fused search (0 = ignore).'),
    ('ragSettings.includeMediaDefault', 'false',  'rag',   'Whether search/chat include media by default when enabled.')
ON CONFLICT (key) DO NOTHING;
