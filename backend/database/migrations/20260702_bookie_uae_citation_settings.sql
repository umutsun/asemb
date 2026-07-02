-- Settings (DML, not schema): UAE citation presentation config for the bookie demo tenant
-- Date: 2026-07-02
-- NOT applied automatically — run explicitly against the target tenant DB (bookie_lsemb).
-- Pairs with frontend code: source-presentation.ts / citation-settings.ts read
-- ragSettings.citationPriorityFields / fieldLabels / sourceTypeLabels; all have
-- safe in-code generic fallbacks, so applying this only improves presentation.

-- Ordered metadata fields rendered as chips on citation cards.
INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.citationPriorityFields',
  '["law_title","article_number","law_year","issue_date","source"]',
  'rag',
  'Ordered source-metadata fields shown as chips on chat citation cards'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- Chip labels per metadata field. Values are either a plain string or a per-language
-- map ({en, ar, tr}); the frontend resolves by the answer/UI language with en fallback.
INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.fieldLabels',
  '{"law_title":{"en":"Law","ar":"القانون"},"article_number":{"en":"Article","ar":"المادة"},"law_year":{"en":"Year","ar":"السنة"},"issue_date":{"en":"Issue date","ar":"تاريخ الإصدار"},"source":{"en":"Source","ar":"المصدر"},"lang":{"en":"Language","ar":"اللغة"}}',
  'rag',
  'Citation chip labels per metadata field (string or {en,ar,tr} map)'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- Source-table -> citation type presentation. labelKey is a frontend i18n key
-- (sourceTypes.*), markerClass a color token, weight the authority ranking.
-- DO NOTHING on conflict: if the tenant already tuned this, keep their version.
INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.sourceTypeLabels',
  '{"uae_legislation":{"labelKey":"sourceTypes.legislation","markerClass":"purple","weight":100},"uae_gov_services":{"labelKey":"sourceTypes.govService","markerClass":"blue","weight":60},"document_embeddings":{"labelKey":"sourceTypes.document","markerClass":"slate","weight":40},"mof_gov":{"labelKey":"sourceTypes.webpage","markerClass":"blue","weight":40},"demo_uae_gov":{"labelKey":"sourceTypes.webpage","markerClass":"blue","weight":40}}',
  'rag',
  'Source-table pattern -> citation type presentation ({labelKey, markerClass, weight})'
)
ON CONFLICT (key) DO NOTHING;

-- Keep inline [n] citation markers in answers so the clickable refs + cards line up.
INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.disableCitationText',
  'false',
  'rag',
  'When true the model is told to omit inline [n] citation markers; false keeps them'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;
