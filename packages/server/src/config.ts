import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001'),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  blockchainNodeUrl: process.env.BLOCKCHAIN_NODE_URL || 'http://localhost:8001',
  blockchainWsUrl: process.env.BLOCKCHAIN_WS_URL || 'ws://localhost:8001',
};
