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

// --- Atomic Seat Locking (The Core Logic) ---

/**
 * atomicLockSeat
 * Tries to lock a seat for a specific user.
 * precise atomic operation: SET key value NX EX 300
 * NX = Only set if Not Exists
 * EX = Expire in 300 seconds (5 mins)
 *
 * Returns true if lock acquired, false if already locked.
 */
export const atomicLockSeat = async (seatId: string, userId: string): Promise<boolean> => {
  const key = `seat:${seatId}`;
  // "OK" if set, null if not set (already exists)
  const result = await redisClient.set(key, userId, 'EX', 300, 'NX');
  return result === 'OK';
};

/**
 * atomicReleaseSeat
 * Releases a lock ONLY if it belongs to the user.
 * Uses a Lua script to ensure atomicity (Check if Owner -> Delete).
 */
export const atomicReleaseSeat = async (seatId: string, userId: string): Promise<boolean> => {
  const key = `seat:${seatId}`;
  // Lua script: Get key. If val == userId, DEL key.
  const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
    `;
  const result = await redisClient.eval(script, 1, key, userId);
  return result === 1;
};

/**
 * getSeatOwner
 * Returns the userId who owns the seat, or null.
 */
export const getSeatOwner = async (seatId: string): Promise<string | null> => {
  return await redisClient.get(`seat:${seatId}`);
};

/**
 * getAllLockedSeats
 * Scans all seat keys to return current state.
 * Returns array of { seatId, userId }
 */
export const getAllLockedSeats = async (): Promise<{ seatId: string; userId: string }[]> => {
  // Scan for keys starting with "seat:"
  // Note: In production with millions of keys, SCAN is better than KEYS.
  const keys = await redisClient.keys('seat:*');

  if (keys.length === 0) return [];

  const pipeline = redisClient.pipeline();
  keys.forEach((key) => pipeline.get(key));
  const results = await pipeline.exec();

  const lockedSeats: { seatId: string; userId: string }[] = [];

  results?.forEach((result, index) => {
    const [err, userId] = result;
    if (!err && userId) {
      lockedSeats.push({
        seatId: keys[index].replace('seat:', ''),
        userId: userId as string,
      });
    }
  });

  return lockedSeats;
};
