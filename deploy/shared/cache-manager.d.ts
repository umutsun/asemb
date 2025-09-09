/**
 * Multi-Layer Caching Strategy
 * @author Claude - Architecture Lead
 * @version Phase 3
 */
/**
 * Cache configuration
 */
export interface CacheConfig {
    ttl: number;
    maxSize?: number;
    stale?: boolean;
    compress?: boolean;
    prefix?: string;
}
/**
 * Cache statistics
 */
export interface CacheStats {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    hitRate: number;
    memoryUsage: number;
    redisKeys: number;
}
/**
 * Multi-layer cache manager
 * L1: In-memory LRU cache (fastest, limited size)
 * L2: Redis cache (fast, distributed)
 * L3: Database (persistent, slowest)
 */
export declare class CacheManager {
    private static instance;
    private l1Cache;
    private redisClient;
    private stats;
    private defaultTTL;
    private circuitBreaker;
    private constructor();
    static getInstance(): CacheManager;
    /**
     * Get the underlying Redis client
     */
    getRedisClient(): any;
    /**
     * Generate cache key with namespace
     */
    generateKey(namespace: string, identifier: string | Record<string, any>, prefix?: string): string;
    /**
     * Hash object for cache key
     */
    private hashObject;
    /**
     * Normalize object for consistent hashing
     */
    private normalizeObject;
    /**
     * Get value from cache with multi-layer fallback
     */
    get<T>(key: string, options?: {
        stale?: boolean;
    }): Promise<T | null>;
    /**
     * Set value in cache layers
     */
    set<T>(key: string, value: T, ttl?: number): Promise<void>;
    /**
     * Get or compute value (cache-aside pattern)
     */
    getOrCompute<T>(key: string, computeFn: () => Promise<T>, config?: CacheConfig): Promise<T>;
    /**
     * Delete from all cache layers
     */
    delete(key: string): Promise<void>;
    /**
     * Invalidate cache by pattern
     */
    invalidatePattern(pattern: string): Promise<number>;
    /**
     * Match pattern (simple glob)
     */
    private matchPattern;
    /**
     * Clear all cache
     */
    clear(): Promise<void>;
    /**
     * Warm cache with frequently accessed data
     */
    warmCache(items: Array<{
        key: string;
        value: any;
        ttl?: number;
    }>): Promise<void>;
    /**
     * Get cache statistics
     */
    getStats(): Promise<CacheStats>;
    /**
     * Get circuit breaker status
     */
    getCircuitBreakerStatus(): {
        state: string;
        failures: number;
    };
    /**
     * Reset circuit breaker (for manual recovery)
     */
    resetCircuitBreaker(): void;
    /**
     * Update hit rate
     */
    private updateHitRate;
}
/**
 * Cache invalidation strategies
 */
export declare class CacheInvalidator {
    private cache;
    constructor();
    /**
     * Invalidate on document change
     */
    onDocumentChange(documentId: string, sourceId?: string): Promise<void>;
    /**
     * Invalidate on source update
     */
    onSourceUpdate(sourceId: string): Promise<void>;
    /**
     * Invalidate search cache
     */
    onSearchIndexUpdate(): Promise<void>;
    /**
     * Time-based invalidation
     */
    scheduleInvalidation(pattern: string, delayMs: number): NodeJS.Timeout;
}
/**
 * Query result cache decorator
 */
export declare function Cacheable(namespace: string, ttl?: number): (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
export declare const cacheManager: CacheManager;
export declare const cacheInvalidator: CacheInvalidator;
