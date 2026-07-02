-- Settings (DML, not schema): schema-driven data-health configuration
-- Date: 2026-07-02
-- Apply to the UAE demo tenant DB (bookie demo). Idempotent (ON CONFLICT DO NOTHING
-- so tenant-tuned values are never overwritten).
-- Pairs with code: backend/python-services/services/data_health.py (in-code
-- defaults live there; these rows override them for this tenant) and the
-- lsemb-monitor MCP tool data_health_summary.

-- Required metadata keys per source table (JSON map source_table -> keys).
-- Used for missing-metadata counts and the metadata_coverage report block.
INSERT INTO settings (key, value, category, description)
VALUES (
  'dataHealth.metadataFields',
  '{"uae_legislation": ["lang","law","law_key","law_number","law_year","law_type","article_number"], "uae_gov_services": ["lang","url"]}',
  'dataHealth',
  'JSON map source_table -> required metadata keys on unified_embeddings rows (missing-metadata + coverage checks)'
)
ON CONFLICT (key) DO NOTHING;

-- Tables whose rows are ingested directly (no external source DB) — orphan and
-- pending-embedding checks are skipped for them instead of failing.
INSERT INTO settings (key, value, category, description)
VALUES (
  'dataHealth.selfSourcedTables',
  '["uae_legislation","uae_gov_services","mof_gov","demo_uae_gov"]',
  'dataHealth',
  'JSON array of self-sourced tables (no external source DB); orphan/pending checks are skipped for them'
)
ON CONFLICT (key) DO NOTHING;

-- Generic pairing-gap check: law_key groups missing one of the expected lang
-- values (en/ar) in uae_legislation.
INSERT INTO settings (key, value, category, description)
VALUES (
  'dataHealth.pairing',
  '{"enabled": true, "groupField": "law_key", "dimensionField": "lang", "expected": ["en","ar"], "sourceTable": "uae_legislation"}',
  'dataHealth',
  'JSON {enabled, groupField, dimensionField, expected[], sourceTable} for the EN<->AR pairing-gap check'
)
ON CONFLICT (key) DO NOTHING;
