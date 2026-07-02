-- Migration: Arabic BM25 Full-Text Search via tsvector
-- Date: 2026-06-27
-- Description: Adds an Arabic full-text search vector column to unified_embeddings so
--              Arabic (UAE) queries get real keyword/BM25 matching (the existing
--              search_vector is generated with the 'turkish' config and does not stem
--              Arabic). Additive and fully backward-compatible: the English/Turkish
--              path keeps using search_vector untouched; Arabic queries are routed to
--              search_vector_ar by semantic_search_service.py (gated by
--              ragSettings.ftsArEnabled, regconfig from ragSettings.ftsLanguageAr).
--              Verified on the live DB (PG 15.14): the 'arabic' text-search config
--              exists and stems Arabic (e.g. "المادة" → "ماد", "العمل" → "عمل").
--
-- SAFETY: shared/live DB. Adding a GENERATED STORED column backfills under a brief
-- ACCESS EXCLUSIVE lock; the table is small (low tens of thousands of rows). The index
-- is built CONCURRENTLY to avoid a long index lock. IF NOT EXISTS makes this re-runnable.

-- =============================================
-- COLUMN: search_vector_ar (tsvector, auto-generated, Arabic stemming)
-- Auto-updated on INSERT/UPDATE - no trigger needed
-- =============================================

ALTER TABLE unified_embeddings
  ADD COLUMN IF NOT EXISTS search_vector_ar tsvector
  GENERATED ALWAYS AS (to_tsvector('arabic', coalesce(content, ''))) STORED;

-- =============================================
-- INDEX: GIN index for fast Arabic full-text search
-- CONCURRENTLY must run OUTSIDE a transaction block (PG15). If it fails it leaves an
-- INVALID index — DROP INDEX idx_ue_search_vector_ar and re-run.
-- =============================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_ue_search_vector_ar
  ON unified_embeddings USING gin(search_vector_ar);
