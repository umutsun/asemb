-- Settings (DML, not schema): Arabic (UAE) secondary-language config
-- Date: 2026-06-27
-- Apply to the UAE demo tenant DB (bookie demo). Idempotent upserts.
-- Pairs with code: rag-chat.service.ts (auto answer language) and
-- semantic_search_service.py (Arabic BM25 routing). All keys have safe in-code
-- defaults; only response_language='auto' is strictly required to enable the
-- "answer in the question's language" behavior.

-- Enable "answer in the question's language". Concrete values (tr/en/ar) are a hard
-- override; 'auto' detects the question language (Arabic-aware).
INSERT INTO settings (key, value, category, description)
VALUES (
  'response_language',
  'auto',
  'chat',
  'Chat answer language: tr/en/ar (hard override) or auto (detect from the question; Arabic-aware)'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- Fallback answer language in 'auto' mode when the question language is undetected.
-- 'en' for the English-primary UAE demo (set 'tr' for a Turkish-primary tenant).
INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.autoDefaultLanguage',
  'en',
  'rag',
  'Default answer language when response_language=auto and the question language is undetected'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- System-prompt directive appended when answering in Arabic.
INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.answerLanguageInstructionAr',
  'Respond entirely in Modern Standard Arabic (العربية الفصحى). Keep legal article citations and source numbers exactly as written.',
  'rag',
  'Instruction appended to the system prompt to force Arabic answers'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

-- Arabic BM25 routing (requires migration 20260627_bm25_search_vector_ar.sql).
INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.ftsArEnabled',
  'true',
  'rag',
  'Route Arabic-script queries to the search_vector_ar BM25 column (falls back to vector-only if absent)'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;

INSERT INTO settings (key, value, category, description)
VALUES (
  'ragSettings.ftsLanguageAr',
  'arabic',
  'rag',
  'Postgres text-search regconfig for Arabic BM25 (must match the search_vector_ar column config)'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, description = EXCLUDED.description;
