import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Primary Redis Client for Data
export const redisClient = new Redis(REDIS_URL);
// Pub/Sub Clients (Socket.io Adapter needs separate connections)
export const pubClient = new Redis(REDIS_URL);
export const subClient = pubClient.duplicate();

const LOCKED_SEATS_KEY = 'index:locked_seats';

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

  // Use pipeline to ensure we add to index immediately if lock succeeds
  // NOTE: This is optimistic. Ideally we should use Lua script for 100% atomicity between Key Set and Index Add.
  // For Phase 1, we stick to TS logic but improving lookups.

  // 1. Try to set lock
  const result = await redisClient.set(key, userId, 'EX', 300, 'NX');

  if (result === 'OK') {
    // 2. Add to index
    await redisClient.sadd(LOCKED_SEATS_KEY, seatId);
    return true;
  }

  return false;
};

/**
 * atomicReleaseSeat
 * Releases a lock ONLY if it belongs to the user.
 * Uses a Lua script to ensure atomicity (Check if Owner -> Delete -> Remove from Index).
 */
export const atomicReleaseSeat = async (seatId: string, userId: string): Promise<boolean> => {
  const key = `seat:${seatId}`;
  const indexKey = LOCKED_SEATS_KEY;

  // Lua script: Get key. If val == userId, DEL key AND SREM from index.
  const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
            redis.call("del", KEYS[1])
            redis.call("srem", KEYS[2], ARGV[2])
            return 1
        else
            return 0
        end
    `;
  // KEYS[1]=seatKey, KEYS[2]=indexKey, ARGV[1]=userId, ARGV[2]=seatId
  const result = await redisClient.eval(script, 2, key, indexKey, userId, seatId);
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
 * Uses Set Members to return state O(1) instead of SCAN/KEYS O(N).
 * Returns array of { seatId, userId }
 */
export const getAllLockedSeats = async (): Promise<{ seatId: string; userId: string }[]> => {
  // Get all seat IDs from the index set
  const seatIds = await redisClient.smembers(LOCKED_SEATS_KEY);

  if (seatIds.length === 0) return [];

  const pipeline = redisClient.pipeline();
  seatIds.forEach((seatId) => pipeline.get(`seat:${seatId}`));
  const results = await pipeline.exec();

  const lockedSeats: { seatId: string; userId: string }[] = [];

  results?.forEach((result, index) => {
    const [err, userId] = result;
    // If seat key expired but still in set (lazy cleanup), we might get null here.
    // In a real app we would cleanup the set here too.
    if (!err && userId) {
      lockedSeats.push({
        seatId: seatIds[index],
        userId: userId as string,
      });
    } else if (!userId) {
      // Self-repair: Remove from set if key is gone
      redisClient.srem(LOCKED_SEATS_KEY, seatIds[index]);
    }
  });

  return lockedSeats;
};
