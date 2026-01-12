import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Primary Redis Client for Data
export const redisClient = new Redis(REDIS_URL);
// Pub/Sub Clients (Socket.io Adapter needs separate connections)
export const pubClient = new Redis(REDIS_URL);
export const subClient = pubClient.duplicate();

import { logger } from '../utils/logger';

// ...

redisClient.on('connect', () => logger.info('✅ Redis Client Connected'));
redisClient.on('error', (err) => logger.error('❌ Redis Client Error', err));

pubClient.on('connect', () => logger.info('✅ Redis Pub Client Connected'));
pubClient.on('error', (err) => logger.error('❌ Redis Pub Client Error', err));

subClient.on('connect', () => logger.info('✅ Redis Sub Client Connected'));
subClient.on('error', (err) => logger.error('❌ Redis Sub Client Error', err));
