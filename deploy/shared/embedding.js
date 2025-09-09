"use strict";
/**
 * Alice Semantic Bridge - Enhanced Embeddings Service
 * @author Gemini (AI Integration Lead)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.embeddingService = exports.embedText = exports.EmbeddingService = exports.EMBEDDING_MODELS = exports.EmbeddingProvider = void 0;
exports.embedTextForNode = embedTextForNode;
exports.vectorToSqlArray = vectorToSqlArray;
exports.cosineSimilarity = cosineSimilarity;
const crypto_1 = require("crypto");
const error_handling_1 = require("./error-handling");
const cache_manager_1 = require("../src/shared/cache-manager");
const connection_pool_1 = require("../src/shared/connection-pool");
// Provider types
var EmbeddingProvider;
(function (EmbeddingProvider) {
    EmbeddingProvider["OPENAI"] = "openai";
    EmbeddingProvider["COHERE"] = "cohere";
    EmbeddingProvider["HUGGINGFACE"] = "huggingface";
    EmbeddingProvider["LOCAL"] = "local";
})(EmbeddingProvider || (exports.EmbeddingProvider = EmbeddingProvider = {}));
exports.EMBEDDING_MODELS = {
    'text-embedding-3-small': {
        provider: EmbeddingProvider.OPENAI,
        model: 'text-embedding-3-small',
        dimensions: 1536,
        maxTokens: 8191,
        costPer1kTokens: 0.00002
    },
    'text-embedding-3-large': {
        provider: EmbeddingProvider.OPENAI,
        model: 'text-embedding-3-large',
        dimensions: 3072,
        maxTokens: 8191,
        costPer1kTokens: 0.00013
    },
    'text-embedding-ada-002': {
        provider: EmbeddingProvider.OPENAI,
        model: 'text-embedding-ada-002',
        dimensions: 1536,
        maxTokens: 8191,
        costPer1kTokens: 0.0001
    },
    'embed-english-v3.0': {
        provider: EmbeddingProvider.COHERE,
        model: 'embed-english-v3.0',
        dimensions: 1024,
        maxTokens: 512,
        costPer1kTokens: 0.00013
    },
    'embed-multilingual-v3.0': {
        provider: EmbeddingProvider.COHERE,
        model: 'embed-multilingual-v3.0',
        dimensions: 1024,
        maxTokens: 512,
        costPer1kTokens: 0.00013
    }
};
/**
 * Enhanced Embedding Service with multi-provider support
 */
class EmbeddingService {
    constructor(config) {
        this.tokenCount = 0;
        this.totalCost = 0;
        this.config = config;
        this.cache = cache_manager_1.CacheManager.getInstance();
        this.redisClient = connection_pool_1.redisPool.getClient('cache');
    }
    static getInstance(config) {
        if (!EmbeddingService.instance) {
            if (!config) {
                config = {
                    provider: EmbeddingProvider.OPENAI,
                    model: 'text-embedding-3-small',
                    enableCache: true,
                    cacheTTL: 3600,
                    batchSize: 100,
                    timeout: 30000
                };
            }
            EmbeddingService.instance = new EmbeddingService(config);
        }
        return EmbeddingService.instance;
    }
    /**
     * Generate embedding for a single text
     */
    async generateEmbedding(text, options) {
        const config = { ...this.config, ...options };
        // Check cache first
        if (config.enableCache) {
            const cached = await this.getCachedEmbedding(text, config.model);
            if (cached) {
                return {
                    ...cached,
                    cached: true
                };
            }
        }
        // Generate new embedding
        let response;
        switch (config.provider) {
            case EmbeddingProvider.OPENAI:
                response = await this.generateOpenAIEmbedding(text, config);
                break;
            case EmbeddingProvider.COHERE:
                response = await this.generateCohereEmbedding(text, config);
                break;
            case EmbeddingProvider.HUGGINGFACE:
                response = await this.generateHuggingFaceEmbedding(text, config);
                break;
            case EmbeddingProvider.LOCAL:
                response = await this.generateLocalEmbedding(text, config);
                break;
            default:
                throw new error_handling_1.ASBError(`Unsupported embedding provider: ${config.provider}`, error_handling_1.ErrorType.VALIDATION_ERROR);
        }
        // Cache the result
        if (config.enableCache) {
            await this.cacheEmbedding(text, response, config.cacheTTL);
        }
        // Update metrics
        this.tokenCount += response.tokensUsed || 0;
        this.totalCost += response.cost || 0;
        return response;
    }
    /**
     * Generate embeddings for multiple texts
     */
    async batchEmbeddings(texts, options) {
        const config = { ...this.config, ...options };
        const batchSize = config.batchSize || 100;
        const results = [];
        const errors = [];
        let totalTokens = 0;
        let totalCost = 0;
        // Process in batches
        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, Math.min(i + batchSize, texts.length));
            // Check cache for each text
            const toProcess = [];
            for (let j = 0; j < batch.length; j++) {
                const globalIndex = i + j;
                const text = batch[j];
                if (config.enableCache) {
                    const cached = await this.getCachedEmbedding(text, config.model);
                    if (cached) {
                        results[globalIndex] = { ...cached, cached: true };
                        continue;
                    }
                }
                toProcess.push({ index: globalIndex, text });
            }
            // Process uncached texts
            if (toProcess.length > 0) {
                try {
                    const batchResponses = await this.processBatch(toProcess.map(item => item.text), config);
                    for (let k = 0; k < toProcess.length; k++) {
                        const item = toProcess[k];
                        const response = batchResponses[k];
                        if (response) {
                            results[item.index] = response;
                            totalTokens += response.tokensUsed || 0;
                            totalCost += response.cost || 0;
                            // Cache the result
                            if (config.enableCache) {
                                await this.cacheEmbedding(item.text, response, config.cacheTTL);
                            }
                        }
                    }
                }
                catch (error) {
                    // Record errors for this batch
                    for (const item of toProcess) {
                        errors.push({
                            index: item.index,
                            error: error.message
                        });
                    }
                }
            }
        }
        return {
            embeddings: results,
            totalTokens,
            totalCost,
            errors: errors.length > 0 ? errors : undefined
        };
    }
    /**
     * Generate OpenAI embeddings
     */
    async generateOpenAIEmbedding(text, config) {
        const model = exports.EMBEDDING_MODELS[config.model] || exports.EMBEDDING_MODELS['text-embedding-3-small'];
        return (0, error_handling_1.callOpenAIWithRetry)(async () => {
            const response = await fetch(`${config.baseUrl || 'https://api.openai.com'}/v1/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                    input: text,
                    model: model.model,
                    encoding_format: 'float'
                }),
                signal: AbortSignal.timeout(config.timeout || 30000)
            });
            if (!response.ok) {
                const error = await response.text();
                throw new error_handling_1.ASBError(`OpenAI API error: ${error}`, error_handling_1.ErrorType.PROCESSING_ERROR, { metadata: { status: response.status } });
            }
            const data = await response.json();
            const embedding = data.data[0].embedding;
            const usage = data.usage;
            return {
                embedding,
                model: model.model,
                provider: EmbeddingProvider.OPENAI,
                dimensions: embedding.length,
                tokensUsed: usage === null || usage === void 0 ? void 0 : usage.total_tokens,
                cost: usage ? (usage.total_tokens / 1000) * (model.costPer1kTokens || 0) : 0,
                cached: false
            };
        });
    }
    /**
     * Generate Cohere embeddings
     */
    async generateCohereEmbedding(text, config) {
        var _a, _b, _c, _d;
        const model = exports.EMBEDDING_MODELS[config.model] || exports.EMBEDDING_MODELS['embed-english-v3.0'];
        const response = await fetch(`${config.baseUrl || 'https://api.cohere.ai'}/v1/embed`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                texts: [text],
                model: model.model,
                input_type: 'search_document',
                truncate: 'END'
            }),
            signal: AbortSignal.timeout(config.timeout || 30000)
        });
        if (!response.ok) {
            const error = await response.text();
            throw new error_handling_1.ASBError(`Cohere API error: ${error}`, error_handling_1.ErrorType.PROCESSING_ERROR, {});
        }
        const data = await response.json();
        const embedding = data.embeddings[0];
        return {
            embedding,
            model: model.model,
            provider: EmbeddingProvider.COHERE,
            dimensions: embedding.length,
            tokensUsed: (_b = (_a = data.meta) === null || _a === void 0 ? void 0 : _a.billed_units) === null || _b === void 0 ? void 0 : _b.input_tokens,
            cost: ((_d = (_c = data.meta) === null || _c === void 0 ? void 0 : _c.billed_units) === null || _d === void 0 ? void 0 : _d.input_tokens)
                ? (data.meta.billed_units.input_tokens / 1000) * (model.costPer1kTokens || 0)
                : 0,
            cached: false
        };
    }
    /**
     * Generate HuggingFace embeddings
     */
    async generateHuggingFaceEmbedding(text, config) {
        const response = await fetch(`${config.baseUrl || 'https://api-inference.huggingface.co'}/models/${config.model}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                inputs: text,
                options: { wait_for_model: true }
            }),
            signal: AbortSignal.timeout(config.timeout || 30000)
        });
        if (!response.ok) {
            const error = await response.text();
            throw new error_handling_1.ASBError(`HuggingFace API error: ${error}`, error_handling_1.ErrorType.PROCESSING_ERROR, {});
        }
        const embedding = await response.json();
        return {
            embedding: Array.isArray(embedding) ? embedding : embedding[0],
            model: config.model,
            provider: EmbeddingProvider.HUGGINGFACE,
            dimensions: embedding.length,
            cached: false
        };
    }
    /**
     * Generate local embeddings (mock for testing)
     */
    async generateLocalEmbedding(text, config) {
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 10));
        // Generate deterministic mock embedding based on text hash
        const hash = (0, crypto_1.createHash)('sha256').update(text).digest();
        const dimensions = 1536;
        const embedding = new Array(dimensions);
        for (let i = 0; i < dimensions; i++) {
            // Use hash bytes to generate pseudo-random values
            const byte = hash[i % hash.length];
            embedding[i] = (byte - 128) / 128; // Normalize to [-1, 1]
        }
        return {
            embedding,
            model: 'local-mock',
            provider: EmbeddingProvider.LOCAL,
            dimensions,
            tokensUsed: Math.ceil(text.length / 4),
            cost: 0,
            cached: false
        };
    }
    /**
     * Process batch of texts
     */
    async processBatch(texts, config) {
        switch (config.provider) {
            case EmbeddingProvider.OPENAI:
                return this.processBatchOpenAI(texts, config);
            case EmbeddingProvider.COHERE:
                return this.processBatchCohere(texts, config);
            default:
                // Fall back to sequential processing
                const results = [];
                for (const text of texts) {
                    const response = await this.generateEmbedding(text, config);
                    results.push(response);
                }
                return results;
        }
    }
    /**
     * Process batch with OpenAI
     */
    async processBatchOpenAI(texts, config) {
        const model = exports.EMBEDDING_MODELS[config.model] || exports.EMBEDDING_MODELS['text-embedding-3-small'];
        return (0, error_handling_1.callOpenAIWithRetry)(async () => {
            const response = await fetch(`${config.baseUrl || 'https://api.openai.com'}/v1/embeddings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.apiKey}`
                },
                body: JSON.stringify({
                    input: texts,
                    model: model.model,
                    encoding_format: 'float'
                }),
                signal: AbortSignal.timeout(config.timeout || 30000)
            });
            if (!response.ok) {
                const error = await response.text();
                throw new error_handling_1.ASBError(`OpenAI batch API error: ${error}`, error_handling_1.ErrorType.PROCESSING_ERROR, { metadata: { status: response.status } });
            }
            const data = await response.json();
            const usage = data.usage;
            const costPerEmbedding = usage
                ? (usage.total_tokens / texts.length / 1000) * (model.costPer1kTokens || 0)
                : 0;
            return data.data.map((item) => ({
                embedding: item.embedding,
                model: model.model,
                provider: EmbeddingProvider.OPENAI,
                dimensions: item.embedding.length,
                tokensUsed: usage ? Math.ceil(usage.total_tokens / texts.length) : undefined,
                cost: costPerEmbedding,
                cached: false
            }));
        });
    }
    /**
     * Process batch with Cohere
     */
    async processBatchCohere(texts, config) {
        var _a, _b;
        const model = exports.EMBEDDING_MODELS[config.model] || exports.EMBEDDING_MODELS['embed-english-v3.0'];
        const response = await fetch(`${config.baseUrl || 'https://api.cohere.ai'}/v1/embed`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                texts,
                model: model.model,
                input_type: 'search_document',
                truncate: 'END'
            }),
            signal: AbortSignal.timeout(config.timeout || 30000)
        });
        if (!response.ok) {
            const error = await response.text();
            throw new error_handling_1.ASBError(`Cohere batch API error: ${error}`, error_handling_1.ErrorType.PROCESSING_ERROR, { metadata: { status: response.status } });
        }
        const data = await response.json();
        const tokensPerText = ((_b = (_a = data.meta) === null || _a === void 0 ? void 0 : _a.billed_units) === null || _b === void 0 ? void 0 : _b.input_tokens)
            ? Math.ceil(data.meta.billed_units.input_tokens / texts.length)
            : undefined;
        return data.embeddings.map((embedding) => ({
            embedding,
            model: model.model,
            provider: EmbeddingProvider.COHERE,
            dimensions: embedding.length,
            tokensUsed: tokensPerText,
            cost: tokensPerText
                ? (tokensPerText / 1000) * (model.costPer1kTokens || 0)
                : 0,
            cached: false
        }));
    }
    /**
     * Get cached embedding
     */
    async getCachedEmbedding(text, model) {
        const key = this.generateCacheKey(text, model);
        const cached = await this.cache.get(key);
        return cached;
    }
    /**
     * Cache embedding
     */
    async cacheEmbedding(text, response, ttl) {
        const key = this.generateCacheKey(text, response.model);
        await this.cache.set(key, response, ttl || 3600);
    }
    /**
     * Generate cache key
     */
    generateCacheKey(text, model) {
        const hash = (0, crypto_1.createHash)('sha256')
            .update(`${text}:${model}`)
            .digest('hex')
            .substring(0, 16);
        return `embedding:${model}:${hash}`;
    }
    /**
     * Get service metrics
     */
    getMetrics() {
        return {
            tokenCount: this.tokenCount,
            totalCost: this.totalCost,
            averageCostPerToken: this.tokenCount > 0
                ? this.totalCost / this.tokenCount
                : 0
        };
    }
    /**
     * Reset metrics
     */
    resetMetrics() {
        this.tokenCount = 0;
        this.totalCost = 0;
    }
}
exports.EmbeddingService = EmbeddingService;
/**
 * Helper function for N8N nodes
 */
async function embedTextForNode(thisArg, itemIndex, text, options) {
    // Get credentials from N8N
    const creds = await thisArg.getCredentials('openAIApi').catch(() => null);
    const config = {
        provider: EmbeddingProvider.OPENAI,
        model: 'text-embedding-3-small',
        apiKey: creds === null || creds === void 0 ? void 0 : creds.apiKey,
        baseUrl: creds === null || creds === void 0 ? void 0 : creds.baseUrl,
        enableCache: true,
        ...options
    };
    const service = EmbeddingService.getInstance(config);
    const response = await service.generateEmbedding(text, config);
    return response.embedding;
}
// Alias for backward compatibility
exports.embedText = embedTextForNode;
/**
 * Format embedding for PostgreSQL vector type
 */
function vectorToSqlArray(vec) {
    return `[${vec.join(',')}]`;
}
/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(vec1, vec2) {
    if (vec1.length !== vec2.length) {
        throw new Error('Vectors must have the same length');
    }
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    for (let i = 0; i < vec1.length; i++) {
        dotProduct += vec1[i] * vec2[i];
        norm1 += vec1[i] * vec1[i];
        norm2 += vec2[i] * vec2[i];
    }
    const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
    return denominator === 0 ? 0 : dotProduct / denominator;
}
// Export singleton instance
exports.embeddingService = EmbeddingService.getInstance();
