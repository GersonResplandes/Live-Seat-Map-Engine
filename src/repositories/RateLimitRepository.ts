import { redisClient } from '../redis/client';

export class RateLimitRepository {
  /**
   * Increments the counter for a specific key and sets expiration if it's a new window.
   * @param key The rate limit identifier (e.g., rate_limit:request_seat:userId)
   * @param windowSeconds The duration of the time window in seconds
   * @returns The current count after increment
   */
  async increment(key: string, windowSeconds: number): Promise<number> {
    const multi = redisClient.multi();
    multi.incr(key);
    multi.expire(key, windowSeconds, 'NX'); // Only set expiry if the key has no expiry (start of window)

    // Execute atomic transaction
    const results = await multi.exec();

    // Results is [[err, result1], [err, result2]]
    // result1 is from INCR (number)
    if (results && results[0] && !results[0][0]) {
      return results[0][1] as number;
    }

    throw new Error('Failed to increment rate limit counter');
  }

  /**
   * Gets the current count without incrementing.
   */
  async getCount(key: string): Promise<number> {
    const count = await redisClient.get(key);
    return count ? parseInt(count, 10) : 0;
  }
}
