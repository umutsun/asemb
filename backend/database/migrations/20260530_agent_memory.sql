-- Migration: Agent Memory — long-term memory store (WS4-A, Redis Iris alignment)
-- Date: 2026-05-30
-- Description: Durable Postgres store for the LONG-TERM tier of agent memory (ADR-0002).
--              Working memory stays in Redis (message-storage.service.ts, unchanged).
--              This table is the source-of-truth; the Redis `agent_memory` vector index
--              (ADR-0001) is a rebuildable hot-recall projection on top of it.
--              Mirrors the OSS Redis Agent Memory Server data model (memory_type, dedup
--              hash, topics, promotion provenance) so the backend stays swappable.
--
-- Status: additive + inert. No existing code path reads/writes this table until the
--         WS4-A service + the `agent_memory.enabled` flag are turned on.
-- Target: Hetzner VPS / demo.luwi.dev (NOT the air-gapped GX10/leopardo appliance).
-- Embedding dim 1536 matches the rest of the corpus (OpenAI text-embedding-3-small).

-- =============================================
-- TABLE: memories (long-term agent memory)
-- =============================================
CREATE TABLE IF NOT EXISTS memories (
    id                 uuid          DEFAULT gen_random_uuid() PRIMARY KEY,
    namespace          varchar(255)  NOT NULL DEFAULT 'default',  -- tenant/instance scope
    user_id            varchar(255),                              -- memory owner (set for dedup/recall)
    session_id         varchar(255),                              -- current session (if live-extracted)
    source_session_id  varchar(255),                              -- provenance: promoted FROM this session

    memory_type        varchar(32)   NOT NULL DEFAULT 'episodic', -- discrete|summary|preference|episodic
    content            text          NOT NULL,
    content_hash       varchar(64)   NOT NULL,                    -- sha256(content) for dedup
    topics             text[]        DEFAULT '{}',                -- extracted topics/entities
    embedding          vector(1536),                              -- semantic recall vector
    metadata           jsonb         DEFAULT '{}'::jsonb,

    importance         real          DEFAULT 0.5,                 -- promotion/eviction signal
    access_count       integer       DEFAULT 0,
    last_accessed_at   timestamptz,
    created_at         timestamptz   DEFAULT now(),
    updated_at         timestamptz   DEFAULT now()
);

-- =============================================
-- DEDUP: one memory per (namespace, user, content_hash)
-- Lets the writer upsert with ON CONFLICT instead of re-embedding duplicates.
-- (NULL user_id rows are not deduped — long-term memory should carry an owner.)
-- =============================================
CREATE UNIQUE INDEX IF NOT EXISTS memories_dedup_uniq
    ON memories (namespace, user_id, content_hash);

-- =============================================
-- RECALL: user/type-filtered semantic recall
-- =============================================
CREATE INDEX IF NOT EXISTS memories_owner_type_idx
    ON memories (namespace, user_id, memory_type);

CREATE INDEX IF NOT EXISTS memories_embedding_hnsw
    ON memories USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS memories_topics_gin
    ON memories USING gin (topics);

-- =============================================
-- updated_at maintenance (matches message_embeddings trigger convention)
-- =============================================
CREATE OR REPLACE FUNCTION update_memories_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_memories_updated_at ON memories;
CREATE TRIGGER trg_memories_updated_at
    BEFORE UPDATE ON memories
    FOR EACH ROW EXECUTE FUNCTION update_memories_updated_at();

COMMENT ON TABLE memories IS
    'WS4-A long-term agent memory (ADR-0002). Source-of-truth behind the Redis agent_memory hot index. Working memory lives in Redis, not here.';
