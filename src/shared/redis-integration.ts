/**
 * Redis Integration Pattern
 * @author Claude - Architecture Lead  
 * @version Phase 3
 * @description Comprehensive Redis caching and pub/sub patterns for ASEMB
 */

import Redis, { Redis as RedisClient } from 'ioredis';
import { EventEmitter } from 'events';
import { ASEMBError, ErrorCode } from './error-handler';
import { createHash } from 'crypto';

/**
 * Cache options interface
 */
export interface CacheOptions {
  ttl?: number;
  tags?: string[];
  compress?: boolean;
  namespace?: string;
}

/**
 * Pub/Sub message interface
 */
export interface PubSubMessage {
  id: string;
  channel: string;
  type: string;
  payload: any;
  timestamp: Date;
  sender?: string;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  hitRate: number;
  avgResponseTime: number;
}

/**
 * Redis connection configuration
 */
export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  enableReadyCheck?: boolean;
  maxRetriesPerRequest?: number;
  retryStrategy?: (times: number) => number | void;
}

/**
 * Redis Integration Manager
 */
export class RedisIntegration extends EventEmitter {
  private static instance: RedisIntegration;
  private cacheClient: RedisClient;
  private pubClient: RedisClient;
  private subClient: RedisClient;
  private stats: CacheStats;
  private responseTimes: number[] = [];
  private config: RedisConfig;
  
  private constructor(config?: Partial<RedisConfig>) {
    super();
    
    this.config = {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      keyPrefix: 'asemb:',
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      ...config
    };
    
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      hitRate: 0,
      avgResponseTime: 0
    };
    
    this.initializeClients();
  }
  
  /**
   * Get singleton instance
   */
  public static getInstance(config?: Partial<RedisConfig>): RedisIntegration {
    if (!RedisIntegration.instance) {
      RedisIntegration.instance = new RedisIntegration(config);
    }
    return RedisIntegration.instance;
  }
  
  /**
   * Initialize Redis clients
   */
  private initializeClients(): void {
    // Cache client
    this.cacheClient = new Redis(this.config);
    
    // Pub/Sub clients
    this.pubClient = new Redis(this.config);
    this.subClient = new Redis(this.config);
    
    // Set up event handlers
    this.setupEventHandlers();
    
    // Initialize pub/sub subscriptions
    this.initializePubSub();
  }
  
  /**
   * Set up Redis event handlers
   */
  private setupEventHandlers(): void {
    // Cache client events
    this.cacheClient.on('connect', () => {
      console.log('Redis cache client connected');
      this.emit('cache:connected');
    });
    
    this.cacheClient.on('error', (error) => {
      console.error('Redis cache error:', error);
      this.stats.errors++;
      this.emit('cache:error', error);
    });
    
    this.cacheClient.on('close', () => {
      console.warn('Redis cache connection closed');
      this.emit('cache:disconnected');
    });
    
    // Pub/Sub events
    this.subClient.on('message', (channel, message) => {
      this.handleMessage(channel, message);
    });
    
    this.subClient.on('error', (error) => {
      console.error('Redis subscription error:', error);
      this.emit('pubsub:error', error);
    });
  }
  
  /**
   * Initialize pub/sub subscriptions
   */
  private initializePubSub(): void {
    const channels = [
      'asemb:invalidate',
      'asemb:refresh',
      'asemb:events',
      'asemb:metrics'
    ];
    
    channels.forEach(channel => {
      this.subClient.subscribe(channel, (err) => {
        if (err) {
          console.error(`Failed to subscribe to ${channel}:`, err);
        } else {
          console.log(`Subscribed to ${channel}`);
        }
      });
    });
  }
  
  /**
   * Handle pub/sub messages
   */
  private handleMessage(channel: string, message: string): void {
    try {
      const parsed: PubSubMessage = JSON.parse(message);
      
      switch (channel) {
        case 'asemb:invalidate':
          this.handleInvalidation(parsed);
          break;
        case 'asemb:refresh':
          this.handleRefresh(parsed);
          break;
        case 'asemb:events':
          this.emit('event', parsed);
          break;
        case 'asemb:metrics':
          this.emit('metrics', parsed);
          break;
      }
    } catch (error) {
      console.error('Failed to handle pub/sub message:', error);
    }
  }
  
  /**
   * Cache invalidation handler
   */
  private async handleInvalidation(message: PubSubMessage): Promise<void> {
    const { payload } = message;
    
    if (payload.pattern) {
      await this.invalidatePattern(payload.pattern);
    } else if (payload.keys) {
      await this.invalidateKeys(payload.keys);
    } else if (payload.tags) {
      await this.invalidateTags(payload.tags);
    }
    
    this.emit('cache:invalidated', payload);
  }
  
  /**
   * Cache refresh handler
   */
  private async handleRefresh(message: PubSubMessage): Promise<void> {
    const { payload } = message;
    
    if (payload.key && payload.generator) {
      try {
        const value = await payload.generator();
        await this.set(payload.key, value, payload.options);
        this.emit('cache:refreshed', { key: payload.key });
      } catch (error) {
        console.error(`Failed to refresh cache key ${payload.key}:`, error);
      }
    }
  }
  
  /**
   * Get cached value or compute it
   */
  public async getCachedOrCompute<T>(
    key: string,
    computeFn: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      // Try to get from cache
      const cached = await this.get<T>(key);
      
      if (cached !== null) {
        this.stats.hits++;
        this.updateStats(Date.now() - startTime);
        return cached;
      }
      
      // Cache miss - compute value
      this.stats.misses++;
      const value = await computeFn();
      
      // Store in cache
      await this.set(key, value, options);
      
      this.updateStats(Date.now() - startTime);
      return value;
    } catch (error: any) {
      this.stats.errors++;
      throw new ASEMBError(
        ErrorCode.CACHE_OPERATION_FAILED,
        `Cache operation failed: ${error.message}`,
        { key, error: error.message }
      );
    }
  }
  
  /**
   * Get value from cache
   */
  public async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.cacheClient.get(this.prefixKey(key));
      
      if (!value) {
        return null;
      }
      
      return JSON.parse(value);
    } catch (error: any) {
      console.error(`Failed to get cache key ${key}:`, error);
      return null;
    }
  }
  
  /**
   * Set value in cache
   */
  public async set(
    key: string,
    value: any,
    options: CacheOptions = {}
  ): Promise<void> {
    try {
      const prefixedKey = this.prefixKey(key, options.namespace);
      const serialized = JSON.stringify(value);
      
      if (options.ttl) {
        await this.cacheClient.setex(prefixedKey, options.ttl, serialized);
      } else {
        await this.cacheClient.set(prefixedKey, serialized);
      }
      
      // Store tags if provided
      if (options.tags && options.tags.length > 0) {
        await this.tagKey(prefixedKey, options.tags);
      }
      
      this.stats.sets++;
    } catch (error: any) {
      console.error(`Failed to set cache key ${key}:`, error);
      throw new ASEMBError(
        ErrorCode.CACHE_OPERATION_FAILED,
        `Failed to set cache: ${error.message}`,
        { key, error: error.message }
      );
    }
  }
  
  /**
   * Delete key from cache
   */
  public async delete(key: string): Promise<void> {
    try {
      await this.cacheClient.del(this.prefixKey(key));
      this.stats.deletes++;
    } catch (error: any) {
      console.error(`Failed to delete cache key ${key}:`, error);
    }
  }
  
  /**
   * Invalidate keys matching pattern
   */
  public async invalidatePattern(pattern: string): Promise<void> {
    try {
      const keys = await this.cacheClient.keys(this.prefixKey(pattern));
      
      if (keys.length > 0) {
        await this.cacheClient.del(...keys);
        this.stats.deletes += keys.length;
      }
      
      // Broadcast invalidation
      await this.publish('asemb:invalidate', {
        pattern,
        count: keys.length
      });
    } catch (error: any) {
      console.error(`Failed to invalidate pattern ${pattern}:`, error);
    }
  }
  
  /**
   * Invalidate specific keys
   */
  public async invalidateKeys(keys: string[]): Promise<void> {
    try {
      const prefixedKeys = keys.map(k => this.prefixKey(k));
      
      if (prefixedKeys.length > 0) {
        await this.cacheClient.del(...prefixedKeys);
        this.stats.deletes += prefixedKeys.length;
      }
    } catch (error: any) {
      console.error('Failed to invalidate keys:', error);
    }
  }
  
  /**
   * Invalidate keys by tags
   */
  public async invalidateTags(tags: string[]): Promise<void> {
    try {
      const keys: string[] = [];
      
      for (const tag of tags) {
        const taggedKeys = await this.cacheClient.smembers(`tag:${tag}`);
        keys.push(...taggedKeys);
      }
      
      if (keys.length > 0) {
        await this.cacheClient.del(...keys);
        this.stats.deletes += keys.length;
        
        // Clean up tag sets
        for (const tag of tags) {
          await this.cacheClient.del(`tag:${tag}`);
        }
      }
    } catch (error: any) {
      console.error('Failed to invalidate tags:', error);
    }
  }
  
  /**
   * Tag a key for grouped invalidation
   */
  private async tagKey(key: string, tags: string[]): Promise<void> {
    try {
      for (const tag of tags) {
        await this.cacheClient.sadd(`tag:${tag}`, key);
      }
    } catch (error: any) {
      console.error('Failed to tag key:', error);
    }
  }
  
  /**
   * Publish message to channel
   */
  public async publish(channel: string, payload: any): Promise<void> {
    try {
      const message: PubSubMessage = {
        id: this.generateId(),
        channel,
        type: 'broadcast',
        payload,
        timestamp: new Date(),
        sender: process.env.ALICE_AI_ID || 'asemb'
      };
      
      await this.pubClient.publish(channel, JSON.stringify(message));
    } catch (error: any) {
      console.error(`Failed to publish to ${channel}:`, error);
    }
  }
  
  /**
   * Subscribe to channel
   */
  public async subscribe(
    channel: string,
    handler: (message: PubSubMessage) => void
  ): Promise<void> {
    this.on(`channel:${channel}`, handler);
    
    await this.subClient.subscribe(channel, (err) => {
      if (err) {
        throw new ASEMBError(
          ErrorCode.CACHE_OPERATION_FAILED,
          `Failed to subscribe to channel: ${err.message}`,
          { channel, error: err.message }
        );
      }
    });
  }
  
  /**
   * Generate cache key
   */
  public generateKey(
    namespace: string,
    identifier: string | Record<string, any>
  ): string {
    const idString = typeof identifier === 'string'
      ? identifier
      : this.hashObject(identifier);
    
    return `${namespace}:${idString}`;
  }
  
  /**
   * Hash object for cache key
   */
  private hashObject(obj: Record<string, any>): string {
    const normalized = JSON.stringify(this.sortObject(obj));
    return createHash('md5').update(normalized).digest('hex').substring(0, 16);
  }
  
  /**
   * Sort object keys for consistent hashing
   */
  private sortObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObject(item));
    }
    
    const sorted: Record<string, any> = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = this.sortObject(obj[key]);
    });
    
    return sorted;
  }
  
  /**
   * Prefix key with namespace
   */
  private prefixKey(key: string, namespace?: string): string {
    const prefix = namespace ? `${this.config.keyPrefix}${namespace}:` : this.config.keyPrefix;
    return key.startsWith(prefix) ? key : `${prefix}${key}`;
  }
  
  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
  
  /**
   * Update statistics
   */
  private updateStats(responseTime: number): void {
    this.responseTimes.push(responseTime);
    
    // Keep only last 1000 response times
    if (this.responseTimes.length > 1000) {
      this.responseTimes.shift();
    }
    
    // Calculate hit rate
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
    
    // Calculate average response time
    this.stats.avgResponseTime = this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
  }
  
  /**
   * Get cache statistics
   */
  public getStats(): CacheStats {
    return { ...this.stats };
  }
  
  /**
   * Reset statistics
   */
  public resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      hitRate: 0,
      avgResponseTime: 0
    };
    this.responseTimes = [];
  }
  
  /**
   * Health check
   */
  public async healthCheck(): Promise<boolean> {
    try {
      const result = await this.cacheClient.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Graceful shutdown
   */
  public async shutdown(): Promise<void> {
    console.log('Shutting down Redis integration...');
    
    // Unsubscribe from all channels
    await this.subClient.unsubscribe();
    
    // Close connections
    await Promise.all([
      this.cacheClient.quit(),
      this.pubClient.quit(),
      this.subClient.quit()
    ]);
    
    console.log('Redis integration shutdown complete');
  }
}

/**
 * Export singleton instance
 */
export const redis = RedisIntegration.getInstance();