/**
 * OCR Cache Service (Redis)
 * Saves cost and time by caching OCR results
 *
 * Cache Strategy:
 * - Key: MD5(file) + provider + prompt
 * - TTL: 7 days (configurable)
 * - Hit rate target: 60%+
 */

import { redis, initializeRedis } from '../../config/redis';
import { OCRResult, OCRCacheEntry, OCRProviderType } from './types';
import crypto from 'crypto';
import { logger } from '../../utils/logger';

export class OCRCacheService {
  private static instance: OCRCacheService;
  private readonly CACHE_PREFIX = 'ocr:v1:';
  private readonly DEFAULT_TTL = 7 * 24 * 60 * 60; // 7 days
  private isRedisReady = false;

  private constructor() {
    this.initRedis();
  }

  public static getInstance(): OCRCacheService {
    if (!OCRCacheService.instance) {
      OCRCacheService.instance = new OCRCacheService();
    }
    return OCRCacheService.instance;
  }

  /**
   * Initialize the Redis connection
   */
  private async initRedis(): Promise<void> {
    try {
      await initializeRedis();
      this.isRedisReady = redis && redis.status === 'ready';

      if (this.isRedisReady) {
        logger.info(' OCR Cache Service - Redis ready');
      } else {
        logger.warn('️ OCR Cache Service - Redis unavailable, cache disabled');
      }
    } catch (error) {
      logger.error(' OCR Cache Service - Redis initialization error:', error);
      this.isRedisReady = false;
    }
  }

  /**
   * Build cache key
   */
  private generateCacheKey(
    fileHash: string,
    provider: OCRProviderType,
    prompt?: string
  ): string {
    const promptHash = prompt
      ? crypto.createHash('md5').update(prompt).digest('hex').substring(0, 8)
      : 'default';

    return `${this.CACHE_PREFIX}${fileHash}:${provider}:${promptHash}`;
  }

  /**
   * Compute file hash
   */
  public calculateFileHash(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  /**
   * Get OCR result from cache
   */
  async get(
    fileHash: string,
    provider: OCRProviderType,
    prompt?: string
  ): Promise<OCRResult | null> {
    if (!this.isRedisReady) return null;

    try {
      const key = this.generateCacheKey(fileHash, provider, prompt);
      const cached = await redis.get(key);

      if (!cached) {
        logger.debug(`OCR Cache MISS: ${key}`);
        return null;
      }

      const entry: OCRCacheEntry = JSON.parse(cached);

      // Cache age check (optional)
      const ageInDays = (Date.now() - entry.timestamp) / (1000 * 60 * 60 * 24);
      logger.info(` OCR Cache HIT: ${key} (age: ${ageInDays.toFixed(1)} days)`);

      // Add cache info to metadata
      return {
        ...entry.result,
        metadata: {
          ...entry.result.metadata,
          cacheHit: true,
          cacheAge: ageInDays
        }
      };
    } catch (error) {
      logger.error('OCR Cache get error:', error);
      return null;
    }
  }

  /**
   * Save the OCR result to cache
   */
  async set(
    fileHash: string,
    provider: OCRProviderType,
    result: OCRResult,
    prompt?: string,
    ttl: number = this.DEFAULT_TTL
  ): Promise<boolean> {
    if (!this.isRedisReady) return false;

    try {
      const key = this.generateCacheKey(fileHash, provider, prompt);

      const entry: OCRCacheEntry = {
        result,
        timestamp: Date.now(),
        fileHash,
        provider
      };

      await redis.setex(key, ttl, JSON.stringify(entry));
      logger.info(` OCR Cache SAVED: ${key} (TTL: ${ttl}s)`);

      // Update statistics
      await this.incrementCacheStat('writes');

      return true;
    } catch (error) {
      logger.error('OCR Cache set error:', error);
      return false;
    }
  }

  /**
   * Clear the cache (specific or all)
   */
  async clear(fileHash?: string, provider?: OCRProviderType): Promise<number> {
    if (!this.isRedisReady) return 0;

    try {
      let pattern: string;

      if (fileHash && provider) {
        pattern = `${this.CACHE_PREFIX}${fileHash}:${provider}:*`;
      } else if (fileHash) {
        pattern = `${this.CACHE_PREFIX}${fileHash}:*`;
      } else {
        pattern = `${this.CACHE_PREFIX}*`;
      }

      const keys = await redis.keys(pattern);

      if (keys.length === 0) return 0;

      await redis.del(...keys);
      logger.info(`️ OCR Cache cleared: ${keys.length} entries deleted`);

      return keys.length;
    } catch (error) {
      logger.error('OCR Cache clear error:', error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    totalEntries: number;
    cacheHits: number;
    cacheMisses: number;
    cacheWrites: number;
    hitRate: number;
    estimatedSavings: number;
  }> {
    if (!this.isRedisReady) {
      return {
        totalEntries: 0,
        cacheHits: 0,
        cacheMisses: 0,
        cacheWrites: 0,
        hitRate: 0,
        estimatedSavings: 0
      };
    }

    try {
      const keys = await redis.keys(`${this.CACHE_PREFIX}*`);
      const hits = parseInt(await redis.get('ocr:stats:hits') || '0');
      const misses = parseInt(await redis.get('ocr:stats:misses') || '0');
      const writes = parseInt(await redis.get('ocr:stats:writes') || '0');

      const total = hits + misses;
      const hitRate = total > 0 ? (hits / total) * 100 : 0;

      // Estimated cost savings (average $0.01 per OCR request)
      const estimatedSavings = hits * 0.01;

      return {
        totalEntries: keys.length,
        cacheHits: hits,
        cacheMisses: misses,
        cacheWrites: writes,
        hitRate: parseFloat(hitRate.toFixed(2)),
        estimatedSavings: parseFloat(estimatedSavings.toFixed(2))
      };
    } catch (error) {
      logger.error('OCR Cache stats error:', error);
      return {
        totalEntries: 0,
        cacheHits: 0,
        cacheMisses: 0,
        cacheWrites: 0,
        hitRate: 0,
        estimatedSavings: 0
      };
    }
  }

  /**
   * Update cache statistics
   */
  private async incrementCacheStat(stat: 'hits' | 'misses' | 'writes'): Promise<void> {
    try {
      await redis.incr(`ocr:stats:${stat}`);
    } catch (error) {
      // Swallow the error silently
    }
  }

  /**
   * Record a cache HIT
   */
  async recordHit(): Promise<void> {
    await this.incrementCacheStat('hits');
  }

  /**
   * Record a cache MISS
   */
  async recordMiss(): Promise<void> {
    await this.incrementCacheStat('misses');
  }

  /**
   * Redis health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.isRedisReady) return false;
      await redis.ping();
      return true;
    } catch {
      return false;
    }
  }
}

export const ocrCacheService = OCRCacheService.getInstance();
