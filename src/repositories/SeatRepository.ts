import { redisClient } from '../redis/client';

export class SeatRepository {
  private static readonly LOCKED_SEATS_KEY = 'index:locked_seats';
  private static readonly SEAT_PREFIX = 'seat:';

  /**
   * Tries to atomically acquire a lock on a seat.
   * @param seatId The ID of the seat to lock
   * @param userId The ID of the user requesting the lock
   * @param ttlSeconds Lock expiration time in seconds
   * @returns boolean true if lock acquired
   */
  async acquireLock(seatId: string, userId: string, ttlSeconds: number = 300): Promise<boolean> {
    const key = `${SeatRepository.SEAT_PREFIX}${seatId}`;

    // 1. Try to set lock
    const result = await redisClient.set(key, userId, 'EX', ttlSeconds, 'NX');

    if (result === 'OK') {
      // 2. Add to index (Optimistic for PoC, consider Lua for strict atomicity)
      await redisClient.sadd(SeatRepository.LOCKED_SEATS_KEY, seatId);
      return true;
    }

    return false;
  }

  /**
   * Releases a lock if owned by the user
   */
  async releaseLock(seatId: string, userId: string): Promise<boolean> {
    const key = `${SeatRepository.SEAT_PREFIX}${seatId}`;
    const indexKey = SeatRepository.LOCKED_SEATS_KEY;

    const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
            redis.call("del", KEYS[1])
            redis.call("srem", KEYS[2], ARGV[2])
            return 1
        else
            return 0
        end
    `;

    const result = await redisClient.eval(script, 2, key, indexKey, userId, seatId);
    return result === 1;
  }

  /**
   * Force release a lock (Administrative/Cleanup usage)
   */
  async forceRelease(seatId: string): Promise<void> {
    await redisClient.del(`${SeatRepository.SEAT_PREFIX}${seatId}`);
    await redisClient.srem(SeatRepository.LOCKED_SEATS_KEY, seatId);
  }

  /**
   * Returns all currently locked seats
   */
  async findAllLocked(): Promise<{ seatId: string; userId: string }[]> {
    const seatIds = await redisClient.smembers(SeatRepository.LOCKED_SEATS_KEY);

    if (seatIds.length === 0) return [];

    const pipeline = redisClient.pipeline();
    seatIds.forEach((seatId) => pipeline.get(`${SeatRepository.SEAT_PREFIX}${seatId}`));
    const results = await pipeline.exec();

    const lockedSeats: { seatId: string; userId: string }[] = [];

    results?.forEach((result, index) => {
      const [err, userId] = result;
      if (!err && userId) {
        lockedSeats.push({
          seatId: seatIds[index],
          userId: userId as string,
        });
      } else if (!userId) {
        // Lazy Repair
        redisClient.srem(SeatRepository.LOCKED_SEATS_KEY, seatIds[index]);
      }
    });

    return lockedSeats;
  }

  // --- Socket specific tracking ---

  async trackSocketLock(socketId: string, seatId: string): Promise<void> {
    await redisClient.sadd(`socket_locks:${socketId}`, seatId);
  }

  async untrackSocketLock(socketId: string, seatId: string): Promise<void> {
    await redisClient.srem(`socket_locks:${socketId}`, seatId);
  }

  async getSocketLocks(socketId: string): Promise<string[]> {
    return await redisClient.smembers(`socket_locks:${socketId}`);
  }

  async clearSocketLocks(socketId: string): Promise<void> {
    await redisClient.del(`socket_locks:${socketId}`);
  }
}
