// =============================================================================
// Settings Registry — the single source of truth for DB-driven configuration.
//
// LSEMB stores config in a flat `settings` table (`value text`, coercion in code;
// Hard Rule #1). Historically each key's type, default, category and secret-ness
// were implicit, spread across a seed script, ~20 migrations, 6 route files and a
// service — with divergent parsing in every reader. This module makes that explicit:
// one typed descriptor per *config* key, plus the canonical coerce / serialize /
// validate / redact / project helpers that replace the scattered ad-hoc logic.
//
// DESIGN CONTRACT — descriptive + PERMISSIVE, never a strict allowlist:
//   Runtime telemetry (apiStatus.*, llmStatus.*, modelTokenUsage.* …) and the
//   control value ragSettings.corpusVersion are written directly via raw SQL /
//   setSetting and MUST keep working. Helpers here validate/normalise KNOWN keys
//   and PASS UNKNOWN keys through unchanged (log-and-store) — they never reject.
//
// Phase 0: this module is a descriptor + helper library only. No read/write path
// is routed through it yet (that is Phase 1). Behaviour must stay byte-compatible
// with settings.routes.ts, so the redaction regex, validation bounds and the GET
// category projection below deliberately mirror that route.
// =============================================================================

export type SettingType = 'string' | 'number' | 'boolean' | 'json' | 'secret';

export interface SettingDef {
  /** Canonical dotted key, e.g. 'openai.apiKey'. */
  key: string;
  /** Canonical category — drives the `settings.category` column and the UI tab. */
  category: string;
  /** Storage/coercion type. 'secret' coerces like a string but is redacted on read. */
  type: SettingType;
  /**
   * The one place a code default is declared. OPTIONAL by design: absent means
   * "no code default — seeded via migration or intentionally unset". The seed
   * generator only emits keys that have a `default` and are not `runtime`.
   */
  default?: unknown;
  /** English description; written to settings.description and reused as a UI label. */
  description: string;
  /** Telemetry/runtime state, not user config — excluded from the seed and the UI. */
  runtime?: boolean;
  /** Allowed values (enum validation). */
  enum?: string[];
  /** Numeric bounds (inclusive). */
  min?: number;
  max?: number;
  /** Legacy keys (snake_case / duplicates) that resolve to this canonical key. */
  aliases?: string[];
}

// -----------------------------------------------------------------------------
// Secret handling — regex mirrors settings.routes.ts verbatim so redaction and the
// blank-secret-write guard behave identically wherever they are applied.
// -----------------------------------------------------------------------------
export const SECRET_KEY_RE =
  /(api[_-]?key|bearer[_-]?key|password|passwd|secret|token|privatekey|private[_-]?key|access[_-]?key)$/i;

/** True when writing a blank value to a secret-suffixed key (would wipe a stored secret). */
export function isBlankSecretWrite(key: string, value: unknown): boolean {
  return (
    SECRET_KEY_RE.test(key) &&
    (value === undefined || value === null || String(value).trim() === '')
  );
}

/**
 * Redact secret leaf/section values in a nested settings object, in place.
 * Byte-compatible with settings.routes.ts `redactSettingsSecrets`.
 */
export function redactSettingsSecrets<T extends Record<string, any>>(obj: T): T {
  if (!obj || typeof obj !== 'object') return obj;
  for (const section of Object.keys(obj)) {
    const val = (obj as any)[section];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      for (const k of Object.keys(val)) {
        if (SECRET_KEY_RE.test(k) && val[k]) val[k] = '';
      }
    } else if (SECRET_KEY_RE.test(section) && val) {
      (obj as any)[section] = '';
    }
  }
  return obj;
}

// -----------------------------------------------------------------------------
// Runtime / junk key detection — PERMISSIVE pass-through, not rejection.
// These keys are written by verify endpoints / monitors, not the config UI, and are
// excluded from the registry proper. corpusVersion is deliberately NOT here: it is a
// runtime-written *control* value (semantic-cache scoping) that must remain writable
// AND is a first-class config key below.
// -----------------------------------------------------------------------------
const RUNTIME_KEY_PATTERNS: RegExp[] = [
  /^apiStatus\./,
  /^llmStatus\./,
  /^modelTokenUsage\./,
  /^tokenInfo\./,
  /^lastTestTokens\./,
  /\.modelResults$/,
  /\.modelsTested$/,
  /\.verifiedDate$/,
  /\.status$/,
  /\.lastChecked$/,
];

/** Junk rows observed in the live table (column names accidentally inserted as keys). */
const JUNK_KEYS = new Set(['key', 'value', 'category']);

export function isRuntimeKey(key: string): boolean {
  return RUNTIME_KEY_PATTERNS.some((re) => re.test(key));
}

export function isJunkKey(key: string): boolean {
  return JUNK_KEYS.has(key);
}

// -----------------------------------------------------------------------------
// The registry. Grouped by canonical category. `default` is set only where a
// confident code default exists (mostly from backend/scripts/seed-default-settings.js);
// large prompt/pattern blobs are migration-seeded and intentionally have no default.
// Coverage is intentionally focused on clearly-config keys; telemetry and exploded
// leaf rows (e.g. ragSettings.fieldLabels.*) are handled by pattern / consolidated later.
// -----------------------------------------------------------------------------
export const SETTINGS: SettingDef[] = [
  // --- app -------------------------------------------------------------------
  { key: 'app.name', category: 'app', type: 'string', default: 'LSEMB', description: 'Application display name', aliases: ['app_name'] },
  { key: 'app.description', category: 'app', type: 'string', default: 'AI-powered knowledge management system', description: 'Application description shown in the UI' },
  { key: 'app.version', category: 'app', type: 'string', default: '1.0.0', description: 'Application version' },
  { key: 'app.locale', category: 'app', type: 'string', default: 'en', description: 'Default UI locale' },

  // --- llm providers ---------------------------------------------------------
  { key: 'openai.apiKey', category: 'llm', type: 'secret', description: 'OpenAI API key' },
  { key: 'openai.model', category: 'llm', type: 'string', default: 'gpt-4o-mini', description: 'Default OpenAI chat model' },
  { key: 'openai.embeddingModel', category: 'llm', type: 'string', default: 'text-embedding-3-large', description: 'Default OpenAI embedding model' },
  { key: 'openai.maxTokens', category: 'llm', type: 'number', default: 4096, description: 'OpenAI max output tokens' },
  { key: 'openai.temperature', category: 'llm', type: 'number', default: 0.7, min: 0, max: 2, description: 'OpenAI sampling temperature' },

  { key: 'anthropic.apiKey', category: 'llm', type: 'secret', description: 'Anthropic (Claude) API key', aliases: ['claude.apiKey'] },
  { key: 'anthropic.model', category: 'llm', type: 'string', description: 'Default Anthropic chat model' },
  { key: 'anthropic.maxTokens', category: 'llm', type: 'number', default: 4096, description: 'Anthropic max output tokens' },

  { key: 'google.apiKey', category: 'llm', type: 'secret', description: 'Google (Gemini) API key', aliases: ['gemini.apiKey'] },
  { key: 'google.projectId', category: 'llm', type: 'string', description: 'Google Cloud project id' },
  { key: 'google.model', category: 'llm', type: 'string', description: 'Default Google (Gemini) model' },

  { key: 'deepseek.apiKey', category: 'llm', type: 'secret', description: 'DeepSeek API key' },
  { key: 'deepseek.baseUrl', category: 'llm', type: 'string', default: 'https://api.deepseek.com', description: 'DeepSeek API base URL' },
  { key: 'deepseek.model', category: 'llm', type: 'string', default: 'deepseek-chat', description: 'Default DeepSeek model' },

  { key: 'huggingface.apiKey', category: 'llm', type: 'secret', description: 'HuggingFace API key' },
  { key: 'huggingface.model', category: 'llm', type: 'string', default: 'sentence-transformers/all-MiniLM-L6-v2', description: 'Default HuggingFace model' },
  { key: 'huggingface.endpoint', category: 'llm', type: 'string', default: 'https://api-inference.huggingface.co/models/', description: 'HuggingFace inference endpoint' },

  { key: 'openrouter.apiKey', category: 'llm', type: 'secret', description: 'OpenRouter API key' },
  { key: 'openrouter.model', category: 'llm', type: 'string', description: 'Default OpenRouter model' },

  { key: 'jina.apiKey', category: 'llm', type: 'secret', description: 'Jina AI API key (embeddings / reranker)' },
  { key: 'jina.model', category: 'llm', type: 'string', description: 'Default Jina model' },

  // --- llmSettings (chat orchestration) --------------------------------------
  { key: 'llmSettings.activeChatModel', category: 'llm', type: 'string', description: 'Active chat model, "provider/model"' },
  { key: 'llmSettings.activeEmbeddingModel', category: 'llm', type: 'string', description: 'Active embedding model, "provider/model"' },
  { key: 'llmSettings.embeddingModel', category: 'llm', type: 'string', description: 'Embedding model name' },
  { key: 'llmSettings.embeddingProvider', category: 'llm', type: 'string', description: 'Embedding provider' },
  { key: 'llmSettings.translationProvider', category: 'llm', type: 'string', description: 'Active translation provider' },
  { key: 'llmSettings.temperature', category: 'llm', type: 'number', default: 0.3, min: 0, max: 2, description: 'Chat sampling temperature' },
  { key: 'llmSettings.topP', category: 'llm', type: 'number', default: 0.9, min: 0, max: 1, description: 'Chat nucleus sampling top-p' },
  { key: 'llmSettings.maxTokens', category: 'llm', type: 'number', default: 4096, description: 'Chat max output tokens' },
  { key: 'llmSettings.presencePenalty', category: 'llm', type: 'number', default: 0, description: 'Chat presence penalty' },
  { key: 'llmSettings.frequencyPenalty', category: 'llm', type: 'number', default: 0, description: 'Chat frequency penalty' },
  { key: 'llmSettings.ragWeight', category: 'llm', type: 'number', default: 95, min: 0, max: 100, description: 'Weight of RAG context vs LLM knowledge (%)' },
  { key: 'llmSettings.llmKnowledgeWeight', category: 'llm', type: 'number', default: 5, min: 0, max: 100, description: 'Weight of LLM parametric knowledge (%)' },
  { key: 'llmSettings.streamResponse', category: 'llm', type: 'boolean', default: true, description: 'Stream chat responses' },
  { key: 'llmSettings.systemPrompt', category: 'llm', type: 'string', default: 'You are a RAG assistant. Answer ONLY from the provided context.', description: 'Default system prompt' },
  { key: 'llmSettings.responseStyle', category: 'llm', type: 'string', default: 'professional', description: 'Response style/persona' },
  { key: 'llmSettings.language', category: 'llm', type: 'string', default: 'en', description: 'Default answer language' },

  // --- embeddings ------------------------------------------------------------
  { key: 'embeddings.provider', category: 'embeddings', type: 'string', default: 'openai', description: 'Embedding provider' },
  { key: 'embeddings.model', category: 'embeddings', type: 'string', default: 'text-embedding-3-large', description: 'Embedding model' },
  { key: 'embeddings.batchSize', category: 'embeddings', type: 'number', default: 100, description: 'Embedding batch size' },
  { key: 'embeddings.maxTokens', category: 'embeddings', type: 'number', default: 8192, description: 'Max tokens per embedding input' },
  { key: 'embeddings.dimension', category: 'embeddings', type: 'number', default: 1536, description: 'Embedding vector dimension' },
  { key: 'embeddings.enabled', category: 'embeddings', type: 'boolean', default: true, description: 'Embedding pipeline enabled' },
  { key: 'embeddings.chunkSize', category: 'embeddings', type: 'number', default: 1000, min: 100, max: 5000, description: 'Chunk size (characters)' },
  { key: 'embeddings.chunkOverlap', category: 'embeddings', type: 'number', default: 200, description: 'Chunk overlap (characters)' },

  // --- database --------------------------------------------------------------
  { key: 'database.host', category: 'database', type: 'string', description: 'PostgreSQL host' },
  { key: 'database.port', category: 'database', type: 'number', default: 5432, description: 'PostgreSQL port' },
  { key: 'database.name', category: 'database', type: 'string', description: 'PostgreSQL database name' },
  { key: 'database.user', category: 'database', type: 'string', description: 'PostgreSQL user' },
  { key: 'database.password', category: 'database', type: 'secret', description: 'PostgreSQL password' },
  { key: 'database.ssl', category: 'database', type: 'boolean', default: false, description: 'Use SSL for PostgreSQL' },
  { key: 'database.maxConnections', category: 'database', type: 'number', default: 20, description: 'PostgreSQL pool max connections' },

  // --- redis -----------------------------------------------------------------
  { key: 'redis.host', category: 'redis', type: 'string', default: 'localhost', description: 'Redis host' },
  { key: 'redis.port', category: 'redis', type: 'number', default: 6379, description: 'Redis port' },
  { key: 'redis.password', category: 'redis', type: 'secret', description: 'Redis password' },
  { key: 'redis.db', category: 'redis', type: 'number', default: 0, description: 'Redis database index' },

  // --- security --------------------------------------------------------------
  { key: 'security.mcpBearerKey', category: 'security', type: 'secret', description: 'X-API-Key for the lsemb-mcp monitoring server. Blank = use env INTERNAL_API_KEY.' },
  { key: 'jwt.secret', category: 'security', type: 'secret', description: 'JWT signing secret', aliases: ['jwtSecret'] },

  // --- scraper ---------------------------------------------------------------
  { key: 'scraper.timeout', category: 'scraper', type: 'number', default: 30000, description: 'Scraper request timeout (ms)' },
  { key: 'scraper.maxConcurrency', category: 'scraper', type: 'number', default: 3, description: 'Scraper max concurrency' },
  { key: 'scraper.userAgent', category: 'scraper', type: 'string', default: 'LSEMB Web Scraper', description: 'Scraper User-Agent' },

  // --- ocr (canonical dotted; snake_case aliases retired in a later phase) ----
  { key: 'ocrSettings.activeProvider', category: 'ocr', type: 'string', default: 'auto', description: 'Active OCR provider', aliases: ['ocr_active_provider', 'ocrProvider', 'activeProvider'] },
  { key: 'ocrSettings.fallbackEnabled', category: 'ocr', type: 'boolean', default: true, description: 'OCR fallback enabled', aliases: ['ocr_fallback_enabled', 'fallbackEnabled'] },
  { key: 'ocrSettings.fallbackProvider', category: 'ocr', type: 'string', default: 'tesseract', description: 'OCR fallback provider', aliases: ['ocr_fallback_provider'] },
  { key: 'ocrSettings.cacheEnabled', category: 'ocr', type: 'boolean', default: true, description: 'OCR cache enabled', aliases: ['ocr_cache_enabled', 'cacheEnabled'] },
  { key: 'ocrSettings.cacheTTL', category: 'ocr', type: 'number', default: 604800, description: 'OCR cache TTL (seconds)', aliases: ['ocr_cache_ttl'] },

  // --- translation -----------------------------------------------------------
  { key: 'deepl.apiKey', category: 'translation', type: 'secret', description: 'DeepL API key' },
  { key: 'google.translate.apiKey', category: 'translation', type: 'secret', description: 'Google Translate API key' },
  { key: 'translation.model', category: 'translation', type: 'string', description: 'Translation model' },
  { key: 'translation.systemPrompt', category: 'translation', type: 'string', description: 'Translation system prompt' },

  // --- media embeddings (multimodal / CLIP) ----------------------------------
  { key: 'mediaEmbedding.enabled', category: 'media', type: 'boolean', default: false, description: 'Cross-modal media embeddings enabled' },
  { key: 'mediaEmbedding.provider', category: 'media', type: 'string', description: 'Media embedding provider' },
  { key: 'mediaEmbedding.model', category: 'media', type: 'string', description: 'Media embedding model (CLIP)' },
  { key: 'mediaEmbedding.dimension', category: 'media', type: 'number', default: 1024, description: 'Media embedding vector dimension' },
  { key: 'mediaEmbedding.apiKey', category: 'media', type: 'secret', description: 'Media embedding provider API key' },
  { key: 'mediaEmbedding.captionModel', category: 'media', type: 'string', description: 'Image caption model' },

  // --- relationships (knowledge graph) ---------------------------------------
  { key: 'relationships.extractionEnabled', category: 'relationships', type: 'boolean', default: false, description: 'KG relationship extraction enabled' },
  { key: 'relationships.extractionModel', category: 'relationships', type: 'string', description: 'KG extraction model' },
  { key: 'relationships.confidenceThreshold', category: 'relationships', type: 'number', default: 0.5, min: 0, max: 1, description: 'KG extraction confidence threshold' },
  { key: 'relationships.batchSize', category: 'relationships', type: 'number', default: 10, description: 'KG extraction batch size' },
  { key: 'relationships.graphRetrievalEnabled', category: 'relationships', type: 'boolean', default: false, description: 'Graph-boosted retrieval enabled' },
  { key: 'relationships.graphBoostScore', category: 'relationships', type: 'number', description: 'Score boost for graph-related results' },
  { key: 'relationships.maxGraphHops', category: 'relationships', type: 'number', default: 2, description: 'Max graph traversal hops' },
  { key: 'relationships.maxRelatedResults', category: 'relationships', type: 'number', description: 'Max related results from the graph' },
  { key: 'relationships.resolveLawLevelFallback', category: 'relationships', type: 'boolean', description: 'Resolve to law-level when article missing' },
  { key: 'relationships.defaultEntities', category: 'relationships', type: 'json', description: 'Default entity types (JSON array)' },
  { key: 'relationships.defaultRelationships', category: 'relationships', type: 'json', description: 'Default relationship types (JSON array)' },

  // --- eval harness ----------------------------------------------------------
  { key: 'evalSettings.chatUrl', category: 'eval', type: 'string', description: 'Chat endpoint used by the eval harness' },
  { key: 'evalSettings.goldenSet', category: 'eval', type: 'json', description: 'Golden Q/A set (JSON)' },
  { key: 'evalSettings.judgeModel', category: 'eval', type: 'string', description: 'LLM-judge model' },
  { key: 'evalSettings.judgePrompt', category: 'eval', type: 'string', description: 'LLM-judge prompt' },
  { key: 'evalSettings.matcherMode', category: 'eval', type: 'string', description: 'Answer matcher mode' },
  { key: 'evalSettings.retrievalK', category: 'eval', type: 'number', description: 'Retrieval K for eval' },
  { key: 'evalSettings.seedDomainBuckets', category: 'eval', type: 'json', description: 'Seed domain buckets (JSON)' },
  { key: 'evalSettings.thresholds', category: 'eval', type: 'json', description: 'Pass/fail thresholds (JSON)' },

  // --- data health -----------------------------------------------------------
  { key: 'dataHealth.metadataFields', category: 'dataHealth', type: 'json', description: 'Required metadata keys per source table (JSON map)' },
  { key: 'dataHealth.selfSourcedTables', category: 'dataHealth', type: 'json', description: 'Self-sourced tables skipped in orphan/pending checks (JSON array)' },
  { key: 'dataHealth.pairing', category: 'dataHealth', type: 'json', description: 'Source/embedding table pairing config (JSON)' },

  // --- rag: search & fusion --------------------------------------------------
  { key: 'ragSettings.similarityThreshold', category: 'rag', type: 'number', default: 0.001, min: 0, max: 1, description: 'Vector similarity threshold' },
  { key: 'ragSettings.maxResults', category: 'rag', type: 'number', default: 10, description: 'Max retrieved results' },
  { key: 'ragSettings.minResults', category: 'rag', type: 'number', default: 3, description: 'Min retrieved results' },
  { key: 'ragSettings.enableHybridSearch', category: 'rag', type: 'boolean', default: true, description: 'Enable hybrid (vector + BM25) search' },
  { key: 'ragSettings.enableSemanticSearch', category: 'rag', type: 'boolean', default: true, description: 'Enable semantic (vector) search' },
  { key: 'ragSettings.enableBM25Search', category: 'rag', type: 'boolean', default: true, description: 'Enable BM25 keyword search' },
  { key: 'ragSettings.enableKeywordBoost', category: 'rag', type: 'boolean', description: 'Boost keyword matches' },
  { key: 'ragSettings.bm25Weight', category: 'rag', type: 'number', description: 'BM25 weight in RRF fusion' },
  { key: 'ragSettings.mediaWeight', category: 'rag', type: 'number', description: 'Media results weight' },

  // --- rag: strict mode & evidence gate --------------------------------------
  { key: 'ragSettings.strictMode', category: 'rag', type: 'boolean', description: 'Strict grounding mode' },
  { key: 'ragSettings.strictModeLevel', category: 'rag', type: 'string', description: 'Strict mode level' },
  { key: 'ragSettings.strictModeTemperature', category: 'rag', type: 'number', min: 0, max: 2, description: 'Temperature in strict mode' },
  { key: 'ragSettings.evidenceGateEnabled', category: 'rag', type: 'boolean', description: 'Evidence gate enabled' },
  { key: 'ragSettings.evidenceGateMinScore', category: 'rag', type: 'number', description: 'Evidence gate min score' },
  { key: 'ragSettings.evidenceGateMinChunks', category: 'rag', type: 'number', description: 'Evidence gate min chunks' },
  { key: 'ragSettings.highConfidenceThreshold', category: 'rag', type: 'number', description: 'High-confidence score threshold' },
  { key: 'ragSettings.lowConfidenceThreshold', category: 'rag', type: 'number', description: 'Low-confidence score threshold' },

  // --- rag: chunking & context limits ----------------------------------------
  { key: 'ragSettings.chunkSize', category: 'rag', type: 'number', min: 100, max: 5000, description: 'RAG chunk size (characters)' },
  { key: 'ragSettings.chunkOverlap', category: 'rag', type: 'number', description: 'RAG chunk overlap (characters)' },
  { key: 'ragSettings.maxContextLength', category: 'rag', type: 'number', description: 'Max assembled context length' },
  { key: 'ragSettings.maxExcerptLength', category: 'rag', type: 'number', description: 'Max excerpt length' },
  { key: 'ragSettings.excerptMaxLength', category: 'rag', type: 'number', description: 'Max excerpt length (alt key)' },
  { key: 'ragSettings.summaryMaxLength', category: 'rag', type: 'number', description: 'Max summary length' },

  // --- rag: reranking & cache ------------------------------------------------
  { key: 'ragSettings.rerankEnabled', category: 'rag', type: 'boolean', description: 'Reranking enabled' },
  { key: 'ragSettings.rerankProvider', category: 'rag', type: 'string', description: 'Reranker provider' },
  { key: 'ragSettings.rerankModel', category: 'rag', type: 'string', description: 'Reranker model' },
  { key: 'ragSettings.rerankMinScore', category: 'rag', type: 'number', description: 'Reranker min score' },
  { key: 'ragSettings.semanticCacheEnabled', category: 'rag', type: 'boolean', description: 'Semantic LLM cache enabled' },
  { key: 'ragSettings.semanticCacheThreshold', category: 'rag', type: 'number', description: 'Semantic cache similarity threshold' },
  { key: 'ragSettings.semanticCacheTTL', category: 'rag', type: 'number', description: 'Semantic cache TTL (seconds)' },
  { key: 'ragSettings.semanticCacheMinBestScore', category: 'rag', type: 'number', description: 'Min retrieval score to cache an answer (skip low-confidence)' },
  { key: 'ragSettings.semanticCacheMaxAnswerChars', category: 'rag', type: 'number', description: 'Max answer length to cache (chars)' },
  // corpusVersion: runtime-WRITTEN control value (cache scoping), but a first-class
  // config key — must remain writable outside the registry. NOT marked runtime.
  { key: 'ragSettings.corpusVersion', category: 'rag', type: 'string', description: 'Corpus version token (semantic-cache scope key)' },

  // --- rag: embedding sources & priorities -----------------------------------
  { key: 'ragSettings.enableUnifiedEmbeddings', category: 'rag', type: 'boolean', default: true, description: 'Use unified_embeddings source' },
  { key: 'ragSettings.enableDocumentEmbeddings', category: 'rag', type: 'boolean', description: 'Use document embeddings source' },
  { key: 'ragSettings.enableScrapeEmbeddings', category: 'rag', type: 'boolean', description: 'Use scrape embeddings source' },
  { key: 'ragSettings.enableMessageEmbeddings', category: 'rag', type: 'boolean', description: 'Use chat-message embeddings source' },
  { key: 'ragSettings.includeMediaDefault', category: 'rag', type: 'boolean', description: 'Include media results by default' },

  // --- rag: features & misc scalars ------------------------------------------
  { key: 'ragSettings.streamingEnabled', category: 'rag', type: 'boolean', description: 'Streaming chat enabled' },
  { key: 'ragSettings.agentMemoryEnabled', category: 'rag', type: 'boolean', description: 'Agent memory enabled' },

  // --- rag: large JSON/prompt config (migration-seeded; no code default) ------
  { key: 'ragSettings.sourceTypeNormalizations', category: 'rag', type: 'json', description: 'Source-type normalisation map (JSON)' },
  { key: 'ragSettings.sourceTypeLabels', category: 'rag', type: 'json', description: 'Source-type label/weight map (JSON)' },
  { key: 'ragSettings.fieldLabels', category: 'rag', type: 'json', description: 'Metadata field labels (JSON, per-language)' },
  { key: 'ragSettings.tocDetection', category: 'rag', type: 'json', description: 'Table-of-contents detection config (JSON)' },
  { key: 'ragSettings.strictContextTemplate', category: 'rag', type: 'json', description: 'Strict-mode context template (JSON)' },
  { key: 'ragSettings.htmlCleaningPatterns', category: 'rag', type: 'json', description: 'HTML cleaning regex patterns (JSON)' },
  { key: 'ragSettings.quotePrefixPatterns', category: 'rag', type: 'json', description: 'Quote-prefix strip patterns (JSON)' },
  { key: 'ragSettings.genericTitlePatterns', category: 'rag', type: 'json', description: 'Generic-title patterns (JSON)' },
  { key: 'ragSettings.preferredSourceTypes', category: 'rag', type: 'json', description: 'Preferred source types (JSON array)' },
  { key: 'ragSettings.strictModePromptTr', category: 'rag', type: 'string', description: 'Strict-mode prompt (Turkish content)' },
  { key: 'ragSettings.strictModePromptEn', category: 'rag', type: 'string', description: 'Strict-mode prompt (English content)' },
  { key: 'ragSettings.noResultsMessageTr', category: 'rag', type: 'string', description: 'No-results message (Turkish content)' },
  { key: 'ragSettings.noResultsMessageEn', category: 'rag', type: 'string', description: 'No-results message (English content)' },

  // --- rag: additional keys surfaced by the redesigned settings UI --------------
  { key: 'ragSettings.ftsLanguage', category: 'rag', type: 'string', default: 'simple', enum: ['simple', 'english', 'arabic', 'turkish'], description: 'Full-text search language (PostgreSQL FTS config)' },
  { key: 'ragSettings.agentMemoryRecallLimit', category: 'rag', type: 'number', default: 5, min: 0, description: 'Number of prior turns recalled from agent memory' },
  { key: 'ragSettings.autoFreshnessEnabled', category: 'rag', type: 'boolean', default: true, description: 'Auto-reflect newly added embeddings in retrieval' },
  { key: 'ragSettings.freshnessPollSeconds', category: 'rag', type: 'number', default: 30, min: 5, description: 'Freshness poll interval (seconds)' },
  { key: 'ragSettings.parallelLLMCount', category: 'rag', type: 'number', default: 4, min: 1, max: 16, description: 'Parallel LLM workers' },
  { key: 'ragSettings.parallelLLMBatchSize', category: 'rag', type: 'number', default: 3, min: 1, max: 10, description: 'Chunks processed per parallel batch' },
  { key: 'ragSettings.enablePdfUpload', category: 'rag', type: 'boolean', default: true, description: 'Allow PDF upload in chat' },
  { key: 'ragSettings.enableVoiceInput', category: 'rag', type: 'boolean', default: false, description: 'Enable voice input (speech-to-text)' },
  { key: 'ragSettings.enableVoiceOutput', category: 'rag', type: 'boolean', default: false, description: 'Enable voice output (text-to-speech)' },
  { key: 'ragSettings.maxPdfPages', category: 'rag', type: 'number', default: 30, min: 1, description: 'Max pages parsed from an uploaded PDF' },
  { key: 'ragSettings.maxPdfSizeMB', category: 'rag', type: 'number', default: 10, min: 1, description: 'Max uploaded PDF size (MB)' },

  // --- search: per-table retrieval weights -------------------------------------
  { key: 'search.sourceTableWeights', category: 'search', type: 'json', description: 'Per-table retrieval weight map (JSON: table -> weight)' },

  // --- voice (TTS/STT) ---------------------------------------------------------
  { key: 'voiceSettings.ttsProvider', category: 'voice', type: 'string', default: 'openai', enum: ['openai', 'google', 'elevenlabs'], description: 'Text-to-speech provider' },
  { key: 'voiceSettings.ttsVoice', category: 'voice', type: 'string', default: 'alloy', description: 'Text-to-speech voice' },
  { key: 'voiceSettings.ttsSpeed', category: 'voice', type: 'number', default: 1, min: 0.25, max: 4, description: 'Text-to-speech speed multiplier' },
  { key: 'voiceSettings.maxRecordingSeconds', category: 'voice', type: 'number', default: 60, min: 5, description: 'Max voice recording length (seconds)' },

  // --- config keys surfaced by the unified settings shell (Stage 1) -----------
  // These match the keys the legacy tab components read/write; most have no live
  // row yet (defaulted in the old UI) — defining them here makes them dynamic.
  { key: 'app.logoUrl', category: 'app', type: 'string', description: 'Application logo URL' },

  { key: 'voyage.apiKey', category: 'llm', type: 'secret', description: 'Voyage AI API key' },
  { key: 'cohere.apiKey', category: 'llm', type: 'secret', description: 'Cohere API key' },
  { key: 'xai.apiKey', category: 'llm', type: 'secret', description: 'xAI (Grok) API key' },

  { key: 'security.enableAuth', category: 'security', type: 'boolean', default: true, description: 'Require authentication' },
  { key: 'security.sessionTimeout', category: 'security', type: 'number', default: 24, min: 1, description: 'Session timeout (hours)' },
  { key: 'security.rateLimit', category: 'security', type: 'number', default: 100, min: 1, description: 'Rate limit (requests per minute)' },

  { key: 'storage.docsPath', category: 'storage', type: 'string', default: './docs', description: 'Documents storage path' },
  { key: 'storage.logsPath', category: 'storage', type: 'string', default: './logs', description: 'Logs storage path' },

  { key: 'advanced.upload_json_limit_mb', category: 'advanced', type: 'number', default: 100, min: 1, description: 'Max JSON upload size (MB)' },
  { key: 'advanced.upload_file_limit_mb', category: 'advanced', type: 'number', default: 100, min: 1, description: 'Max file upload size (MB)' },
  { key: 'advanced.upload_text_limit_mb', category: 'advanced', type: 'number', default: 1, min: 1, description: 'Max text upload size (MB)' },

  { key: 'smtp.host', category: 'smtp', type: 'string', description: 'SMTP host' },
  { key: 'smtp.port', category: 'smtp', type: 'number', default: 587, description: 'SMTP port' },
  { key: 'smtp.secure', category: 'smtp', type: 'boolean', default: true, description: 'Use TLS/SSL' },
  { key: 'smtp.username', category: 'smtp', type: 'string', description: 'SMTP username' },
  { key: 'smtp.password', category: 'smtp', type: 'secret', description: 'SMTP password' },
  { key: 'smtp.fromName', category: 'smtp', type: 'string', default: 'LSEMB', description: 'Email sender name' },

  { key: 'crawler.timeout', category: 'crawler', type: 'number', default: 30, description: 'Crawler request timeout (seconds)' },
  { key: 'crawler.maxConcurrency', category: 'crawler', type: 'number', default: 5, min: 1, description: 'Crawler max concurrency' },
  { key: 'crawler.enableJavaScript', category: 'crawler', type: 'boolean', default: true, description: 'Render JavaScript when crawling' },
  { key: 'crawler.followRedirects', category: 'crawler', type: 'boolean', default: true, description: 'Follow HTTP redirects' },
  { key: 'crawler.respectRobotsTxt', category: 'crawler', type: 'boolean', default: true, description: 'Respect robots.txt' },
  { key: 'crawler.proxyUrl', category: 'crawler', type: 'string', description: 'Proxy URL' },
  { key: 'crawler.proxyUsername', category: 'crawler', type: 'string', description: 'Proxy username' },
  { key: 'crawler.proxyPassword', category: 'crawler', type: 'secret', description: 'Proxy password' },

  { key: 'relationships.neo4jEnabled', category: 'relationships', type: 'boolean', default: true, description: 'Use Neo4j graph store' },
];

// -----------------------------------------------------------------------------
// Derived lookups.
// -----------------------------------------------------------------------------
const BY_KEY = new Map<string, SettingDef>(SETTINGS.map((d) => [d.key, d]));
const BY_ALIAS = new Map<string, SettingDef>();
for (const def of SETTINGS) {
  for (const alias of def.aliases ?? []) BY_ALIAS.set(alias, def);
}

export function getDef(key: string): SettingDef | undefined {
  return BY_KEY.get(key) ?? BY_ALIAS.get(key);
}

export function allDefs(): SettingDef[] {
  return SETTINGS;
}

export function defsByCategory(category: string): SettingDef[] {
  return SETTINGS.filter((d) => d.category === category);
}

/** Resolve a legacy/alias key to its canonical key (identity if already canonical/unknown). */
export function resolveAlias(key: string): string {
  const def = BY_ALIAS.get(key);
  return def ? def.key : key;
}

export function isSecretKey(key: string): boolean {
  const def = getDef(key);
  if (def) return def.type === 'secret';
  return SECRET_KEY_RE.test(key);
}

// -----------------------------------------------------------------------------
// Canonical coercion / serialization.
//   coerce:  raw text (as stored) -> typed JS value
//   serialize: typed JS value -> text for storage (mirrors settings.routes.ts:476)
// Unknown keys fall back to best-effort JSON parse (route behaviour) so the helpers
// stay permissive for telemetry / forward-compat rows.
// -----------------------------------------------------------------------------
const TRUE_STRINGS = new Set(['1', 'true', 'yes', 'on', 'enabled']);

export function coerceBoolean(raw: unknown): boolean {
  return TRUE_STRINGS.has(String(raw).trim().toLowerCase());
}

export function coerce(key: string, raw: string | null | undefined): unknown {
  const def = getDef(key);
  if (raw === null || raw === undefined) return def?.default;
  const type = def?.type;
  switch (type) {
    case 'number': {
      const n = Number(raw);
      return Number.isNaN(n) ? def?.default : n;
    }
    case 'boolean':
      return coerceBoolean(raw);
    case 'string':
    case 'secret':
      return raw;
    case 'json':
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
    default:
      // Unknown key — best-effort parse, matching the GET route's per-value JSON.parse.
      try {
        return JSON.parse(raw);
      } catch {
        return raw;
      }
  }
}

/** Serialize a typed value to text for storage. Mirrors settings.routes.ts POST. */
export function serialize(value: unknown): string {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

// -----------------------------------------------------------------------------
// Validation — reproduces settings.routes.ts:448-472 semantics (substring key match,
// same bounds and the chat-vs-embedding-model guard), extended with registry bounds/enum.
// Returns { ok:true } or { ok:false, error }. Unknown keys pass unless a substring rule hits.
// -----------------------------------------------------------------------------
// Non-discriminated on purpose so callers can read `.error` without needing
// control-flow narrowing (this project's tsconfig has loose strictness).
export type ValidationResult = { ok: boolean; error?: string };

const CHAT_MODEL_PATTERNS = ['gpt-4o', 'gpt-4', 'gpt-3.5', 'claude', 'gemini'];

export function validate(key: string, value: unknown): ValidationResult {
  // Substring rules (byte-compatible with the current route).
  if (key.includes('temperature') && (typeof value !== 'number' || value < 0 || value > 2)) {
    return { ok: false, error: `Invalid temperature value: ${value}. Must be between 0 and 2.` };
  }
  if (key.includes('chunkSize') && (typeof value !== 'number' || value < 100 || value > 5000)) {
    return { ok: false, error: `Invalid chunkSize value: ${value}. Must be between 100 and 5000.` };
  }
  if (key.includes('similarityThreshold') && (typeof value !== 'number' || value < 0 || value > 1)) {
    return { ok: false, error: `Invalid similarityThreshold value: ${value}. Must be between 0 and 1.` };
  }
  if (
    (key === 'llmSettings.activeEmbeddingModel' || key === 'llmSettings.embeddingModel') &&
    typeof value === 'string'
  ) {
    const lower = value.toLowerCase();
    const isLikelyChatModel =
      CHAT_MODEL_PATTERNS.some((p) => lower.includes(p)) && !lower.includes('embedding');
    if (isLikelyChatModel) {
      return {
        ok: false,
        error: `Invalid embedding model: "${value}" is a chat model, not an embedding model. Please use a model that includes "embedding" in its name (e.g., text-embedding-3-small, text-embedding-004).`,
      };
    }
  }

  // Registry-declared bounds / enum (only for known numeric/enum keys).
  const def = getDef(key);
  if (def) {
    if (def.type === 'number' && typeof value === 'number') {
      if (def.min !== undefined && value < def.min) {
        return { ok: false, error: `Invalid ${key}: ${value} < min ${def.min}.` };
      }
      if (def.max !== undefined && value > def.max) {
        return { ok: false, error: `Invalid ${key}: ${value} > max ${def.max}.` };
      }
    }
    if (def.enum && typeof value === 'string' && !def.enum.includes(value)) {
      return { ok: false, error: `Invalid ${key}: "${value}" not in [${def.enum.join(', ')}].` };
    }
  }
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Category → key-prefix mapping used by the GET route (settings.routes.ts:163-219).
// Kept here so the write path (POST) and the read path agree on prefixes.
// -----------------------------------------------------------------------------
export const CATEGORY_KEY_PREFIXES: Record<string, string[]> = {
  llm: [
    'openai.', 'google.', 'anthropic.', 'deepseek.', 'llmSettings.', 'ollama.',
    'huggingface.', 'openrouter.', 'voyage.', 'cohere.', 'jina.',
    'apiStatus.', 'llmStatus.', 'ocrSettings.', 'ocrProvider',
  ],
  embeddings: ['embeddings.', 'embedding.'],
  rag: ['ragSettings.', 'rag.'],
  prompts: ['prompts.'],
  chatbot: ['chatbot.'],
  database: ['database.'],
  redis: ['redis.'],
  n8n: ['n8n.'],
  security: ['security.', 'jwt.'],
  app: ['app.'],
  scraper: ['scraper.'],
  translation: ['deepl.', 'google.translate.'],
  ocr: ['ocr.', 'ocrSettings.'],
  relationships: ['relationships.'],
};

// First-segment → category, mirroring the POST route's categoryMap (settings.routes.ts:485-503).
const FIRST_SEGMENT_CATEGORY: Record<string, string> = {
  llmSettings: 'llm', openai: 'llm', anthropic: 'llm', google: 'llm', deepseek: 'llm',
  voyage: 'llm', cohere: 'llm', huggingface: 'llm', openrouter: 'llm', jina: 'llm',
  embedding: 'embeddings', embeddings: 'embeddings',
  ragSettings: 'rag', prompts: 'prompts', chatbot: 'chatbot',
  database: 'database', redis: 'redis', app: 'app',
};

/**
 * Category to persist for a key. Prefers the registry's canonical category, then the
 * route's first-segment map, else 'general' (the table default). Used by the write path.
 */
export function categoryForKey(key: string): string {
  const def = getDef(key);
  if (def) return def.category;
  return FIRST_SEGMENT_CATEGORY[key.split('.')[0]] ?? 'general';
}

// -----------------------------------------------------------------------------
// GET category projection — reproduces the structural transform of settings.routes.ts
// (nest by first dotted segment, best-effort per-value JSON.parse, the synthesized
// apiStatus block for `llm`, activeEmbeddingModel construction/split, then redaction).
//
// NOTE: this intentionally does NOT apply the route's env-var fallbacks for
// activeChatModel/activeEmbeddingModel (lines 366-380) — those are Hard-Rule-violating
// policy that will move to registry defaults. For rows that already contain the active
// models (the normal configured case), the output equals the current route output.
// -----------------------------------------------------------------------------
export interface SettingRow {
  key: string;
  value: string | null;
}

export function projectCategory(rows: SettingRow[], category: string): Record<string, any> {
  const config: Record<string, any> = {};

  for (const row of rows) {
    const [section, ...keyParts] = row.key.split('.');
    const key = keyParts.join('.');
    if (!config[section]) config[section] = {};
    try {
      config[section][key] = JSON.parse(row.value as string);
    } catch {
      config[section][key] = row.value;
    }
  }

  if (category === 'llm') {
    const apiStatus: Record<string, any> = {};
    const providers = ['openai', 'google', 'anthropic', 'deepseek', 'huggingface', 'openrouter', 'deepl', 'voyage', 'cohere'];
    for (const provider of providers) {
      const providerConfig = config[provider];
      const providerApiStatus = config.apiStatus?.[provider];
      if (providerConfig || providerApiStatus) {
        const verifiedDate = providerConfig?.verifiedDate || providerApiStatus?.verifiedDate;
        const status = providerConfig?.status || providerApiStatus?.status || 'active';
        if (verifiedDate) {
          apiStatus[provider] = {
            status,
            message: providerApiStatus?.message || `${provider} API validated successfully`,
            lastChecked: providerApiStatus?.lastChecked || verifiedDate,
            verifiedDate,
            responseTime: providerConfig?.avgResponseTime || providerApiStatus?.responseTime || 0,
          };
        } else if (providerConfig?.apiKey) {
          apiStatus[provider] = {
            status: 'inactive',
            message: 'API key not validated',
            lastChecked: null,
            verifiedDate: null,
          };
        }
      }
    }
    config.apiStatus = apiStatus;

    if (!config.llmSettings) config.llmSettings = {};
    if (!config.llmSettings.activeEmbeddingModel && config.llmSettings.embeddingProvider && config.llmSettings.embeddingModel) {
      config.llmSettings.activeEmbeddingModel = `${config.llmSettings.embeddingProvider}/${config.llmSettings.embeddingModel}`;
    }
    if (config.llmSettings.activeEmbeddingModel) {
      const parts = String(config.llmSettings.activeEmbeddingModel).split('/');
      if (parts.length === 2) {
        config.llmSettings.embeddingProvider = parts[0];
        config.llmSettings.embeddingModel = parts[1];
      }
    }
  }

  return redactSettingsSecrets(config);
}
