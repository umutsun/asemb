// =============================================================================
// LLM metadata — single source of truth for the settings UI's provider/model/pricing
// lists. Consolidates what used to be 8 hardcoded lists (frontend MODEL_PRICING +
// per-provider model/embedding lists, and backend api-validation MODEL_PRICING).
//
// Served via GET /api/v2/settings/llm-metadata and consumed by the dynamic settings
// shell (ProviderCards + metadata-driven model selects). Pricing is USD per 1M tokens.
// =============================================================================

export interface ModelInfo {
  id: string;
  name: string;
  pricing?: { input: number; output: number };
  dimension?: number; // embedding models
  contextWindow?: number;
  deprecated?: boolean;
}

export type ProviderCapability = 'llm' | 'embedding' | 'translation' | 'reranking' | 'vision';

export interface ProviderInfo {
  id: string;
  name: string;
  type: ProviderCapability[];
  authField: 'apiKey';
  baseUrl?: string;
  chatModels: ModelInfo[];
  embeddingModels: ModelInfo[];
  defaultChatModel?: string;
  defaultEmbeddingModel?: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    type: ['llm', 'embedding'],
    authField: 'apiKey',
    chatModels: [
      { id: 'gpt-4o-mini', name: 'GPT-4o mini', pricing: { input: 0.15, output: 0.6 }, contextWindow: 128000 },
      { id: 'gpt-4o', name: 'GPT-4o', pricing: { input: 2.5, output: 10 }, contextWindow: 128000 },
      { id: 'gpt-4', name: 'GPT-4', pricing: { input: 30, output: 60 } },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', pricing: { input: 0.5, output: 1.5 } },
    ],
    embeddingModels: [
      { id: 'text-embedding-3-small', name: 'Embedding 3 Small', dimension: 1536, pricing: { input: 0.02, output: 0 } },
      { id: 'text-embedding-3-large', name: 'Embedding 3 Large', dimension: 3072, pricing: { input: 0.13, output: 0 } },
    ],
    defaultChatModel: 'gpt-4o-mini',
    defaultEmbeddingModel: 'text-embedding-3-large',
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    type: ['llm'],
    authField: 'apiKey',
    chatModels: [
      { id: 'claude-sonnet-4-5-20250929', name: 'Claude Sonnet 4.5', pricing: { input: 3, output: 15 }, contextWindow: 200000 },
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', pricing: { input: 15, output: 75 }, contextWindow: 200000 },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', pricing: { input: 0.25, output: 1.25 } },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet (retired)', pricing: { input: 3, output: 15 }, deprecated: true },
    ],
    embeddingModels: [],
    defaultChatModel: 'claude-sonnet-4-5-20250929',
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    type: ['llm', 'embedding'],
    authField: 'apiKey',
    chatModels: [
      { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', pricing: { input: 0.1, output: 0.4 }, contextWindow: 1000000 },
      { id: 'gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (exp)', pricing: { input: 0.1, output: 0.4 } },
      { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', pricing: { input: 0.075, output: 0.3 } },
      { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', pricing: { input: 1.25, output: 5 } },
    ],
    embeddingModels: [
      { id: 'gemini-embedding-001', name: 'Gemini Embedding 001', dimension: 1536 },
      { id: 'text-embedding-004', name: 'Text Embedding 004 (legacy)', dimension: 768, deprecated: true },
    ],
    defaultChatModel: 'gemini-2.0-flash',
    defaultEmbeddingModel: 'gemini-embedding-001',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    type: ['llm'],
    authField: 'apiKey',
    baseUrl: 'https://api.deepseek.com',
    chatModels: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', pricing: { input: 0.14, output: 0.28 }, contextWindow: 64000 },
      { id: 'deepseek-coder', name: 'DeepSeek Coder', pricing: { input: 0.14, output: 0.28 } },
    ],
    embeddingModels: [],
    defaultChatModel: 'deepseek-chat',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    type: ['llm', 'embedding'],
    authField: 'apiKey',
    baseUrl: 'https://openrouter.ai/api/v1',
    chatModels: [
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini (OpenRouter)', pricing: { input: 0.15, output: 0.6 } },
      { id: 'openai/gpt-4o', name: 'GPT-4o (OpenRouter)', pricing: { input: 2.5, output: 10 } },
      { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet (OpenRouter)', pricing: { input: 3, output: 15 } },
      { id: 'google/gemini-2.0-flash-exp', name: 'Gemini 2.0 Flash (OpenRouter)', pricing: { input: 0.1, output: 0.4 } },
    ],
    embeddingModels: [
      { id: 'openai/text-embedding-3-small', name: 'Embedding 3 Small (OpenRouter)', dimension: 1536 },
    ],
    defaultChatModel: 'openai/gpt-4o-mini',
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    type: ['llm', 'vision'],
    authField: 'apiKey',
    baseUrl: 'https://api.x.ai/v1',
    chatModels: [
      { id: 'grok-beta', name: 'Grok Beta', pricing: { input: 5, output: 15 } },
      { id: 'grok-vision-beta', name: 'Grok Vision Beta', pricing: { input: 5, output: 15 } },
    ],
    embeddingModels: [],
    defaultChatModel: 'grok-beta',
  },
  {
    id: 'huggingface',
    name: 'HuggingFace',
    type: ['llm', 'embedding'],
    authField: 'apiKey',
    chatModels: [],
    embeddingModels: [
      { id: 'sentence-transformers/all-MiniLM-L6-v2', name: 'all-MiniLM-L6-v2', dimension: 384 },
    ],
  },
  {
    id: 'voyage',
    name: 'Voyage AI',
    type: ['embedding'],
    authField: 'apiKey',
    chatModels: [],
    embeddingModels: [
      { id: 'voyage-3', name: 'Voyage 3', dimension: 1024, pricing: { input: 0.06, output: 0 } },
      { id: 'voyage-3-lite', name: 'Voyage 3 Lite', dimension: 512, pricing: { input: 0.02, output: 0 } },
      { id: 'voyage-law-2', name: 'Voyage Law 2', dimension: 1024, pricing: { input: 0.12, output: 0 } },
      { id: 'voyage-code-3', name: 'Voyage Code 3', dimension: 1024, pricing: { input: 0.06, output: 0 } },
    ],
    defaultEmbeddingModel: 'voyage-3',
  },
  {
    id: 'cohere',
    name: 'Cohere',
    type: ['embedding'],
    authField: 'apiKey',
    chatModels: [],
    embeddingModels: [
      { id: 'embed-multilingual-v3.0', name: 'Embed Multilingual v3', dimension: 1024, pricing: { input: 0.1, output: 0 } },
      { id: 'embed-english-v3.0', name: 'Embed English v3', dimension: 1024, pricing: { input: 0.1, output: 0 } },
    ],
    defaultEmbeddingModel: 'embed-multilingual-v3.0',
  },
  {
    id: 'jina',
    name: 'Jina AI',
    type: ['embedding', 'reranking'],
    authField: 'apiKey',
    chatModels: [],
    embeddingModels: [
      { id: 'jina-embeddings-v3', name: 'Jina Embeddings v3', dimension: 1024 },
    ],
  },
];

export const OCR_PROVIDERS = [
  { id: 'auto', name: 'Auto', requiresKey: false },
  { id: 'openai', name: 'OpenAI Vision', requiresKey: true },
  { id: 'gemini', name: 'Gemini Vision', requiresKey: true },
  { id: 'deepseek', name: 'DeepSeek Vision', requiresKey: true },
  { id: 'tesseract', name: 'Tesseract (local, free)', requiresKey: false },
];

export const RERANKING_STRATEGIES = [
  { id: 'off', name: 'Off', requiresKey: false },
  { id: 'local', name: 'Local (free, CPU)', requiresKey: false },
  { id: 'jina', name: 'Jina AI', requiresKey: true, provider: 'jina' },
];

export const CHUNKING_STRATEGIES = [
  { id: 'semantic', name: 'Semantic sections', default: true },
  { id: 'recursive', name: 'Recursive' },
  { id: 'sentence', name: 'Sentence' },
  { id: 'paragraph', name: 'Paragraph' },
  { id: 'fixed', name: 'Fixed size' },
  { id: 'semantic-haiku', name: 'AI semantic (Claude Haiku)', requiresProvider: 'anthropic' },
];

export function buildLlmMetadata() {
  return {
    providers: PROVIDERS,
    ocrProviders: OCR_PROVIDERS,
    rerankingStrategies: RERANKING_STRATEGIES,
    chunkingStrategies: CHUNKING_STRATEGIES,
  };
}
