import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

export const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  db: parseInt(process.env.REDIS_DB || '2'),
  // Add retry strategy for more robust connection
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

export const subscriber = redis.duplicate();

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

subscriber.on('error', (err) => {
  console.error('Redis subscriber connection error:', err);
});

redis.on('connect', () => {
  // This will be logged by the server's own redis check, so this is optional
  // console.log('Redis connected successfully.');
});

subscriber.on('connect', () => {
  // console.log('Redis subscriber connected successfully.');
});
