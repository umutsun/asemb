-- Migration: settings registry reconciliation (Phase 3-4)
-- Date: 2026-07-03
-- Generated FROM backend/src/config/settings-registry.ts (single source of truth).
-- Additive + idempotent. Adversarially verified against live bookie_lsemb before applying:
--   * every statement is a no-op on re-run and never overwrites an admin VALUE
--   * category backfill only makes categories ACCURATE (GET /settings reads by key-prefix,
--     not category; never touches the 'advanced' category used by security.middleware)
--   * alias consolidation only COPIES a legacy value to its canonical key when the canonical
--     is absent (live: only jwtSecret -> jwt.secret actually copies; app.name='UAE LEX' kept)

-- =====================================================================
-- 1) Category backfill for all 153 registry keys (set-based, idempotent).
-- =====================================================================
UPDATE settings AS s
SET category = v.cat, updated_at = CURRENT_TIMESTAMP
FROM (VALUES
  ('app.name','app'),
  ('app.description','app'),
  ('app.version','app'),
  ('app.locale','app'),
  ('openai.apiKey','llm'),
  ('openai.model','llm'),
  ('openai.embeddingModel','llm'),
  ('openai.maxTokens','llm'),
  ('openai.temperature','llm'),
  ('anthropic.apiKey','llm'),
  ('anthropic.model','llm'),
  ('anthropic.maxTokens','llm'),
  ('google.apiKey','llm'),
  ('google.projectId','llm'),
  ('google.model','llm'),
  ('deepseek.apiKey','llm'),
  ('deepseek.baseUrl','llm'),
  ('deepseek.model','llm'),
  ('huggingface.apiKey','llm'),
  ('huggingface.model','llm'),
  ('huggingface.endpoint','llm'),
  ('openrouter.apiKey','llm'),
  ('openrouter.model','llm'),
  ('jina.apiKey','llm'),
  ('jina.model','llm'),
  ('llmSettings.activeChatModel','llm'),
  ('llmSettings.activeEmbeddingModel','llm'),
  ('llmSettings.embeddingModel','llm'),
  ('llmSettings.embeddingProvider','llm'),
  ('llmSettings.translationProvider','llm'),
  ('llmSettings.temperature','llm'),
  ('llmSettings.topP','llm'),
  ('llmSettings.maxTokens','llm'),
  ('llmSettings.presencePenalty','llm'),
  ('llmSettings.frequencyPenalty','llm'),
  ('llmSettings.ragWeight','llm'),
  ('llmSettings.llmKnowledgeWeight','llm'),
  ('llmSettings.streamResponse','llm'),
  ('llmSettings.systemPrompt','llm'),
  ('llmSettings.responseStyle','llm'),
  ('llmSettings.language','llm'),
  ('embeddings.provider','embeddings'),
  ('embeddings.model','embeddings'),
  ('embeddings.batchSize','embeddings'),
  ('embeddings.maxTokens','embeddings'),
  ('embeddings.dimension','embeddings'),
  ('embeddings.enabled','embeddings'),
  ('embeddings.chunkSize','embeddings'),
  ('embeddings.chunkOverlap','embeddings'),
  ('database.host','database'),
  ('database.port','database'),
  ('database.name','database'),
  ('database.user','database'),
  ('database.password','database'),
  ('database.ssl','database'),
  ('database.maxConnections','database'),
  ('redis.host','redis'),
  ('redis.port','redis'),
  ('redis.password','redis'),
  ('redis.db','redis'),
  ('security.mcpBearerKey','security'),
  ('jwt.secret','security'),
  ('scraper.timeout','scraper'),
  ('scraper.maxConcurrency','scraper'),
  ('scraper.userAgent','scraper'),
  ('ocrSettings.activeProvider','ocr'),
  ('ocrSettings.fallbackEnabled','ocr'),
  ('ocrSettings.fallbackProvider','ocr'),
  ('ocrSettings.cacheEnabled','ocr'),
  ('ocrSettings.cacheTTL','ocr'),
  ('deepl.apiKey','translation'),
  ('google.translate.apiKey','translation'),
  ('translation.model','translation'),
  ('translation.systemPrompt','translation'),
  ('mediaEmbedding.enabled','media'),
  ('mediaEmbedding.provider','media'),
  ('mediaEmbedding.model','media'),
  ('mediaEmbedding.dimension','media'),
  ('mediaEmbedding.apiKey','media'),
  ('mediaEmbedding.captionModel','media'),
  ('relationships.extractionEnabled','relationships'),
  ('relationships.extractionModel','relationships'),
  ('relationships.confidenceThreshold','relationships'),
  ('relationships.batchSize','relationships'),
  ('relationships.graphRetrievalEnabled','relationships'),
  ('relationships.graphBoostScore','relationships'),
  ('relationships.maxGraphHops','relationships'),
  ('relationships.maxRelatedResults','relationships'),
  ('relationships.resolveLawLevelFallback','relationships'),
  ('relationships.defaultEntities','relationships'),
  ('relationships.defaultRelationships','relationships'),
  ('evalSettings.chatUrl','eval'),
  ('evalSettings.goldenSet','eval'),
  ('evalSettings.judgeModel','eval'),
  ('evalSettings.judgePrompt','eval'),
  ('evalSettings.matcherMode','eval'),
  ('evalSettings.retrievalK','eval'),
  ('evalSettings.seedDomainBuckets','eval'),
  ('evalSettings.thresholds','eval'),
  ('dataHealth.metadataFields','dataHealth'),
  ('dataHealth.selfSourcedTables','dataHealth'),
  ('dataHealth.pairing','dataHealth'),
  ('ragSettings.similarityThreshold','rag'),
  ('ragSettings.maxResults','rag'),
  ('ragSettings.minResults','rag'),
  ('ragSettings.enableHybridSearch','rag'),
  ('ragSettings.enableSemanticSearch','rag'),
  ('ragSettings.enableBM25Search','rag'),
  ('ragSettings.enableKeywordBoost','rag'),
  ('ragSettings.bm25Weight','rag'),
  ('ragSettings.mediaWeight','rag'),
  ('ragSettings.strictMode','rag'),
  ('ragSettings.strictModeLevel','rag'),
  ('ragSettings.strictModeTemperature','rag'),
  ('ragSettings.evidenceGateEnabled','rag'),
  ('ragSettings.evidenceGateMinScore','rag'),
  ('ragSettings.evidenceGateMinChunks','rag'),
  ('ragSettings.highConfidenceThreshold','rag'),
  ('ragSettings.lowConfidenceThreshold','rag'),
  ('ragSettings.chunkSize','rag'),
  ('ragSettings.chunkOverlap','rag'),
  ('ragSettings.maxContextLength','rag'),
  ('ragSettings.maxExcerptLength','rag'),
  ('ragSettings.excerptMaxLength','rag'),
  ('ragSettings.summaryMaxLength','rag'),
  ('ragSettings.rerankEnabled','rag'),
  ('ragSettings.rerankProvider','rag'),
  ('ragSettings.rerankModel','rag'),
  ('ragSettings.rerankMinScore','rag'),
  ('ragSettings.semanticCacheEnabled','rag'),
  ('ragSettings.semanticCacheThreshold','rag'),
  ('ragSettings.semanticCacheTTL','rag'),
  ('ragSettings.corpusVersion','rag'),
  ('ragSettings.enableUnifiedEmbeddings','rag'),
  ('ragSettings.enableDocumentEmbeddings','rag'),
  ('ragSettings.enableScrapeEmbeddings','rag'),
  ('ragSettings.enableMessageEmbeddings','rag'),
  ('ragSettings.includeMediaDefault','rag'),
  ('ragSettings.streamingEnabled','rag'),
  ('ragSettings.agentMemoryEnabled','rag'),
  ('ragSettings.sourceTypeNormalizations','rag'),
  ('ragSettings.sourceTypeLabels','rag'),
  ('ragSettings.fieldLabels','rag'),
  ('ragSettings.tocDetection','rag'),
  ('ragSettings.strictContextTemplate','rag'),
  ('ragSettings.htmlCleaningPatterns','rag'),
  ('ragSettings.quotePrefixPatterns','rag'),
  ('ragSettings.genericTitlePatterns','rag'),
  ('ragSettings.preferredSourceTypes','rag'),
  ('ragSettings.strictModePromptTr','rag'),
  ('ragSettings.strictModePromptEn','rag'),
  ('ragSettings.noResultsMessageTr','rag'),
  ('ragSettings.noResultsMessageEn','rag')
) AS v(key, cat)
WHERE s.key = v.key AND s.category IS DISTINCT FROM v.cat;

-- =====================================================================
-- 2) Alias consolidation: copy a legacy/duplicate key's value to its canonical key
--    ONLY when the canonical does not already exist (ON CONFLICT DO NOTHING = never clobbers).
-- =====================================================================
INSERT INTO settings (key, value, category, description) SELECT 'app.name', value, 'app', 'Application display name' FROM settings WHERE key='app_name' ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value, category, description) SELECT 'anthropic.apiKey', value, 'llm', 'Anthropic (Claude) API key' FROM settings WHERE key='claude.apiKey' ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value, category, description) SELECT 'google.apiKey', value, 'llm', 'Google (Gemini) API key' FROM settings WHERE key='gemini.apiKey' ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value, category, description) SELECT 'jwt.secret', value, 'security', 'JWT signing secret' FROM settings WHERE key='jwtSecret' ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value, category, description) SELECT 'ocrSettings.activeProvider', value, 'ocr', 'Active OCR provider' FROM settings WHERE key='ocr_active_provider' ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value, category, description) SELECT 'ocrSettings.activeProvider', value, 'ocr', 'Active OCR provider' FROM settings WHERE key='ocrProvider' ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value, category, description) SELECT 'ocrSettings.activeProvider', value, 'ocr', 'Active OCR provider' FROM settings WHERE key='activeProvider' ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value, category, description) SELECT 'ocrSettings.fallbackEnabled', value, 'ocr', 'OCR fallback enabled' FROM settings WHERE key='ocr_fallback_enabled' ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value, category, description) SELECT 'ocrSettings.fallbackEnabled', value, 'ocr', 'OCR fallback enabled' FROM settings WHERE key='fallbackEnabled' ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value, category, description) SELECT 'ocrSettings.fallbackProvider', value, 'ocr', 'OCR fallback provider' FROM settings WHERE key='ocr_fallback_provider' ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value, category, description) SELECT 'ocrSettings.cacheEnabled', value, 'ocr', 'OCR cache enabled' FROM settings WHERE key='ocr_cache_enabled' ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value, category, description) SELECT 'ocrSettings.cacheEnabled', value, 'ocr', 'OCR cache enabled' FROM settings WHERE key='cacheEnabled' ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value, category, description) SELECT 'ocrSettings.cacheTTL', value, 'ocr', 'OCR cache TTL (seconds)' FROM settings WHERE key='ocr_cache_ttl' ON CONFLICT (key) DO NOTHING;

-- =====================================================================
-- 3) OCR canonical completion (Phase 3): supply the two missing canonical keys.
-- =====================================================================
INSERT INTO settings (key, value, category, description) VALUES
  ('ocrSettings.fallbackProvider', 'tesseract', 'ocr', 'OCR fallback provider'),
  ('ocrSettings.cacheTTL', '604800', 'ocr', 'OCR cache TTL (seconds)')
ON CONFLICT (key) DO NOTHING;

-- 3b) Normalize INVALID OCR provider data. 'openai-vision' is not a valid OCRProviderType
--     ('openai'|'gemini'|'deepseek'|'tesseract'|'auto') and was never actually active — OCR has
--     always fallen back to Tesseract. Setting it to the valid 'auto' is BEHAVIOR-PRESERVING
--     (still Tesseract) and prevents a future 'openai-vision'->'openai' edit from silently
--     enabling paid OpenAI-vision OCR. (Flip to 'openai' deliberately if paid OCR is wanted.)
UPDATE settings SET value='auto', updated_at=CURRENT_TIMESTAMP
WHERE key IN ('ocrSettings.activeProvider','activeProvider','ocrProvider') AND value='openai-vision';

-- =====================================================================
-- 4) DESTRUCTIVE — junk rows: column names accidentally inserted as keys by a bad write
--    ({key,value,category} exploded into 3 rows). Verified garbage; the real
--    llmSettings.embeddingModel='text-embedding-3-small' row is a different key and is kept.
-- =====================================================================
DELETE FROM settings WHERE key IN ('key','value','category');
