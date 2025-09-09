/**
 * Alice Semantic Bridge - Hybrid Search Implementation
 * @author Gemini (AI Integration Lead)
 */
import { ISearchQuery, ISearchResult, SearchMode } from './interfaces';
export interface SearchConfig {
    semanticWeight?: number;
    keywordWeight?: number;
    minScore?: number;
    maxResults?: number;
    rerank?: boolean;
    expandQuery?: boolean;
}
export interface QueryExpansionConfig {
    synonyms?: boolean;
    relatedConcepts?: boolean;
    multiLingual?: boolean;
    maxExpansions?: number;
}
export interface DetailedSearchResult extends ISearchResult {
    semanticScore?: number;
    keywordScore?: number;
    hybridScore?: number;
    rerankScore?: number;
    explanation?: string;
}
/**
 * Hybrid Search Engine combining semantic and keyword search
 */
export declare class HybridSearchEngine {
    private static instance;
    private pgPool;
    private cache;
    private embeddingService;
    private defaultConfig;
    private constructor();
    static getInstance(): HybridSearchEngine;
    /**
     * Main search method
     */
    search(query: ISearchQuery, config?: SearchConfig): Promise<DetailedSearchResult[]>;
    /**
     * Semantic search using vector embeddings
     */
    semanticSearch(query: ISearchQuery, config: SearchConfig): Promise<DetailedSearchResult[]>;
    /**
     * Keyword search using full-text search
     */
    keywordSearch(query: ISearchQuery, config: SearchConfig): Promise<DetailedSearchResult[]>;
    /**
     * Hybrid search combining semantic and keyword search
     */
    hybridSearch(query: ISearchQuery, config: SearchConfig): Promise<DetailedSearchResult[]>;
    /**
     * Expand query with synonyms and related concepts
     */
    expandQuery(query: string, config?: QueryExpansionConfig): Promise<string>;
    /**
     * Generate related concepts (simplified version)
     */
    private generateRelatedConcepts;
    /**
     * Rerank results using advanced scoring
     */
    rerankResults(query: string, results: DetailedSearchResult[]): Promise<DetailedSearchResult[]>;
    /**
     * Apply filters to results
     */
    private applyFilters;
    /**
     * Generate cache key for search query
     */
    private generateCacheKey;
    /**
     * Get search suggestions based on query
     */
    getSuggestions(query: string, projectKey: string, limit?: number): Promise<string[]>;
    /**
     * Find similar documents using vector similarity
     */
    findSimilar(documentId: string, projectKey: string, limit?: number): Promise<DetailedSearchResult[]>;
}
/**
 * Query analyzer for understanding user intent
 */
export declare class QueryAnalyzer {
    /**
     * Analyze query to determine best search mode
     */
    static analyzeQuery(query: string): {
        suggestedMode: SearchMode;
        queryType: 'factual' | 'conceptual' | 'navigational';
        confidence: number;
    };
    /**
     * Extract entities from query
     */
    static extractEntities(query: string): {
        dates?: Date[];
        numbers?: number[];
        emails?: string[];
        urls?: string[];
        quoted?: string[];
    };
}
export declare const searchEngine: HybridSearchEngine;
