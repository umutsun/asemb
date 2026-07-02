-- Migration: add an English BM25 column (English-primary UAE demo) — ADDITIVE
-- Date: 2026-06-29
-- Description: bookie_lsemb has been rebuilt as the English-primary UAE legal demo (no Turkish
--   content). The existing BM25 `search_vector` is generated with `to_tsvector('turkish', …)`
--   while `ragSettings.ftsLanguage='english'` — a config/column MISMATCH that made English BM25
--   under-match (e.g. "corporate tax taxable person" → 0 hits on the turkish column, 172 on an
--   english one). Rather than drop/recreate the shared `search_vector` column (destructive),
--   this ADDS a parallel `search_vector_en` ('english') column and routes non-Arabic queries to
--   it in semantic_search_service.py (gated by ragSettings.ftsEnEnabled, graceful fallback to
--   `search_vector` if absent). Mirrors the additive `search_vector_ar` design. Arabic stays on
--   `search_vector_ar`; the legacy turkish `search_vector` is left untouched.
--
-- SAFE: purely additive (IF NOT EXISTS). Adding a GENERATED STORED column backfills under a brief
-- ACCESS EXCLUSIVE lock (~221 MB / ~10.7k rows → a few seconds); the index is built afterward.

ALTER TABLE unified_embeddings
  ADD COLUMN IF NOT EXISTS search_vector_en tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_ue_search_vector_en
  ON unified_embeddings USING gin(search_vector_en);
