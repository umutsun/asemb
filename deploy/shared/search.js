"use strict";
/**
 * Alice Semantic Bridge - Hybrid Search Implementation
 * @author Gemini (AI Integration Lead)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchEngine = exports.QueryAnalyzer = exports.HybridSearchEngine = void 0;
const connection_pool_1 = require("../src/shared/connection-pool");
const cache_manager_1 = require("../src/shared/cache-manager");
const embedding_1 = require("./embedding");
const interfaces_1 = require("./interfaces");
const error_handling_1 = require("./error-handling");
/**
 * Hybrid Search Engine combining semantic and keyword search
 */
class HybridSearchEngine {
    constructor() {
        this.pgPool = connection_pool_1.PostgresPool.getInstance();
        this.cache = cache_manager_1.CacheManager.getInstance();
        this.embeddingService = embedding_1.EmbeddingService.getInstance();
        this.defaultConfig = {
            semanticWeight: 0.7,
            keywordWeight: 0.3,
            minScore: 0.3,
            maxResults: 100,
            rerank: true,
            expandQuery: true
        };
    }
    static getInstance() {
        if (!HybridSearchEngine.instance) {
            HybridSearchEngine.instance = new HybridSearchEngine();
        }
        return HybridSearchEngine.instance;
    }
    /**
     * Main search method
     */
    async search(query, config) {
        var _a, _b, _c;
        const finalConfig = { ...this.defaultConfig, ...config };
        // Check cache if enabled
        if ((_a = query.options) === null || _a === void 0 ? void 0 : _a.useCache) {
            const cacheKey = this.generateCacheKey(query);
            const cached = await this.cache.get(cacheKey);
            if (cached) {
                return cached;
            }
        }
        let results;
        // Execute search based on mode
        switch (query.searchMode) {
            case interfaces_1.SearchMode.SEMANTIC:
                results = await this.semanticSearch(query, finalConfig);
                break;
            case interfaces_1.SearchMode.KEYWORD:
                results = await this.keywordSearch(query, finalConfig);
                break;
            case interfaces_1.SearchMode.HYBRID:
                results = await this.hybridSearch(query, finalConfig);
                break;
            default:
                throw new error_handling_1.ASBError(`Unsupported search mode: ${query.searchMode}`, error_handling_1.ErrorType.VALIDATION_ERROR);
        }
        // Apply reranking if enabled
        if (finalConfig.rerank && results.length > 0) {
            results = await this.rerankResults(query.query, results);
        }
        // Apply filters
        if (query.filters) {
            results = this.applyFilters(results, query.filters);
        }
        // Limit results
        const limit = ((_b = query.options) === null || _b === void 0 ? void 0 : _b.limit) || finalConfig.maxResults || 100;
        results = results.slice(0, limit);
        // Cache results if enabled
        if ((_c = query.options) === null || _c === void 0 ? void 0 : _c.useCache) {
            const cacheKey = this.generateCacheKey(query);
            await this.cache.set(cacheKey, results, 300); // 5 minutes TTL
        }
        return results;
    }
    /**
     * Semantic search using vector embeddings
     */
    async semanticSearch(query, config) {
        var _a, _b;
        const client = await this.pgPool.getClient('semantic-search');
        try {
            // Generate query embedding
            const queryEmbedding = await this.embeddingService.generateEmbedding(query.query);
            const vectorStr = (0, embedding_1.vectorToSqlArray)(queryEmbedding.embedding);
            // Build SQL query with filters
            let sql = `
        SELECT 
          d.id,
          d.content,
          d.metadata,
          d.source_id,
          d.embedding <=> $1::vector as distance,
          1 - (d.embedding <=> $1::vector) as similarity
        FROM documents d
        WHERE d.project_key = $2
      `;
            const params = [vectorStr, query.projectKey];
            let paramIndex = 3;
            // Add filters
            if (((_a = query.filters) === null || _a === void 0 ? void 0 : _a.sourceId) && query.filters.sourceId.length > 0) {
                sql += ` AND d.source_id = ANY($${paramIndex})`;
                params.push(query.filters.sourceId);
                paramIndex++;
            }
            if ((_b = query.filters) === null || _b === void 0 ? void 0 : _b.dateRange) {
                sql += ` AND d.created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
                params.push(query.filters.dateRange.start, query.filters.dateRange.end);
                paramIndex += 2;
            }
            // Order by similarity and limit
            sql += `
        ORDER BY distance ASC
        LIMIT $${paramIndex}
      `;
            params.push(config.maxResults || 100);
            const result = await client.query(sql, params);
            return result.rows.map(row => ({
                id: row.id,
                content: row.content,
                score: row.similarity,
                semanticScore: row.similarity,
                metadata: row.metadata,
                searchType: interfaces_1.SearchMode.SEMANTIC,
                explanation: `Semantic similarity: ${(row.similarity * 100).toFixed(2)}%`
            }));
        }
        finally {
            client.release();
        }
    }
    /**
     * Keyword search using full-text search
     */
    async keywordSearch(query, config) {
        var _a, _b, _c;
        const client = await this.pgPool.getClient('keyword-search');
        try {
            // Expand query if enabled
            let searchQuery = query.query;
            if ((_a = query.options) === null || _a === void 0 ? void 0 : _a.expandQuery) {
                searchQuery = await this.expandQuery(query.query);
            }
            // Build SQL query
            let sql = `
        SELECT 
          d.id,
          d.content,
          d.metadata,
          d.source_id,
          ts_rank_cd(
            to_tsvector('english', d.content),
            plainto_tsquery('english', $1),
            32
          ) as rank,
          ts_headline(
            'english',
            d.content,
            plainto_tsquery('english', $1),
            'MaxWords=50, MinWords=25, StartSel=<b>, StopSel=</b>'
          ) as highlight
        FROM documents d
        WHERE d.project_key = $2
          AND to_tsvector('english', d.content) @@ plainto_tsquery('english', $1)
      `;
            const params = [searchQuery, query.projectKey];
            let paramIndex = 3;
            // Add filters
            if (((_b = query.filters) === null || _b === void 0 ? void 0 : _b.sourceId) && query.filters.sourceId.length > 0) {
                sql += ` AND d.source_id = ANY($${paramIndex})`;
                params.push(query.filters.sourceId);
                paramIndex++;
            }
            if ((_c = query.filters) === null || _c === void 0 ? void 0 : _c.dateRange) {
                sql += ` AND d.created_at BETWEEN $${paramIndex} AND $${paramIndex + 1}`;
                params.push(query.filters.dateRange.start, query.filters.dateRange.end);
                paramIndex += 2;
            }
            // Order by rank and limit
            sql += `
        ORDER BY rank DESC
        LIMIT $${paramIndex}
      `;
            params.push(config.maxResults || 100);
            const result = await client.query(sql, params);
            return result.rows.map(row => ({
                id: row.id,
                content: row.content,
                score: row.rank,
                keywordScore: row.rank,
                metadata: row.metadata,
                highlights: [row.highlight],
                searchType: interfaces_1.SearchMode.KEYWORD,
                explanation: `Keyword rank: ${row.rank.toFixed(4)}`
            }));
        }
        finally {
            client.release();
        }
    }
    /**
     * Hybrid search combining semantic and keyword search
     */
    async hybridSearch(query, config) {
        // Execute both searches in parallel
        const [semanticResults, keywordResults] = await Promise.all([
            this.semanticSearch(query, config),
            this.keywordSearch(query, config)
        ]);
        // Combine and score results
        const combinedResults = new Map();
        // Process semantic results
        for (const result of semanticResults) {
            combinedResults.set(result.id, {
                ...result,
                semanticScore: result.score,
                hybridScore: result.score * (config.semanticWeight || 0.7)
            });
        }
        // Process keyword results
        for (const result of keywordResults) {
            const existing = combinedResults.get(result.id);
            if (existing) {
                // Combine scores for documents found by both methods
                existing.keywordScore = result.score;
                existing.hybridScore =
                    (existing.semanticScore || 0) * (config.semanticWeight || 0.7) +
                        (result.score || 0) * (config.keywordWeight || 0.3);
                existing.highlights = result.highlights;
                existing.explanation =
                    `Hybrid: Semantic ${((existing.semanticScore || 0) * 100).toFixed(1)}%, ` +
                        `Keyword ${((result.score || 0) * 100).toFixed(1)}%`;
            }
            else {
                // Add keyword-only results
                combinedResults.set(result.id, {
                    ...result,
                    keywordScore: result.score,
                    hybridScore: result.score * (config.keywordWeight || 0.3)
                });
            }
        }
        // Convert to array and sort by hybrid score
        const results = Array.from(combinedResults.values())
            .sort((a, b) => (b.hybridScore || 0) - (a.hybridScore || 0));
        // Update search type
        results.forEach(r => r.searchType = interfaces_1.SearchMode.HYBRID);
        // Filter by minimum score
        return results.filter(r => (r.hybridScore || 0) >= (config.minScore || 0));
    }
    /**
     * Expand query with synonyms and related concepts
     */
    async expandQuery(query, config) {
        const expansions = [query];
        if ((config === null || config === void 0 ? void 0 : config.synonyms) !== false) {
            // Add common synonyms (simplified version)
            const synonymMap = {
                'AI': ['artificial intelligence', 'machine learning', 'ML'],
                'NLP': ['natural language processing', 'text processing'],
                'search': ['query', 'find', 'retrieve', 'lookup'],
                'document': ['file', 'text', 'content', 'article'],
                'data': ['information', 'content', 'records']
            };
            for (const [term, synonyms] of Object.entries(synonymMap)) {
                if (query.toLowerCase().includes(term.toLowerCase())) {
                    expansions.push(...synonyms);
                }
            }
        }
        if (config === null || config === void 0 ? void 0 : config.relatedConcepts) {
            // Add related concepts using LLM (simplified mock)
            const concepts = this.generateRelatedConcepts(query);
            expansions.push(...concepts);
        }
        // Limit expansions
        const maxExpansions = (config === null || config === void 0 ? void 0 : config.maxExpansions) || 5;
        const uniqueExpansions = Array.from(new Set(expansions));
        return uniqueExpansions.slice(0, maxExpansions).join(' OR ');
    }
    /**
     * Generate related concepts (simplified version)
     */
    generateRelatedConcepts(query) {
        // In production, this would use an LLM to generate related concepts
        const conceptMap = {
            'machine learning': ['deep learning', 'neural networks', 'algorithms'],
            'database': ['SQL', 'NoSQL', 'data storage'],
            'programming': ['coding', 'software development', 'engineering'],
            'web': ['internet', 'online', 'website', 'browser']
        };
        const concepts = [];
        for (const [key, related] of Object.entries(conceptMap)) {
            if (query.toLowerCase().includes(key)) {
                concepts.push(...related);
            }
        }
        return concepts;
    }
    /**
     * Rerank results using advanced scoring
     */
    async rerankResults(query, results) {
        // Calculate additional features for reranking
        const rerankedResults = results.map(result => {
            var _a;
            let rerankScore = result.hybridScore || result.score;
            // Boost score based on content length relevance
            const optimalLength = 500;
            const lengthRatio = Math.min(result.content.length, optimalLength) / optimalLength;
            rerankScore *= (0.8 + 0.2 * lengthRatio);
            // Boost score for exact query matches
            if (result.content.toLowerCase().includes(query.toLowerCase())) {
                rerankScore *= 1.2;
            }
            // Boost score for recent documents
            if ((_a = result.metadata) === null || _a === void 0 ? void 0 : _a.publishedDate) {
                const age = Date.now() - new Date(result.metadata.publishedDate).getTime();
                const ageInDays = age / (1000 * 60 * 60 * 24);
                const recencyBoost = Math.exp(-ageInDays / 365); // Decay over a year
                rerankScore *= (0.9 + 0.1 * recencyBoost);
            }
            return {
                ...result,
                rerankScore,
                score: rerankScore
            };
        });
        // Sort by rerank score
        return rerankedResults.sort((a, b) => (b.rerankScore || 0) - (a.rerankScore || 0));
    }
    /**
     * Apply filters to results
     */
    applyFilters(results, filters) {
        return results.filter(result => {
            var _a, _b;
            // Filter by metadata
            if (filters.metadata) {
                for (const [key, value] of Object.entries(filters.metadata)) {
                    if (((_a = result.metadata) === null || _a === void 0 ? void 0 : _a[key]) !== value) {
                        return false;
                    }
                }
            }
            // Filter by date range
            if (filters.dateRange && ((_b = result.metadata) === null || _b === void 0 ? void 0 : _b.publishedDate)) {
                const date = new Date(result.metadata.publishedDate);
                if (date < filters.dateRange.start || date > filters.dateRange.end) {
                    return false;
                }
            }
            return true;
        });
    }
    /**
     * Generate cache key for search query
     */
    generateCacheKey(query) {
        return this.cache.generateKey('search', {
            query: query.query,
            mode: query.searchMode,
            filters: query.filters,
            options: query.options
        }, query.projectKey);
    }
    /**
     * Get search suggestions based on query
     */
    async getSuggestions(query, projectKey, limit = 5) {
        const client = await this.pgPool.getClient('suggestions');
        try {
            // Get popular queries similar to the input
            const sql = `
        SELECT DISTINCT
          substring(content FROM 1 FOR 100) as snippet,
          similarity(content, $1) as sim
        FROM documents
        WHERE project_key = $2
          AND content % $1  -- Trigram similarity operator
        ORDER BY sim DESC
        LIMIT $3
      `;
            const result = await client.query(sql, [query, projectKey, limit]);
            return result.rows.map(row => {
                // Extract meaningful phrase from snippet
                const words = row.snippet.split(/\s+/);
                return words.slice(0, 10).join(' ') + '...';
            });
        }
        finally {
            client.release();
        }
    }
    /**
     * Find similar documents using vector similarity
     */
    async findSimilar(documentId, projectKey, limit = 10) {
        const client = await this.pgPool.getClient('find-similar');
        try {
            // Get the document's embedding
            const docSql = `
        SELECT embedding, content, metadata
        FROM documents
        WHERE id = $1 AND project_key = $2
      `;
            const docResult = await client.query(docSql, [documentId, projectKey]);
            if (docResult.rows.length === 0) {
                throw new error_handling_1.ASBError(`Document ${documentId} not found`, error_handling_1.ErrorType.VALIDATION_ERROR);
            }
            const doc = docResult.rows[0];
            // Find similar documents
            const sql = `
        SELECT 
          id,
          content,
          metadata,
          1 - (embedding <=> $1::vector) as similarity
        FROM documents
        WHERE project_key = $2
          AND id != $3
        ORDER BY embedding <=> $1::vector ASC
        LIMIT $4
      `;
            const result = await client.query(sql, [
                doc.embedding,
                projectKey,
                documentId,
                limit
            ]);
            return result.rows.map(row => ({
                id: row.id,
                content: row.content,
                score: row.similarity,
                semanticScore: row.similarity,
                metadata: row.metadata,
                searchType: interfaces_1.SearchMode.SEMANTIC,
                explanation: `Similar to document ${documentId}: ${(row.similarity * 100).toFixed(2)}%`
            }));
        }
        finally {
            client.release();
        }
    }
}
exports.HybridSearchEngine = HybridSearchEngine;
/**
 * Query analyzer for understanding user intent
 */
class QueryAnalyzer {
    /**
     * Analyze query to determine best search mode
     */
    static analyzeQuery(query) {
        const lowerQuery = query.toLowerCase();
        // Check for specific patterns
        const factualPatterns = [
            /^what is/i,
            /^who is/i,
            /^when did/i,
            /^where is/i,
            /^how many/i,
            /^define/i
        ];
        const conceptualPatterns = [
            /^how does/i,
            /^why does/i,
            /^explain/i,
            /^describe/i,
            /^compare/i,
            /^difference between/i
        ];
        const navigationalPatterns = [
            /^find/i,
            /^show me/i,
            /^get/i,
            /^list/i,
            /^search for/i
        ];
        let queryType = 'conceptual';
        let confidence = 0.5;
        if (factualPatterns.some(p => p.test(lowerQuery))) {
            queryType = 'factual';
            confidence = 0.8;
        }
        else if (conceptualPatterns.some(p => p.test(lowerQuery))) {
            queryType = 'conceptual';
            confidence = 0.9;
        }
        else if (navigationalPatterns.some(p => p.test(lowerQuery))) {
            queryType = 'navigational';
            confidence = 0.7;
        }
        // Determine search mode based on query type
        let suggestedMode = interfaces_1.SearchMode.HYBRID;
        if (queryType === 'factual') {
            // Factual queries benefit from keyword search
            suggestedMode = interfaces_1.SearchMode.KEYWORD;
        }
        else if (queryType === 'conceptual') {
            // Conceptual queries benefit from semantic search
            suggestedMode = interfaces_1.SearchMode.SEMANTIC;
        }
        else {
            // Navigational queries benefit from hybrid search
            suggestedMode = interfaces_1.SearchMode.HYBRID;
        }
        // Use hybrid for longer queries
        if (query.split(/\s+/).length > 10) {
            suggestedMode = interfaces_1.SearchMode.HYBRID;
            confidence = 0.9;
        }
        return {
            suggestedMode,
            queryType,
            confidence
        };
    }
    /**
     * Extract entities from query
     */
    static extractEntities(query) {
        const entities = {};
        // Extract quoted phrases
        const quotedMatches = query.match(/"([^"]+)"/g);
        if (quotedMatches) {
            entities.quoted = quotedMatches.map(m => m.replace(/"/g, ''));
        }
        // Extract dates (simplified)
        const dateMatches = query.match(/\d{4}-\d{2}-\d{2}/g);
        if (dateMatches) {
            entities.dates = dateMatches.map(d => new Date(d));
        }
        // Extract numbers
        const numberMatches = query.match(/\b\d+\.?\d*\b/g);
        if (numberMatches) {
            entities.numbers = numberMatches.map(n => parseFloat(n));
        }
        // Extract emails
        const emailMatches = query.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
        if (emailMatches) {
            entities.emails = emailMatches;
        }
        // Extract URLs
        const urlMatches = query.match(/https?:\/\/[^\s]+/g);
        if (urlMatches) {
            entities.urls = urlMatches;
        }
        return entities;
    }
}
exports.QueryAnalyzer = QueryAnalyzer;
// Export singleton instance
exports.searchEngine = HybridSearchEngine.getInstance();
