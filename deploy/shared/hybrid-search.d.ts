import { Pool } from 'pg';
export interface SearchOptions {
    limit?: number;
    offset?: number;
    minSimilarity?: number;
    includeMetadata?: boolean;
    useCache?: boolean;
    weightVector?: number;
    weightKeyword?: number;
    rerank?: boolean;
}
export interface SearchResult {
    id: string;
    content: string;
    metadata?: any;
    score: number;
    vectorScore?: number;
    keywordScore?: number;
    source: 'vector' | 'keyword' | 'hybrid';
}
export declare class HybridSearchEngine {
    private pool;
    private embeddingService;
    private openai;
    private readonly defaultOptions;
    constructor(pool: Pool, apiKey: string);
    /**
     * Perform semantic vector search
     */
    semanticSearch(query: string, options?: SearchOptions): Promise<SearchResult[]>;
    /**
     * Perform keyword-based search using PostgreSQL full-text search
     */
    keywordSearch(query: string, options?: SearchOptions): Promise<SearchResult[]>;
    /**
     * Perform hybrid search combining vector and keyword search
     */
    hybridSearch(query: string, options?: SearchOptions): Promise<SearchResult[]>;
    /**
     * Rerank results using cross-encoder or other advanced techniques
     */
    rerank(query: string, results: SearchResult[]): Promise<SearchResult[]>;
    /**
     * Expand the query using an LLM
     */
    expandQueryWithLLM(query: string): Promise<string>;
    /**
     * Combine vector and keyword results with weighted scoring
     */
    private combineResults;
    /**
     * Prepare text query for PostgreSQL full-text search
     */
    private prepareTsQuery;
    /**
     * Generate cache key
     */
    private getCacheKey;
    /**
     * Get cached search results
     */
    private getCachedResults;
    /**
     * Cache search results
     */
    private cacheResults;
    /**
     * Warm cache with popular queries
     */
    warmCache(popularQueries: string[]): Promise<void>;
    /**
     * Get search performance metrics
     */
    getMetrics(): Promise<{
        cacheHitRate: number;
        avgSearchLatency: number;
        popularQueries: string[];
    }>;
}
export declare function createHybridSearchEngine(pool: Pool, apiKey: string): HybridSearchEngine;
