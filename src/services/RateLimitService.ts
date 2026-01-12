import { RateLimitRepository } from '../repositories/RateLimitRepository';

export class RateLimitService {
  private repository: RateLimitRepository;

  constructor() {
    this.repository = new RateLimitRepository();
  }

  /**
   * Checks if an action is allowed based on rate limits.
   * @param action Identifier for the action (e.g. 'lock_seat')
   * @param userId User identifier
   * @param limit Max allowed actions
   * @param windowSeconds Time window in seconds
   * @returns true if allowed, false if limit exceeded
   */
  async isAllowed(
    action: string,
    userId: string,
    limit: number = 10,
    windowSeconds: number = 60,
  ): Promise<boolean> {
    const key = `ratelimit:${action}:${userId}`;

    try {
      const currentCount = await this.repository.increment(key, windowSeconds);
      return currentCount <= limit;
    } catch (error) {
      console.error('Rate Limit Error:', error);
      // Fail open or closed? Safe default: Allow but log, or Deny.
      // For abuse prevention, failing open (allow) might defeat purpose, but better than blocking legit users on redis error.
      // Let's assume high availability redis and return true (allow) to avoid service disruption, but log heavily.
      return true;
    }
  }
}
