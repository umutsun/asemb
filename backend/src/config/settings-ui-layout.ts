// =============================================================================
// Settings UI layout — the PRESENTATION layer for the redesigned settings shell.
//
// The settings registry (settings-registry.ts) stays the single source of truth for
// each key's type / default / min-max / enum / secret / validation. This file only
// decides HOW keys are grouped and labelled in the UI (nav sections → groups → fields),
// and provides Answer-Safety presets. `buildSettingsSchema()` merges the two into a
// ready-to-render schema (no secret values) that the frontend renders generically.
//
// Scope (v1): RAG + Chatbot — the messiest area. Other categories reuse this same
// mechanism later by adding more sections here.
// =============================================================================

import { getDef, SettingType } from './settings-registry';

export type ControlType =
  | 'switch'
  | 'slider'
  | 'segmented'
  | 'select'
  | 'text'
  | 'secret'
  | 'textarea'
  | 'json'
  | 'range'
  | 'sourceBars';

interface LayoutField {
  key: string;
  label: string;
  help?: string;
  control?: ControlType; // override the inferred control
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: string; label: string }[]; // override enum options
  optionsFrom?: 'chatModels' | 'embeddingModels'; // build select options from llm-metadata
  advanced?: boolean; // hidden under a per-group "Advanced" expander
  rangeMaxKey?: string; // for control 'range': this key is the min, rangeMaxKey the max
}

// Bespoke components embedded under the unified nav (entity-managers / ops that
// cannot be generated from registry keys). The frontend shell maps each to a component.
export type ComponentKey =
  | 'patterns'
  | 'dataSchema'
  | 'googleDrive'
  | 'apiTokens'
  | 'embeddingsManager'
  | 'services'
  | 'scheduler';

interface LayoutGroup {
  id: string;
  title: string;
  fields?: LayoutField[];
  component?: ComponentKey; // embed a bespoke component instead of generated fields
  preset?: 'answerSafety'; // render preset cards at the top of this section
  providerCards?: boolean; // render the metadata-driven provider cards (keeps `fields` for value loading)
  collection?: 'prompts'; // render a list/collection editor over a JSON-array key
}

interface LayoutSection {
  id: string;
  navGroup: string; // top-level nav heading (e.g. "RAG", "Chatbot")
  title: string;
  blurb: string;
  groups: LayoutGroup[];
}

// -----------------------------------------------------------------------------
// Nav layout: 6 focused groups (was 10 flat sections in the old monolith).
// -----------------------------------------------------------------------------
const NAV: LayoutSection[] = [
  // ===== GENERAL =====
  {
    id: 'app',
    navGroup: 'General',
    title: 'Application',
    blurb: 'Branding and locale shown across the app.',
    groups: [
      {
        id: 'branding',
        title: 'Branding',
        fields: [
          { key: 'app.name', label: 'Application name' },
          { key: 'app.description', label: 'Description' },
          { key: 'app.logoUrl', label: 'Logo URL' },
          { key: 'app.locale', label: 'Default locale' },
        ],
      },
    ],
  },

  // ===== AI PROVIDERS =====
  {
    id: 'providers',
    navGroup: 'AI Providers',
    title: 'API Keys',
    blurb: 'Provider credentials. Leave a key blank to keep the stored value. (Test-connection & model lists come next.)',
    groups: [
      {
        id: 'keys',
        title: 'Provider keys',
        providerCards: true,
        fields: [
          { key: 'openai.apiKey', label: 'OpenAI' },
          { key: 'anthropic.apiKey', label: 'Anthropic (Claude)' },
          { key: 'google.apiKey', label: 'Google (Gemini)' },
          { key: 'deepseek.apiKey', label: 'DeepSeek' },
          { key: 'openrouter.apiKey', label: 'OpenRouter' },
          { key: 'xai.apiKey', label: 'xAI (Grok)' },
          { key: 'huggingface.apiKey', label: 'HuggingFace' },
          { key: 'jina.apiKey', label: 'Jina AI' },
          { key: 'voyage.apiKey', label: 'Voyage AI' },
          { key: 'cohere.apiKey', label: 'Cohere' },
        ],
      },
    ],
  },
  {
    id: 'models',
    navGroup: 'AI Providers',
    title: 'Active Models',
    blurb: 'The active chat and embedding models, and generation parameters.',
    groups: [
      {
        id: 'active',
        title: 'Active models',
        fields: [
          { key: 'llmSettings.activeChatModel', label: 'Chat model', control: 'select', optionsFrom: 'chatModels' },
          { key: 'llmSettings.activeEmbeddingModel', label: 'Embedding model', control: 'select', optionsFrom: 'embeddingModels' },
        ],
      },
      {
        id: 'generation',
        title: 'Generation',
        fields: [
          { key: 'llmSettings.temperature', label: 'Temperature', min: 0, max: 2, step: 0.05 },
          { key: 'llmSettings.topP', label: 'Top-p', min: 0, max: 1, step: 0.05, advanced: true },
          { key: 'llmSettings.maxTokens', label: 'Max output tokens', advanced: true },
          { key: 'llmSettings.streamResponse', label: 'Stream responses' },
          { key: 'llmSettings.language', label: 'Answer language' },
          { key: 'llmSettings.systemPrompt', label: 'System prompt', control: 'textarea', advanced: true },
        ],
      },
    ],
  },
  {
    id: 'embeddings',
    navGroup: 'AI Providers',
    title: 'Embeddings',
    blurb: 'Embedding provider, model and chunking.',
    groups: [
      {
        id: 'embeddings',
        title: 'Embeddings',
        fields: [
          { key: 'embeddings.provider', label: 'Provider' },
          { key: 'embeddings.model', label: 'Model' },
          { key: 'embeddings.dimension', label: 'Dimension', advanced: true },
          { key: 'embeddings.chunkSize', label: 'Chunk size', min: 100, max: 5000, step: 100 },
          { key: 'embeddings.chunkOverlap', label: 'Chunk overlap', advanced: true },
          { key: 'embeddings.batchSize', label: 'Batch size', advanced: true },
          { key: 'embeddings.enabled', label: 'Embedding pipeline enabled' },
        ],
      },
    ],
  },
  {
    id: 'translation',
    navGroup: 'AI Providers',
    title: 'Translation',
    blurb: 'Translation provider and keys.',
    groups: [
      {
        id: 'translation',
        title: 'Translation',
        fields: [
          { key: 'llmSettings.translationProvider', label: 'Provider' },
          { key: 'deepl.apiKey', label: 'DeepL API key' },
          { key: 'google.translate.apiKey', label: 'Google Translate API key' },
          { key: 'translation.model', label: 'Translation model', advanced: true },
        ],
      },
    ],
  },
  {
    id: 'ocr',
    navGroup: 'AI Providers',
    title: 'OCR',
    blurb: 'Optical character recognition for scanned documents.',
    groups: [
      {
        id: 'ocr',
        title: 'OCR',
        fields: [
          { key: 'ocrSettings.activeProvider', label: 'Active provider', control: 'select', options: [{ value: 'auto', label: 'Auto' }, { value: 'openai', label: 'OpenAI' }, { value: 'gemini', label: 'Gemini' }, { value: 'deepseek', label: 'DeepSeek' }, { value: 'tesseract', label: 'Tesseract (local)' }] },
          { key: 'ocrSettings.fallbackEnabled', label: 'Fallback enabled' },
          { key: 'ocrSettings.fallbackProvider', label: 'Fallback provider', control: 'select', options: [{ value: 'tesseract', label: 'Tesseract (local)' }, { value: 'openai', label: 'OpenAI' }, { value: 'gemini', label: 'Gemini' }] },
          { key: 'ocrSettings.cacheEnabled', label: 'Cache enabled', advanced: true },
          { key: 'ocrSettings.cacheTTL', label: 'Cache TTL (seconds)', advanced: true },
        ],
      },
    ],
  },

  {
    id: 'safety',
    navGroup: 'RAG',
    title: 'Answer Safety',
    blurb: 'Decide when the model answers versus admits it lacks enough evidence. A preset sets most thresholds; open Custom to fine-tune.',
    groups: [
      { id: 'presets', title: '', preset: 'answerSafety' },
      {
        id: 'evidence',
        title: 'Evidence gate',
        fields: [
          { key: 'ragSettings.evidenceGateEnabled', label: 'Refuse when evidence is weak', help: 'Honestly decline when no sufficiently relevant sources are found', advanced: true },
          { key: 'ragSettings.evidenceGateMinScore', label: 'Minimum source quality', help: 'Sources below this score do not count', min: 0, max: 1, step: 0.05, advanced: true },
          { key: 'ragSettings.evidenceGateMinChunks', label: 'Minimum supporting sources', help: 'Strong sources required to answer', min: 1, max: 10, step: 1, advanced: true },
        ],
      },
      {
        id: 'confidence',
        title: 'Confidence & determinism',
        fields: [
          { key: 'ragSettings.strictModeLevel', label: 'Strictness level', control: 'segmented', options: [{ value: 'relaxed', label: 'Relaxed' }, { value: 'medium', label: 'Medium' }, { value: 'strict', label: 'Strict' }], advanced: true },
          { key: 'ragSettings.strictModeTemperature', label: 'Answer determinism', help: 'Lower = more consistent, higher = more creative (temperature)', min: 0, max: 1, step: 0.05, advanced: true },
        ],
      },
    ],
  },
  {
    id: 'retrieval',
    navGroup: 'RAG',
    title: 'Retrieval',
    blurb: 'How many sources are fetched, the vector/keyword mix, and reranking.',
    groups: [
      {
        id: 'scope',
        title: 'Scope',
        fields: [
          { key: 'ragSettings.similarityThreshold', label: 'Similarity threshold', help: 'Lower value = more results', min: 0.001, max: 0.5, step: 0.005 },
          { key: 'ragSettings.minResults', label: 'Results range', help: 'Minimum / maximum sources', control: 'range', rangeMaxKey: 'ragSettings.maxResults', min: 0, max: 50, step: 1 },
        ],
      },
      {
        id: 'hybrid',
        title: 'Hybrid search',
        fields: [
          { key: 'ragSettings.enableHybridSearch', label: 'Hybrid search (vector + BM25)', help: 'Combine semantic and full-text search' },
          { key: 'ragSettings.bm25Weight', label: 'BM25 / vector balance', help: 'Left = semantic-weighted, right = keyword-weighted', min: 0, max: 1, step: 0.05 },
          { key: 'ragSettings.ftsLanguage', label: 'Full-text search language', control: 'select' },
        ],
      },
      {
        id: 'rerank',
        title: 'Reranking',
        fields: [
          { key: 'ragSettings.rerankEnabled', label: 'Reranker', help: 'Re-order results with a cross-encoder' },
          { key: 'ragSettings.rerankProvider', label: 'Reranker provider', control: 'segmented', options: [{ value: 'local', label: 'Local' }, { value: 'jina', label: 'Jina' }] },
          { key: 'ragSettings.rerankMinScore', label: 'Rerank min score', min: 0, max: 1, step: 0.05, advanced: true },
          { key: 'ragSettings.rerankModel', label: 'Reranker model', advanced: true },
        ],
      },
    ],
  },
  {
    id: 'sources',
    navGroup: 'RAG',
    title: 'Sources',
    blurb: 'Which tables retrieval trusts more. Weights bias ordering during retrieval.',
    groups: [
      {
        id: 'tables',
        title: 'Table weights',
        fields: [
          { key: 'search.sourceTableWeights', label: 'Per-table weights', control: 'sourceBars' },
        ],
      },
    ],
  },
  {
    id: 'cache',
    navGroup: 'RAG',
    title: 'Cache & Memory',
    blurb: 'Performance and context: response cache, agent memory, data freshness and batching.',
    groups: [
      {
        id: 'performance',
        title: 'Performance',
        fields: [
          { key: 'ragSettings.semanticCacheEnabled', label: 'Semantic response cache', help: 'Reuse answers for similar questions' },
          { key: 'ragSettings.agentMemoryEnabled', label: 'Agent memory', help: 'Remember across turns' },
          { key: 'ragSettings.autoFreshnessEnabled', label: 'Real-time data freshness', help: 'Auto-reflect new embeddings' },
          { key: 'ragSettings.parallelLLMBatchSize', label: 'Batch size', help: 'Chunks processed in parallel', min: 1, max: 10, step: 1 },
        ],
      },
      {
        id: 'cache-adv',
        title: 'Advanced',
        fields: [
          { key: 'ragSettings.semanticCacheThreshold', label: 'Cache similarity threshold', min: 0, max: 1, step: 0.01, advanced: true },
          { key: 'ragSettings.semanticCacheTTL', label: 'Cache TTL (seconds)', advanced: true },
          { key: 'ragSettings.freshnessPollSeconds', label: 'Freshness poll (seconds)', advanced: true },
          { key: 'ragSettings.agentMemoryRecallLimit', label: 'Agent memory recall limit', min: 0, max: 20, step: 1, advanced: true },
          { key: 'ragSettings.parallelLLMCount', label: 'Parallel LLM workers', min: 1, max: 16, step: 1, advanced: true },
        ],
      },
    ],
  },
  {
    id: 'chat',
    navGroup: 'Chatbot',
    title: 'Chat',
    blurb: 'Input features and voice. (Welcome message and suggestion cards live in the chatbot config blob and are edited separately.)',
    groups: [
      {
        id: 'input',
        title: 'Input features',
        fields: [
          { key: 'ragSettings.enablePdfUpload', label: 'PDF upload' },
          { key: 'ragSettings.enableVoiceInput', label: 'Voice input (STT)' },
          { key: 'ragSettings.enableVoiceOutput', label: 'Voice output (TTS)' },
          { key: 'ragSettings.streamingEnabled', label: 'Streaming responses' },
        ],
      },
      {
        id: 'voice',
        title: 'Voice',
        fields: [
          { key: 'voiceSettings.ttsProvider', label: 'TTS provider', control: 'select' },
          { key: 'voiceSettings.ttsVoice', label: 'TTS voice' },
          { key: 'voiceSettings.ttsSpeed', label: 'TTS speed', min: 0.25, max: 4, step: 0.05, advanced: true },
          { key: 'voiceSettings.maxRecordingSeconds', label: 'Max recording (seconds)', advanced: true },
        ],
      },
    ],
  },
  {
    id: 'patterns',
    navGroup: 'Chatbot',
    title: 'Question Patterns',
    blurb: 'Rules that shape follow-up questions by content type.',
    groups: [{ id: 'patterns', title: '', component: 'patterns' }],
  },
  {
    id: 'prompts',
    navGroup: 'Chatbot',
    title: 'Prompts',
    blurb: 'System prompts / personas. One is active at a time.',
    groups: [
      { id: 'prompts', title: 'Prompt list', collection: 'prompts', fields: [{ key: 'prompts.list', label: 'Prompts', control: 'json' }] },
    ],
  },

  // ===== KNOWLEDGE =====
  {
    id: 'relationships',
    navGroup: 'Knowledge',
    title: 'Relationships',
    blurb: 'Knowledge-graph extraction and graph-boosted retrieval.',
    groups: [
      {
        id: 'extraction',
        title: 'Extraction',
        fields: [
          { key: 'relationships.extractionEnabled', label: 'Extraction enabled' },
          { key: 'relationships.extractionModel', label: 'Extraction model' },
          { key: 'relationships.batchSize', label: 'Batch size', min: 10, max: 200, step: 10, advanced: true },
          { key: 'relationships.confidenceThreshold', label: 'Confidence threshold', min: 0, max: 1, step: 0.05 },
        ],
      },
      {
        id: 'graph',
        title: 'Graph retrieval',
        fields: [
          { key: 'relationships.graphRetrievalEnabled', label: 'Graph-boosted retrieval' },
          { key: 'relationships.graphBoostScore', label: 'Graph boost score', min: 0, max: 0.2, step: 0.01, advanced: true },
          { key: 'relationships.maxGraphHops', label: 'Max graph hops', min: 1, max: 3, step: 1, advanced: true },
          { key: 'relationships.maxRelatedResults', label: 'Max related results', min: 1, max: 10, step: 1, advanced: true },
          { key: 'relationships.neo4jEnabled', label: 'Use Neo4j', advanced: true },
        ],
      },
    ],
  },
  {
    id: 'dataSchema',
    navGroup: 'Knowledge',
    title: 'Data Schema',
    blurb: 'Domain schemas, fields and per-schema LLM config.',
    groups: [{ id: 'dataSchema', title: '', component: 'dataSchema' }],
  },

  // ===== SYSTEM =====
  {
    id: 'security',
    navGroup: 'System',
    title: 'Security',
    blurb: 'Authentication, rate limits and secrets.',
    groups: [
      {
        id: 'auth',
        title: 'Authentication',
        fields: [
          { key: 'security.enableAuth', label: 'Require authentication' },
          { key: 'security.sessionTimeout', label: 'Session timeout (hours)', advanced: true },
          { key: 'security.rateLimit', label: 'Rate limit (req/min)', advanced: true },
        ],
      },
      {
        id: 'secrets',
        title: 'Secrets',
        fields: [
          { key: 'jwt.secret', label: 'JWT secret' },
          { key: 'security.mcpBearerKey', label: 'MCP bearer key', help: 'Blank = use env INTERNAL_API_KEY' },
        ],
      },
    ],
  },
  {
    id: 'database',
    navGroup: 'System',
    title: 'Database',
    blurb: 'PostgreSQL connection (used by migration/source tooling).',
    groups: [
      {
        id: 'postgres',
        title: 'PostgreSQL',
        fields: [
          { key: 'database.host', label: 'Host' },
          { key: 'database.port', label: 'Port' },
          { key: 'database.name', label: 'Database' },
          { key: 'database.user', label: 'User' },
          { key: 'database.password', label: 'Password' },
          { key: 'database.ssl', label: 'SSL', advanced: true },
          { key: 'database.maxConnections', label: 'Max connections', advanced: true },
        ],
      },
    ],
  },
  {
    id: 'redis',
    navGroup: 'System',
    title: 'Redis',
    blurb: 'Redis connection (cache / broker).',
    groups: [
      {
        id: 'redis',
        title: 'Redis',
        fields: [
          { key: 'redis.host', label: 'Host' },
          { key: 'redis.port', label: 'Port' },
          { key: 'redis.password', label: 'Password' },
          { key: 'redis.db', label: 'DB index', advanced: true },
        ],
      },
    ],
  },
  {
    id: 'storage',
    navGroup: 'System',
    title: 'Storage & Uploads',
    blurb: 'File storage paths and upload size limits.',
    groups: [
      {
        id: 'paths',
        title: 'Paths',
        fields: [
          { key: 'storage.docsPath', label: 'Documents path' },
          { key: 'storage.logsPath', label: 'Logs path' },
        ],
      },
      {
        id: 'limits',
        title: 'Upload limits',
        fields: [
          { key: 'advanced.upload_file_limit_mb', label: 'File limit (MB)' },
          { key: 'advanced.upload_json_limit_mb', label: 'JSON limit (MB)' },
          { key: 'advanced.upload_text_limit_mb', label: 'Text limit (MB)' },
        ],
      },
    ],
  },
  {
    id: 'email',
    navGroup: 'System',
    title: 'Email (SMTP)',
    blurb: 'Outgoing email configuration.',
    groups: [
      {
        id: 'smtp',
        title: 'SMTP',
        fields: [
          { key: 'smtp.host', label: 'Host' },
          { key: 'smtp.port', label: 'Port' },
          { key: 'smtp.secure', label: 'Use TLS/SSL' },
          { key: 'smtp.username', label: 'Username' },
          { key: 'smtp.password', label: 'Password' },
          { key: 'smtp.fromName', label: 'From name' },
        ],
      },
    ],
  },
  {
    id: 'crawler',
    navGroup: 'System',
    title: 'Crawler',
    blurb: 'Web crawler / scraper behaviour.',
    groups: [
      {
        id: 'behaviour',
        title: 'Behaviour',
        fields: [
          { key: 'crawler.timeout', label: 'Timeout (seconds)' },
          { key: 'crawler.maxConcurrency', label: 'Max concurrency' },
          { key: 'crawler.enableJavaScript', label: 'Render JavaScript' },
          { key: 'crawler.followRedirects', label: 'Follow redirects', advanced: true },
          { key: 'crawler.respectRobotsTxt', label: 'Respect robots.txt', advanced: true },
        ],
      },
      {
        id: 'proxy',
        title: 'Proxy',
        fields: [
          { key: 'crawler.proxyUrl', label: 'Proxy URL', advanced: true },
          { key: 'crawler.proxyUsername', label: 'Proxy username', advanced: true },
          { key: 'crawler.proxyPassword', label: 'Proxy password', advanced: true },
        ],
      },
    ],
  },
  {
    id: 'voice',
    navGroup: 'System',
    title: 'Voice',
    blurb: 'Speech-to-text and text-to-speech.',
    groups: [
      {
        id: 'voice',
        title: 'Voice',
        fields: [
          { key: 'voiceSettings.ttsProvider', label: 'TTS provider', control: 'select' },
          { key: 'voiceSettings.ttsVoice', label: 'TTS voice' },
          { key: 'voiceSettings.ttsSpeed', label: 'TTS speed', min: 0.25, max: 4, step: 0.05, advanced: true },
          { key: 'voiceSettings.maxRecordingSeconds', label: 'Max recording (seconds)', advanced: true },
        ],
      },
    ],
  },
  {
    id: 'media',
    navGroup: 'System',
    title: 'Media (Multimodal)',
    blurb: 'Cross-modal media embeddings (CLIP). Gated off by default.',
    groups: [
      {
        id: 'media',
        title: 'Media embeddings',
        fields: [
          { key: 'mediaEmbedding.enabled', label: 'Enabled' },
          { key: 'mediaEmbedding.provider', label: 'Provider' },
          { key: 'mediaEmbedding.model', label: 'Model' },
          { key: 'mediaEmbedding.apiKey', label: 'API key' },
          { key: 'mediaEmbedding.dimension', label: 'Dimension', advanced: true },
          { key: 'mediaEmbedding.captionModel', label: 'Caption model', advanced: true },
        ],
      },
    ],
  },
  {
    id: 'eval',
    navGroup: 'System',
    title: 'Evaluation',
    blurb: 'Retrieval / answer evaluation harness.',
    groups: [
      {
        id: 'eval',
        title: 'Eval harness',
        fields: [
          { key: 'evalSettings.chatUrl', label: 'Chat URL' },
          { key: 'evalSettings.retrievalK', label: 'Retrieval K' },
          { key: 'evalSettings.judgeModel', label: 'Judge model' },
          { key: 'evalSettings.matcherMode', label: 'Matcher mode' },
          { key: 'evalSettings.judgePrompt', label: 'Judge prompt', control: 'textarea', advanced: true },
          { key: 'evalSettings.thresholds', label: 'Thresholds (JSON)', control: 'json', advanced: true },
          { key: 'evalSettings.goldenSet', label: 'Golden set (JSON)', control: 'json', advanced: true },
          { key: 'evalSettings.seedDomainBuckets', label: 'Seed domain buckets (JSON)', control: 'json', advanced: true },
        ],
      },
    ],
  },

  // ===== INTEGRATIONS =====
  {
    id: 'apiTokens',
    navGroup: 'Integrations',
    title: 'API Tokens',
    blurb: 'Bearer tokens for the external chat API.',
    groups: [{ id: 'apiTokens', title: '', component: 'apiTokens' }],
  },

  // ===== OPS =====
  {
    id: 'scheduler',
    navGroup: 'Ops',
    title: 'Scheduler',
    blurb: 'Scheduled crawler jobs.',
    groups: [{ id: 'scheduler', title: '', component: 'scheduler' }],
  },
];

// -----------------------------------------------------------------------------
// Answer-Safety presets — atomic bundles applied to real ragSettings keys.
// -----------------------------------------------------------------------------
export const ANSWER_SAFETY_PRESETS = {
  strict: {
    label: 'Strict',
    blurb: 'Answers only with strong evidence. For legal / critical content.',
    values: {
      'ragSettings.evidenceGateEnabled': true,
      'ragSettings.evidenceGateMinScore': 0.7,
      'ragSettings.evidenceGateMinChunks': 2,
      'ragSettings.strictMode': true,
      'ragSettings.strictModeLevel': 'strict',
      'ragSettings.strictModeTemperature': 0.2,
    },
  },
  balanced: {
    label: 'Balanced',
    blurb: 'Balances evidence and coverage. Recommended default.',
    values: {
      'ragSettings.evidenceGateEnabled': true,
      'ragSettings.evidenceGateMinScore': 0.55,
      'ragSettings.evidenceGateMinChunks': 1,
      'ragSettings.strictMode': true,
      'ragSettings.strictModeLevel': 'medium',
      'ragSettings.strictModeTemperature': 0.4,
    },
  },
  comprehensive: {
    label: 'Comprehensive',
    blurb: 'Answers even with weaker evidence, refuses less. For exploration.',
    values: {
      'ragSettings.evidenceGateEnabled': false,
      'ragSettings.evidenceGateMinScore': 0.35,
      'ragSettings.evidenceGateMinChunks': 1,
      'ragSettings.strictMode': false,
      'ragSettings.strictModeLevel': 'relaxed',
      'ragSettings.strictModeTemperature': 0.6,
    },
  },
} as const;

// -----------------------------------------------------------------------------
// Merge layout + registry → a ready-to-render schema. No secret values are emitted
// (the schema is structure only; current values come from GET /settings?category).
// -----------------------------------------------------------------------------
export interface SchemaField {
  key: string;
  label: string;
  help?: string;
  control: ControlType;
  type: SettingType;
  secret: boolean;
  options?: { value: string; label: string }[];
  optionsFrom?: 'chatModels' | 'embeddingModels';
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  default?: unknown;
  advanced: boolean;
  rangeMaxKey?: string;
}

function resolveOptions(lf: LayoutField, defEnum?: string[]): { value: string; label: string }[] | undefined {
  if (lf.options) return lf.options;
  if (defEnum) return defEnum.map((v) => ({ value: v, label: v }));
  return undefined;
}

function resolveControl(lf: LayoutField, type: SettingType, hasBounds: boolean, options?: unknown[]): ControlType {
  if (lf.control) return lf.control;
  switch (type) {
    case 'secret':
      return 'secret';
    case 'boolean':
      return 'switch';
    case 'json':
      return 'json';
    case 'number':
      return hasBounds ? 'slider' : 'text';
    case 'string':
      if (options && options.length) return options.length <= 3 ? 'segmented' : 'select';
      return 'text';
    default:
      return 'text';
  }
}

function mergeField(lf: LayoutField): SchemaField {
  const def = getDef(lf.key);
  const type: SettingType = def?.type ?? 'string';
  const min = lf.min ?? def?.min;
  const max = lf.max ?? def?.max;
  const options = resolveOptions(lf, def?.enum);
  const hasBounds = min !== undefined && max !== undefined;
  return {
    key: lf.key,
    label: lf.label,
    help: lf.help,
    control: resolveControl(lf, type, hasBounds, options),
    type,
    secret: type === 'secret',
    options,
    optionsFrom: lf.optionsFrom,
    min,
    max,
    step: lf.step,
    unit: lf.unit,
    default: type === 'secret' ? undefined : def?.default,
    advanced: lf.advanced ?? false,
    rangeMaxKey: lf.rangeMaxKey,
  };
}

export function buildSettingsSchema() {
  const sections = NAV.map((s) => {
    const groups = s.groups.map((g) => ({
      id: g.id,
      title: g.title,
      component: g.component,
      preset: g.preset,
      providerCards: g.providerCards,
      collection: g.collection,
      fields: (g.fields ?? []).map(mergeField),
    }));
    const count = groups.reduce((n, g) => n + g.fields.length, 0);
    return { id: s.id, navGroup: s.navGroup, title: s.title, blurb: s.blurb, count, groups };
  });
  return { sections, presets: ANSWER_SAFETY_PRESETS };
}
