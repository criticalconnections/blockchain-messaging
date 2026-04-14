import IORedis from 'ioredis';
import { config } from './config.js';

export const redis = new IORedis.default(config.redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times: number) {
    return Math.min(times * 200, 5000);
  },
});

redis.on('error', (err: Error) => {
  console.error('Redis connection error:', err.message);
});
