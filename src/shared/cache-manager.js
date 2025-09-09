const Redis = require('ioredis');

class CacheManager {
  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      db: parseInt(process.env.REDIS_DB || '2')
    });
    
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0
    };
  }

  getRedisClient() {
    return this.redis;
  }

  async get(key) {
    const value = await this.redis.get(key);
    if (value) {
      this.stats.hits++;
      return JSON.parse(value);
    }
    this.stats.misses++;
    return null;
  }

  async set(key, value, ttl = 3600) {
    this.stats.sets++;
    return await this.redis.setex(key, ttl, JSON.stringify(value));
  }

  async del(key) {
    return await this.redis.del(key);
  }

  async getOrCompute(key, computeFn, options = {}) {
    const cached = await this.get(key);
    if (cached) return cached;
    
    const value = await computeFn();
    if (value !== null && value !== undefined) {
      await this.set(key, value, options.ttl || 3600);
    }
    return value;
  }

  async getStats() {
    return {
      ...this.stats,
      hitRate: this.stats.hits / (this.stats.hits + this.stats.misses) || 0,
      totalOperations: this.stats.hits + this.stats.misses + this.stats.sets
    };
  }
}

const cacheManager = new CacheManager();

module.exports = { cacheManager };