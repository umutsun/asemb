import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import crypto from 'crypto';

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
  statusCode?: number;
  headers?: boolean;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
  handler?: (req: Request, res: Response) => void;
  onLimitReached?: (req: Request, res: Response, options: RateLimitConfig) => void;
}

export interface RateLimitRule {
  path: string | RegExp;
  method?: string | string[];
  config: RateLimitConfig;
}

export class RateLimiter {
  private redis: Redis;
  private rules: RateLimitRule[] = [];
  private defaultConfig: RateLimitConfig;

  constructor(redis: Redis, defaultConfig?: Partial<RateLimitConfig>) {
    this.redis = redis;
    this.defaultConfig = {
      windowMs: 60000,
      max: 100,
      message: 'Too many requests, please try again later.',
      statusCode: 429,
      headers: true,
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      ...defaultConfig
    };
  }

  addRule(rule: RateLimitRule): void {
    this.rules.push({
      ...rule,
      config: { ...this.defaultConfig, ...rule.config }
    });
  }

  middleware(customConfig?: Partial<RateLimitConfig>) {
    const config = { ...this.defaultConfig, ...customConfig };

    return async (req: Request, res: Response, next: NextFunction) => {
      try {
        const rule = this.findMatchingRule(req);
        const activeConfig = rule ? rule.config : config;

        if (activeConfig.skip && activeConfig.skip(req)) {
          return next();
        }

        const key = this.generateKey(req, activeConfig);
        const limit = activeConfig.max;
        const window = activeConfig.windowMs;
        const now = Date.now();
        const windowStart = now - window;

        const pipeline = this.redis.pipeline();
        pipeline.zremrangebyscore(key, '-inf', windowStart);
        pipeline.zadd(key, now, `${now}-${crypto.randomBytes(4).toString('hex')}`);
        pipeline.zcard(key);
        pipeline.expire(key, Math.ceil(window / 1000));
        
        const results = await pipeline.exec();
        const count = results?.[2]?.[1] as number || 0;

        const remaining = Math.max(0, limit - count);
        const resetTime = new Date(now + window);

        if (activeConfig.headers) {
          res.setHeader('X-RateLimit-Limit', limit.toString());
          res.setHeader('X-RateLimit-Remaining', remaining.toString());
          res.setHeader('X-RateLimit-Reset', resetTime.toISOString());
          res.setHeader('Retry-After', Math.ceil(window / 1000).toString());
        }

        if (count > limit) {
          if (activeConfig.onLimitReached) {
            activeConfig.onLimitReached(req, res, activeConfig);
          }

          if (activeConfig.handler) {
            return activeConfig.handler(req, res);
          }

          return res.status(activeConfig.statusCode || 429).json({
            error: activeConfig.message,
            retryAfter: Math.ceil(window / 1000),
            resetTime: resetTime.toISOString()
          });
        }

        const origEnd = res.end;
        res.end = function(...args: any[]) {
          const shouldSkip = 
            (activeConfig.skipSuccessfulRequests && res.statusCode < 400) ||
            (activeConfig.skipFailedRequests && res.statusCode >= 400);

          if (shouldSkip) {
            const removePromise = pipeline.zrem(key, `${now}-${crypto.randomBytes(4).toString('hex')}`);
            removePromise.catch(() => {});
          }

          return origEnd.apply(res, args);
        };

        next();
      } catch (error) {
        console.error('Rate limiter error:', error);
        next();
      }
    };
  }

  private findMatchingRule(req: Request): RateLimitRule | undefined {
    return this.rules.find(rule => {
      const pathMatch = typeof rule.path === 'string'
        ? req.path === rule.path || req.path.startsWith(rule.path)
        : rule.path.test(req.path);

      if (!pathMatch) return false;

      if (rule.method) {
        const methods = Array.isArray(rule.method) ? rule.method : [rule.method];
        return methods.includes(req.method);
      }

      return true;
    });
  }

  private generateKey(req: Request, config: RateLimitConfig): string {
    const identifier = config.keyGenerator
      ? config.keyGenerator(req)
      : this.getDefaultIdentifier(req);

    return `ratelimit:${identifier}`;
  }

  private getDefaultIdentifier(req: Request): string {
    const userId = (req as any).user?.id;
    if (userId) return `user:${userId}`;

    const apiKey = req.headers['x-api-key'] as string;
    if (apiKey) return `api:${this.hashApiKey(apiKey)}`;

    const ip = this.getClientIp(req);
    return `ip:${ip}`;
  }

  private getClientIp(req: Request): string {
    const forwarded = req.headers['x-forwarded-for'] as string;
    if (forwarded) {
      return forwarded.split(',')[0].trim();
    }

    const realIp = req.headers['x-real-ip'] as string;
    if (realIp) return realIp;

    return req.socket.remoteAddress || 'unknown';
  }

  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex').substring(0, 16);
  }

  async reset(identifier: string): Promise<void> {
    const key = `ratelimit:${identifier}`;
    await this.redis.del(key);
  }

  async getStatus(identifier: string, windowMs: number = this.defaultConfig.windowMs): Promise<{
    count: number;
    remaining: number;
    resetTime: Date;
  }> {
    const key = `ratelimit:${identifier}`;
    const now = Date.now();
    const windowStart = now - windowMs;

    await this.redis.zremrangebyscore(key, '-inf', windowStart);
    const count = await this.redis.zcard(key);
    const limit = this.defaultConfig.max;

    return {
      count,
      remaining: Math.max(0, limit - count),
      resetTime: new Date(now + windowMs)
    };
  }
}

export class DistributedRateLimiter extends RateLimiter {
  private nodeId: string;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(redis: Redis, nodeId: string, defaultConfig?: Partial<RateLimitConfig>) {
    super(redis, defaultConfig);
    this.nodeId = nodeId;
    this.startSync();
  }

  private startSync(): void {
    this.syncInterval = setInterval(() => {
      this.syncCounters();
    }, 5000);
  }

  private async syncCounters(): Promise<void> {
    const pattern = 'ratelimit:*';
    const keys = await this.redis.keys(pattern);

    for (const key of keys) {
      const ttl = await this.redis.ttl(key);
      if (ttl > 0) {
        await this.redis.expire(key, ttl);
      }
    }
  }

  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

export class SlidingWindowRateLimiter {
  private redis: Redis;
  private window: number;
  private limit: number;

  constructor(redis: Redis, windowMs: number, limit: number) {
    this.redis = redis;
    this.window = windowMs;
    this.limit = limit;
  }

  async isAllowed(identifier: string): Promise<{
    allowed: boolean;
    count: number;
    remaining: number;
    resetAt: number;
  }> {
    const now = Date.now();
    const key = `sliding:${identifier}`;
    const windowStart = now - this.window;

    const pipeline = this.redis.pipeline();
    
    pipeline.zremrangebyscore(key, '-inf', windowStart);
    
    pipeline.zcount(key, windowStart, now);
    
    const results = await pipeline.exec();
    const count = (results?.[1]?.[1] as number) || 0;

    if (count >= this.limit) {
      return {
        allowed: false,
        count,
        remaining: 0,
        resetAt: now + this.window
      };
    }

    await this.redis.zadd(key, now, `${now}-${Math.random()}`);
    await this.redis.expire(key, Math.ceil(this.window / 1000));

    return {
      allowed: true,
      count: count + 1,
      remaining: this.limit - count - 1,
      resetAt: now + this.window
    };
  }
}

export class TokenBucketRateLimiter {
  private redis: Redis;
  private capacity: number;
  private refillRate: number;
  private refillInterval: number;

  constructor(
    redis: Redis,
    capacity: number,
    refillRate: number,
    refillInterval: number = 1000
  ) {
    this.redis = redis;
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.refillInterval = refillInterval;
  }

  async consume(identifier: string, tokens: number = 1): Promise<{
    allowed: boolean;
    remaining: number;
    retryAfter?: number;
  }> {
    const key = `bucket:${identifier}`;
    const now = Date.now();

    const bucketData = await this.redis.get(key);
    let bucket = bucketData ? JSON.parse(bucketData) : {
      tokens: this.capacity,
      lastRefill: now
    };

    const timePassed = now - bucket.lastRefill;
    const tokensToAdd = Math.floor(timePassed / this.refillInterval) * this.refillRate;
    
    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(this.capacity, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      await this.redis.set(key, JSON.stringify(bucket), 'EX', 3600);
      
      return {
        allowed: true,
        remaining: bucket.tokens
      };
    }

    const tokensNeeded = tokens - bucket.tokens;
    const refillsNeeded = Math.ceil(tokensNeeded / this.refillRate);
    const retryAfter = refillsNeeded * this.refillInterval;

    return {
      allowed: false,
      remaining: bucket.tokens,
      retryAfter
    };
  }
}

export function createRateLimitRules(): RateLimitRule[] {
  return [
    {
      path: '/api/auth/login',
      method: 'POST',
      config: {
        windowMs: 15 * 60 * 1000,
        max: 5,
        message: 'Too many login attempts, please try again later.',
        skipSuccessfulRequests: true
      }
    },
    {
      path: '/api/auth/register',
      method: 'POST',
      config: {
        windowMs: 60 * 60 * 1000,
        max: 3,
        message: 'Registration limit exceeded, please try again later.'
      }
    },
    {
      path: '/api/vectors/search',
      method: ['GET', 'POST'],
      config: {
        windowMs: 60 * 1000,
        max: 30,
        message: 'Search rate limit exceeded.'
      }
    },
    {
      path: '/api/rag',
      config: {
        windowMs: 60 * 1000,
        max: 10,
        message: 'RAG API rate limit exceeded.'
      }
    },
    {
      path: /^\/api\/admin/,
      config: {
        windowMs: 60 * 1000,
        max: 100,
        keyGenerator: (req) => {
          const user = (req as any).user;
          return user?.role === 'admin' ? `admin:${user.id}` : 'unauthorized';
        }
      }
    },
    {
      path: '/api/webhooks',
      config: {
        windowMs: 1000,
        max: 10,
        message: 'Webhook rate limit exceeded.'
      }
    }
  ];
}

export default RateLimiter;