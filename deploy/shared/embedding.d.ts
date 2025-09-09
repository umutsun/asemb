/**
 * Alice Semantic Bridge - Enhanced Embeddings Service
 * @author Gemini (AI Integration Lead)
 */
import { IExecuteFunctions } from 'n8n-workflow';
export declare enum EmbeddingProvider {
    OPENAI = "openai",
    COHERE = "cohere",
    HUGGINGFACE = "huggingface",
    LOCAL = "local"
}
export interface EmbeddingModel {
    provider: EmbeddingProvider;
    model: string;
    dimensions: number;
    maxTokens: number;
    costPer1kTokens?: number;
}
export declare const EMBEDDING_MODELS: Record<string, EmbeddingModel>;
export interface EmbeddingConfig {
    provider: EmbeddingProvider;
    model: string;
    apiKey?: string;
    baseUrl?: string;
    batchSize?: number;
    cacheTTL?: number;
    enableCache?: boolean;
    enableCompression?: boolean;
    timeout?: number;
}
export interface EmbeddingRequest {
    text: string;
    model?: string;
    metadata?: Record<string, any>;
}
export interface EmbeddingResponse {
    embedding: number[];
    model: string;
    provider: EmbeddingProvider;
    dimensions: number;
    tokensUsed?: number;
    cost?: number;
    cached: boolean;
}
export interface BatchEmbeddingResponse {
    embeddings: EmbeddingResponse[];
    totalTokens: number;
    totalCost: number;
    errors?: Array<{
        index: number;
        error: string;
    }>;
}
/**
 * Enhanced Embedding Service with multi-provider support
 */
export declare class EmbeddingService {
    private static instance;
    private cache;
    private redisClient;
    private config;
    private tokenCount;
    private totalCost;
    private constructor();
    static getInstance(config?: EmbeddingConfig): EmbeddingService;
    /**
     * Generate embedding for a single text
     */
    generateEmbedding(text: string, options?: Partial<EmbeddingConfig>): Promise<EmbeddingResponse>;
    /**
     * Generate embeddings for multiple texts
     */
    batchEmbeddings(texts: string[], options?: Partial<EmbeddingConfig>): Promise<BatchEmbeddingResponse>;
    /**
     * Generate OpenAI embeddings
     */
    private generateOpenAIEmbedding;
    /**
     * Generate Cohere embeddings
     */
    private generateCohereEmbedding;
    /**
     * Generate HuggingFace embeddings
     */
    private generateHuggingFaceEmbedding;
    /**
     * Generate local embeddings (mock for testing)
     */
    private generateLocalEmbedding;
    /**
     * Process batch of texts
     */
    private processBatch;
    /**
     * Process batch with OpenAI
     */
    private processBatchOpenAI;
    /**
     * Process batch with Cohere
     */
    private processBatchCohere;
    /**
     * Get cached embedding
     */
    private getCachedEmbedding;
    /**
     * Cache embedding
     */
    private cacheEmbedding;
    /**
     * Generate cache key
     */
    private generateCacheKey;
    /**
     * Get service metrics
     */
    getMetrics(): {
        tokenCount: number;
        totalCost: number;
        averageCostPerToken: number;
    };
    /**
     * Reset metrics
     */
    resetMetrics(): void;
}
/**
 * Helper function for N8N nodes
 */
export declare function embedTextForNode(thisArg: IExecuteFunctions, itemIndex: number, text: string, options?: Partial<EmbeddingConfig>): Promise<number[]>;
export declare const embedText: typeof embedTextForNode;
/**
 * Format embedding for PostgreSQL vector type
 */
export declare function vectorToSqlArray(vec: number[]): string;
/**
 * Calculate cosine similarity between two vectors
 */
export declare function cosineSimilarity(vec1: number[], vec2: number[]): number;
export declare const embeddingService: EmbeddingService;
