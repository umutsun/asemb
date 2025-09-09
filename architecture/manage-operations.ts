/**
 * Alice Semantic Bridge - Manage Operations Architecture
 * Phase 3 Sprint - TypeScript Interface Definitions
 * @version 2.0.0
 */

// ============================
// 1. DELETE BY SOURCE ID OPERATION
// ============================

export interface DeleteBySourceIdRequest {
  sourceId: string;
  options?: DeleteOptions;
}

export interface DeleteOptions {
  cascade?: boolean;              // Delete related embeddings
  softDelete?: boolean;           // Mark as deleted vs hard delete
  batchSize?: number;             // For chunked deletion (default: 1000)
  timeout?: number;               // Operation timeout in ms
}

export interface DeleteBySourceIdResponse {
  success: boolean;
  deletedCount: number;
  details: {
    documentsDeleted: number;
    embeddingsDeleted: number;
    cacheKeysInvalidated: string[];
  };
  duration: number;
  errors?: DeleteError[];
}

export interface DeleteError {
  code: string;
  message: string;
  context?: Record<string, any>;
}

// ============================
// 2. GET STATISTICS ENDPOINT
// ============================

export interface StatisticsRequest {
  timeRange?: TimeRange;
  groupBy?: StatisticsGroupBy;
  includeDetails?: boolean;
}

export interface TimeRange {
  start: Date;
  end: Date;
}

export enum StatisticsGroupBy {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
  SOURCE = 'source',
  COLLECTION = 'collection'
}

export interface StatisticsResponse {
  summary: StatisticsSummary;
  performance: PerformanceMetrics;
  storage: StorageMetrics;
  trends?: TrendData[];
  details?: DetailedStatistics;
}

export interface StatisticsSummary {
  totalDocuments: number;
  totalEmbeddings: number;
  totalCollections: number;
  uniqueSources: number;
  lastUpdated: Date;
}

export interface PerformanceMetrics {
  averageQueryTime: number;      // ms
  averageEmbeddingTime: number;  // ms
  cacheHitRate: number;          // percentage
  errorRate: number;             // percentage
  throughput: {
    queries: number;             // per minute
    embeddings: number;          // per minute
  };
}

export interface StorageMetrics {
  databaseSize: number;          // bytes
  embeddingSize: number;         // bytes
  cacheSize: number;             // bytes
  indexSize: number;             // bytes
  compressionRatio?: number;
}

export interface TrendData {
  timestamp: Date;
  metric: string;
  value: number;
}

export interface DetailedStatistics {
  topSources: Array<{ sourceId: string; count: number }>;
  topCollections: Array<{ name: string; count: number }>;
  recentErrors: Array<{ timestamp: Date; error: string }>;
  slowQueries: Array<{ query: string; duration: number }>;
}

// ============================
// 3. CLEANUP ORPHANED ERROR HANDLING
// ============================

export interface CleanupOrphanedRequest {
  dryRun?: boolean;              // Preview without deletion
  batchSize?: number;            // Process in chunks
  parallel?: boolean;            // Parallel processing
  filters?: CleanupFilters;
}

export interface CleanupFilters {
  olderThan?: Date;              // Only cleanup items older than
  collections?: string[];        // Specific collections
  sourcePatterns?: string[];     // Source ID patterns (regex)
}

export interface CleanupOrphanedResponse {
  success: boolean;
  orphanedFound: number;
  orphanedCleaned: number;
  errors: CleanupError[];
  details: CleanupDetails;
}

export interface CleanupDetails {
  embeddingsWithoutDocuments: number;
  documentsWithoutEmbeddings: number;
  invalidReferences: number;
  corruptedData: number;
  cleanupDuration: number;
}

export interface CleanupError {
  type: CleanupErrorType;
  message: string;
  item?: {
    id: string;
    type: 'document' | 'embedding';
  };
  recoverable: boolean;
  retryAfter?: number;
}

export enum CleanupErrorType {
  DATABASE_ERROR = 'DATABASE_ERROR',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  LOCK_TIMEOUT = 'LOCK_TIMEOUT',
  CONSTRAINT_VIOLATION = 'CONSTRAINT_VIOLATION',
  DATA_INTEGRITY = 'DATA_INTEGRITY'
}

// Error Handler Pattern
export class CleanupErrorHandler {
  private retryPolicy: RetryPolicy;
  private errorLog: CleanupError[] = [];

  constructor(retryPolicy: RetryPolicy) {
    this.retryPolicy = retryPolicy;
  }

  async handle(error: Error, context: any): Promise<void> {
    const cleanupError = this.mapToCleanupError(error, context);
    this.errorLog.push(cleanupError);

    if (cleanupError.recoverable && this.shouldRetry(cleanupError)) {
      await this.retry(cleanupError, context);
    } else {
      await this.escalate(cleanupError);
    }
  }

  private mapToCleanupError(error: Error, context: any): CleanupError {
    // Map database/system errors to cleanup errors
    if (error.message.includes('lock')) {
      return {
        type: CleanupErrorType.LOCK_TIMEOUT,
        message: error.message,
        item: context.item,
        recoverable: true,
        retryAfter: 5000
      };
    }
    // Additional error mapping logic
    return {
      type: CleanupErrorType.DATABASE_ERROR,
      message: error.message,
      recoverable: false
    };
  }

  private shouldRetry(error: CleanupError): boolean {
    return this.retryPolicy.shouldRetry(error);
  }

  private async retry(error: CleanupError, context: any): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, error.retryAfter || 1000));
    // Retry logic
  }

  private async escalate(error: CleanupError): Promise<void> {
    // Log to monitoring system
    // Notify administrators
  }
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMultiplier: number;
  maxBackoff: number;
  shouldRetry(error: CleanupError): boolean;
}

// ============================
// 4. REDIS CACHE INTEGRATION
// ============================

export interface CacheConfig {
  redis: RedisConfig;
  strategies: CacheStrategies;
  invalidation: InvalidationConfig;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db: number;
  keyPrefix: string;
  ttl: {
    default: number;
    statistics: number;
    embeddings: number;
    queries: number;
  };
}

export interface CacheStrategies {
  writeThrough: boolean;         // Write to cache and DB simultaneously
  writeBack: boolean;            // Write to cache, async to DB
  readAside: boolean;            // Check cache, fallback to DB
  refresh: boolean;              // Proactive cache refresh
}

export interface InvalidationConfig {
  patterns: InvalidationPattern[];
  cascadeDelete: boolean;
  batchInvalidation: boolean;
}

export interface InvalidationPattern {
  operation: string;
  keyPattern: string;
  cascade?: string[];
}

// Cache Manager Implementation
export class CacheManager {
  private redis: any; // Redis client
  private config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
  }

  async get<T>(key: string): Promise<T | null> {
    const cached = await this.redis.get(this.prefixKey(key));
    if (cached) {
      return JSON.parse(cached);
    }
    return null;
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    const effectiveTtl = ttl || this.config.redis.ttl.default;
    await this.redis.setex(this.prefixKey(key), effectiveTtl, serialized);
  }

  async invalidate(patterns: string[]): Promise<number> {
    let invalidatedCount = 0;
    for (const pattern of patterns) {
      const keys = await this.redis.keys(this.prefixKey(pattern));
      if (keys.length > 0) {
        await this.redis.del(...keys);
        invalidatedCount += keys.length;
      }
    }
    return invalidatedCount;
  }

  private prefixKey(key: string): string {
    return `${this.config.redis.keyPrefix}:${key}`;
  }

  // Decorators for cache operations
  static CacheResult(ttl?: number) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
      const originalMethod = descriptor.value;
      descriptor.value = async function (...args: any[]) {
        const cacheKey = `${propertyKey}:${JSON.stringify(args)}`;
        const cached = await this.cacheManager.get(cacheKey);
        if (cached) {
          return cached;
        }
        const result = await originalMethod.apply(this, args);
        await this.cacheManager.set(cacheKey, result, ttl);
        return result;
      };
    };
  }

  static InvalidateCache(patterns: string[]) {
    return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
      const originalMethod = descriptor.value;
      descriptor.value = async function (...args: any[]) {
        const result = await originalMethod.apply(this, args);
        await this.cacheManager.invalidate(patterns);
        return result;
      };
    };
  }
}

// ============================
// 5. MEMORY-EFFICIENT BATCH OPERATIONS
// ============================

export interface BatchConfig {
  maxBatchSize: number;          // Maximum items per batch
  maxMemory: number;             // Maximum memory usage in bytes
  concurrency: number;           // Parallel batch processing
  timeout: number;               // Batch timeout in ms
}

export interface BatchOperation<T, R> {
  process(items: T[]): Promise<R[]>;
  onProgress?: (progress: BatchProgress) => void;
  onError?: (error: BatchError) => void;
}

export interface BatchProgress {
  processed: number;
  total: number;
  currentBatch: number;
  totalBatches: number;
  memoryUsage: number;
  estimatedTimeRemaining: number;
}

export interface BatchError {
  batch: number;
  items: any[];
  error: Error;
  canContinue: boolean;
}

// Memory-Efficient Batch Processor
export class BatchProcessor<T, R> {
  private config: BatchConfig;
  private memoryMonitor: MemoryMonitor;

  constructor(config: BatchConfig) {
    this.config = config;
    this.memoryMonitor = new MemoryMonitor(config.maxMemory);
  }

  async processBatch(
    items: T[],
    operation: BatchOperation<T, R>
  ): Promise<R[]> {
    const batches = this.createBatches(items);
    const results: R[] = [];
    const progress: BatchProgress = {
      processed: 0,
      total: items.length,
      currentBatch: 0,
      totalBatches: batches.length,
      memoryUsage: 0,
      estimatedTimeRemaining: 0
    };

    for (let i = 0; i < batches.length; i += this.config.concurrency) {
      const batchGroup = batches.slice(i, i + this.config.concurrency);
      
      // Check memory before processing
      await this.memoryMonitor.waitForMemory();
      
      try {
        const batchPromises = batchGroup.map(async (batch, index) => {
          progress.currentBatch = i + index + 1;
          progress.memoryUsage = this.memoryMonitor.getCurrentUsage();
          
          if (operation.onProgress) {
            operation.onProgress(progress);
          }
          
          return await this.processSingleBatch(batch, operation);
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.flat());
        
        progress.processed += batchGroup.reduce((sum, b) => sum + b.length, 0);
        
        // Clear processed items from memory
        await this.memoryMonitor.cleanup();
        
      } catch (error) {
        if (operation.onError) {
          const batchError: BatchError = {
            batch: i,
            items: batchGroup.flat(),
            error: error as Error,
            canContinue: this.canContinue(error as Error)
          };
          operation.onError(batchError);
          
          if (!batchError.canContinue) {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }

    return results;
  }

  private createBatches(items: T[]): T[][] {
    const batches: T[][] = [];
    const batchSize = this.calculateOptimalBatchSize(items);
    
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    
    return batches;
  }

  private calculateOptimalBatchSize(items: T[]): number {
    const itemSize = this.estimateItemSize(items[0]);
    const availableMemory = this.memoryMonitor.getAvailableMemory();
    const optimalSize = Math.floor(availableMemory / itemSize);
    
    return Math.min(optimalSize, this.config.maxBatchSize);
  }

  private estimateItemSize(item: T): number {
    // Rough estimation of object size in memory
    return JSON.stringify(item).length * 2; // Unicode chars = 2 bytes
  }

  private async processSingleBatch(
    batch: T[],
    operation: BatchOperation<T, R>
  ): Promise<R[]> {
    return await operation.process(batch);
  }

  private canContinue(error: Error): boolean {
    // Determine if batch processing can continue after error
    return !error.message.includes('FATAL') && 
           !error.message.includes('OUT_OF_MEMORY');
  }
}

// Memory Monitor
export class MemoryMonitor {
  private maxMemory: number;
  private currentUsage: number = 0;

  constructor(maxMemory: number) {
    this.maxMemory = maxMemory;
  }

  async waitForMemory(): Promise<void> {
    while (this.currentUsage > this.maxMemory * 0.8) {
      await new Promise(resolve => setTimeout(resolve, 100));
      await this.cleanup();
    }
  }

  getCurrentUsage(): number {
    return this.currentUsage;
  }

  getAvailableMemory(): number {
    return this.maxMemory - this.currentUsage;
  }

  async cleanup(): Promise<void> {
    if (global.gc) {
      global.gc();
    }
    // Update current usage after GC
    this.currentUsage = process.memoryUsage().heapUsed;
  }
}

// Stream-based processing for large datasets
export class StreamBatchProcessor<T, R> {
  async processStream(
    stream: NodeJS.ReadableStream,
    operation: BatchOperation<T, R>,
    config: BatchConfig
  ): Promise<void> {
    const processor = new BatchProcessor<T, R>(config);
    let buffer: T[] = [];

    return new Promise((resolve, reject) => {
      stream.on('data', async (chunk: T) => {
        buffer.push(chunk);
        
        if (buffer.length >= config.maxBatchSize) {
          stream.pause();
          try {
            await processor.processBatch(buffer, operation);
            buffer = [];
            stream.resume();
          } catch (error) {
            reject(error);
          }
        }
      });

      stream.on('end', async () => {
        if (buffer.length > 0) {
          try {
            await processor.processBatch(buffer, operation);
          } catch (error) {
            reject(error);
          }
        }
        resolve();
      });

      stream.on('error', reject);
    });
  }
}