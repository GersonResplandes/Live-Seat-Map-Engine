import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Primary Redis Client for Data
export const redisClient = new Redis(REDIS_URL);
// Pub/Sub Clients (Socket.io Adapter needs separate connections)
export const pubClient = new Redis(REDIS_URL);
export const subClient = pubClient.duplicate();

redisClient.on('connect', () => console.log('✅ Redis Client Connected'));
redisClient.on('error', (err) => console.error('❌ Redis Client Error', err));

pubClient.on('connect', () => console.log('✅ Redis Pub Client Connected'));
pubClient.on('error', (err) => console.error('❌ Redis Pub Client Error', err));

subClient.on('connect', () => console.log('✅ Redis Sub Client Connected'));
subClient.on('error', (err) => console.error('❌ Redis Sub Client Error', err));
