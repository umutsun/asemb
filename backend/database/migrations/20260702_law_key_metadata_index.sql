-- Expression indexes for the structured law metadata added by
-- scripts/backfill_uae_law_metadata.py (law_key / article_number / lang).
-- Used by: reference resolution (law_key + article_number lookups),
-- dashboard graph grouping, per-language BM25 row filtering.
-- Additive and idempotent; safe on the shared live DB (small table).

CREATE INDEX IF NOT EXISTS idx_ue_meta_law_key_article
  ON unified_embeddings ((metadata->>'law_key'), (metadata->>'article_number'))
  WHERE metadata ? 'law_key';

CREATE INDEX IF NOT EXISTS idx_ue_meta_lang
  ON unified_embeddings ((metadata->>'lang'));
