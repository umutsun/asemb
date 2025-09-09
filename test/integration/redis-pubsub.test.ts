/**
 * Redis Pub/Sub Integration Tests
 * @author Claude (Architecture Lead)
 */

import Redis from 'ioredis';
import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { RedisPool } from '../../src/shared/connection-pool';
import { IAgentMessage, AgentType, MessageType, MessagePriority, REDIS_KEYS } from '../../shared/interfaces';

describe('Redis Pub/Sub Integration', () => {
  let publisher: Redis;
  let subscriber: Redis;
  let redisPool: RedisPool;
  
  beforeAll(async () => {
    redisPool = RedisPool.getInstance();
    publisher = redisPool.getClient('pubsub');
    subscriber = redisPool.getClient('pubsub');
  });
  
  afterAll(async () => {
    await redisPool.shutdown();
  });
  
  beforeEach(async () => {
    // Clear any existing subscriptions
    await subscriber.unsubscribe();
  });
  
  afterEach(async () => {
    subscriber.removeAllListeners();
  });
  
  describe('Agent Communication', () => {
    it('should broadcast messages to all agents', (done) => {
      const projectKey = 'test-project';
      const channel = REDIS_KEYS.agentChannel(projectKey);
      
      const testMessage: IAgentMessage = {
        id: 'test-123',
        from: AgentType.CLAUDE,
        to: 'all',
        type: MessageType.UPDATE,
        priority: MessagePriority.HIGH,
        content: {
          title: 'Test Broadcast',
          description: 'Testing agent broadcast',
          data: { test: true }
        },
        timestamp: new Date()
      };
      
      // Subscribe to channel
      subscriber.subscribe(channel, (err) => {
        expect(err).toBeNull();
      });
      
      // Handle message
      subscriber.on('message', (receivedChannel, message) => {
        expect(receivedChannel).toBe(channel);
        const received = JSON.parse(message);
        expect(received.id).toBe(testMessage.id);
        expect(received.from).toBe(testMessage.from);
        done();
      });
      
      // Wait for subscription to be ready
      setTimeout(() => {
        publisher.publish(channel, JSON.stringify(testMessage));
      }, 100);
    });
    
    it('should handle agent-specific messages', (done) => {
      const projectKey = 'test-project';
      const agentChannel = REDIS_KEYS.agentChannel(projectKey, 'gemini');
      
      const testMessage: IAgentMessage = {
        id: 'test-456',
        from: AgentType.CLAUDE,
        to: AgentType.GEMINI,
        type: MessageType.TASK,
        priority: MessagePriority.MEDIUM,
        content: {
          title: 'Process embeddings',
          description: 'Generate embeddings for new documents',
          data: { documentIds: ['doc1', 'doc2'] }
        },
        timestamp: new Date()
      };
      
      subscriber.subscribe(agentChannel, (err) => {
        expect(err).toBeNull();
      });
      
      subscriber.on('message', (channel, message) => {
        const received = JSON.parse(message);
        expect(received.to).toBe(AgentType.GEMINI);
        expect(received.type).toBe(MessageType.TASK);
        done();
      });
      
      setTimeout(() => {
        publisher.publish(agentChannel, JSON.stringify(testMessage));
      }, 100);
    });
  });
  
  describe('Workflow Metrics Publishing', () => {
    it('should publish workflow metrics updates', (done) => {
      const projectKey = 'test-project';
      const metricsChannel = REDIS_KEYS.metricsChannel(projectKey);
      
      const metrics = {
        workflowId: 'workflow-123',
        executionId: 'exec-456',
        projectKey,
        itemsProcessed: 100,
        itemsFailed: 2,
        performance: {
          averageProcessingTime: 250,
          peakMemoryUsage: 512,
          apiCallsCount: 50,
          cacheHitRate: 0.85
        }
      };
      
      subscriber.subscribe(metricsChannel, (err) => {
        expect(err).toBeNull();
      });
      
      subscriber.on('message', (channel, message) => {
        const received = JSON.parse(message);
        expect(received.workflowId).toBe(metrics.workflowId);
        expect(received.performance.cacheHitRate).toBe(0.85);
        done();
      });
      
      setTimeout(() => {
        publisher.publish(metricsChannel, JSON.stringify(metrics));
      }, 100);
    });
    
    it('should handle multiple subscribers', (done) => {
      const projectKey = 'test-project';
      const channel = REDIS_KEYS.workflowChannel(projectKey);
      const subscriber2 = redisPool.getClient('pubsub');
      
      let receivedCount = 0;
      const expectedCount = 2;
      
      const handleMessage = () => {
        receivedCount++;
        if (receivedCount === expectedCount) {
          subscriber2.quit();
          done();
        }
      };
      
      // Subscribe both clients
      subscriber.subscribe(channel);
      subscriber2.subscribe(channel);
      
      subscriber.on('message', handleMessage);
      subscriber2.on('message', handleMessage);
      
      // Publish after both are subscribed
      setTimeout(() => {
        publisher.publish(channel, JSON.stringify({ test: true }));
      }, 100);
    });
  });
  
  describe('Error Recovery', () => {
    it('should handle connection failures gracefully', async () => {
      const faultyRedis = new Redis({
        host: 'invalid-host',
        port: 6379,
        retryStrategy: () => null, // Don't retry
        lazyConnect: true
      });
      
      await expect(faultyRedis.connect()).rejects.toThrow();
      faultyRedis.disconnect();
    }, 10000);
    
    it('should reconnect after temporary disconnection', (done) => {
      const reconnectRedis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        retryStrategy: (times) => {
          if (times > 2) return null;
          return 100;
        }
      });
      
      reconnectRedis.on('ready', () => {
        done();
      });
      
      reconnectRedis.on('error', () => {
        // Expected during reconnection
      });
    });
  });
  
  describe('Queue Management', () => {
    it('should handle upsert queue operations', async () => {
      const projectKey = 'test-project';
      const queueKey = REDIS_KEYS.upsertQueue(projectKey);
      const client = redisPool.getClient('queue');
      
      // Add items to queue
      const items = [
        { id: 'doc1', content: 'Content 1' },
        { id: 'doc2', content: 'Content 2' },
        { id: 'doc3', content: 'Content 3' }
      ];
      
      for (const item of items) {
        await client.lpush(queueKey, JSON.stringify(item));
      }
      
      // Check queue length
      const length = await client.llen(queueKey);
      expect(length).toBe(3);
      
      // Process items from queue
      const processed = [];
      while (true) {
        const item = await client.rpop(queueKey);
        if (!item) break;
        processed.push(JSON.parse(item));
      }
      
      expect(processed).toHaveLength(3);
      expect(processed[0].id).toBe('doc1');
      
      // Cleanup
      await client.del(queueKey);
    });
    
    it('should handle search queue with priority', async () => {
      const projectKey = 'test-project';
      const queueKey = REDIS_KEYS.searchQueue(projectKey);
      const client = redisPool.getClient('queue');
      
      // Add items with different priorities
      const queries = [
        { query: 'test1', priority: 1 },
        { query: 'test2', priority: 3 },
        { query: 'test3', priority: 2 }
      ];
      
      // Use sorted set for priority queue
      for (const q of queries) {
        await client.zadd(queueKey, q.priority, JSON.stringify(q));
      }
      
      // Get highest priority item
      const topItems = await client.zrange(queueKey, 0, 0);
      expect(topItems).toHaveLength(1);
      
      const topItem = JSON.parse(topItems[0]);
      expect(topItem.query).toBe('test1');
      
      // Cleanup
      await client.del(queueKey);
    });
  });
  
  describe('Context Sharing', () => {
    it('should store and retrieve agent context', async () => {
      const projectKey = 'test-project';
      const contextKey = REDIS_KEYS.context(projectKey, 'development');
      const client = redisPool.getClient('cache');
      
      const context = {
        environment: 'development',
        version: '1.0.0',
        features: ['embedding', 'search', 'chunking'],
        timestamp: new Date().toISOString()
      };
      
      // Store context
      await client.set(contextKey, JSON.stringify(context), 'EX', 3600);
      
      // Retrieve context
      const retrieved = await client.get(contextKey);
      expect(retrieved).not.toBeNull();
      
      const parsed = JSON.parse(retrieved!);
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.features).toContain('embedding');
      
      // List all contexts
      await client.sadd(REDIS_KEYS.contextList(projectKey), 'development');
      const contexts = await client.smembers(REDIS_KEYS.contextList(projectKey));
      expect(contexts).toContain('development');
      
      // Cleanup
      await client.del(contextKey);
      await client.del(REDIS_KEYS.contextList(projectKey));
    });
  });
  
  describe('Performance Monitoring', () => {
    it('should track operation latency', async () => {
      const client = redisPool.getClient('cache');
      const iterations = 100;
      const latencies: number[] = [];
      
      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await client.ping();
        latencies.push(Date.now() - start);
      }
      
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      
      console.log(`Redis latency - Avg: ${avgLatency.toFixed(2)}ms, Max: ${maxLatency}ms`);
      
      expect(avgLatency).toBeLessThan(10); // Should be very fast locally
      expect(maxLatency).toBeLessThan(50);
    });
    
    it('should handle concurrent operations efficiently', async () => {
      const client = redisPool.getClient('cache');
      const concurrency = 50;
      const key = 'test:concurrent';
      
      const start = Date.now();
      
      // Concurrent writes
      const writePromises = Array(concurrency).fill(0).map((_, i) => 
        client.set(`${key}:${i}`, `value${i}`, 'EX', 60)
      );
      
      await Promise.all(writePromises);
      
      // Concurrent reads
      const readPromises = Array(concurrency).fill(0).map((_, i) => 
        client.get(`${key}:${i}`)
      );
      
      const results = await Promise.all(readPromises);
      
      const duration = Date.now() - start;
      
      console.log(`Processed ${concurrency * 2} operations in ${duration}ms`);
      
      expect(results).toHaveLength(concurrency);
      expect(results[0]).toBe('value0');
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      
      // Cleanup
      const deletePromises = Array(concurrency).fill(0).map((_, i) => 
        client.del(`${key}:${i}`)
      );
      await Promise.all(deletePromises);
    });
  });
});

// Test utilities
export class RedisTestHelper {
  static async cleanupTestData(projectKey: string): Promise<void> {
    const client = RedisPool.getInstance().getClient('cache');
    const pattern = `asb:${projectKey}:*`;
    const keys = await client.keys(pattern);
    
    if (keys.length > 0) {
      await client.del(...keys);
    }
  }
  
  static async setupTestData(projectKey: string): Promise<void> {
    const client = RedisPool.getInstance().getClient('cache');
    
    // Setup test contexts
    await client.set(
      REDIS_KEYS.context(projectKey, 'test'),
      JSON.stringify({ env: 'test', timestamp: new Date() }),
      'EX',
      3600
    );
    
    // Setup test metrics
    await client.set(
      REDIS_KEYS.projectMetrics(projectKey),
      JSON.stringify({ 
        documentsProcessed: 0,
        searchQueries: 0,
        errors: 0
      }),
      'EX',
      3600
    );
  }
}