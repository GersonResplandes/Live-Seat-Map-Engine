import { RateLimitService } from '../../src/services/RateLimitService';
import { RateLimitRepository } from '../../src/repositories/RateLimitRepository';

// Mock Repository
jest.mock('../../src/repositories/RateLimitRepository');

describe('RateLimitService', () => {
  let service: RateLimitService;
  let mockRepo: jest.Mocked<RateLimitRepository>;

  beforeEach(() => {
    mockRepo = new RateLimitRepository() as jest.Mocked<RateLimitRepository>;
    service = new RateLimitService();
    (service as any).repository = mockRepo; // Inject mock
  });

  it('should allow request if under limit', async () => {
    mockRepo.increment.mockResolvedValue(1); // 1st request

    const isAllowed = await service.isAllowed('test_action', 'user_1', 10, 60);

    expect(isAllowed).toBe(true);
    expect(mockRepo.increment).toHaveBeenCalled();
  });

  it('should block request if over limit', async () => {
    mockRepo.increment.mockResolvedValue(11); // 11th request (limit 10)

    const isAllowed = await service.isAllowed('test_action', 'user_1', 10, 60);

    expect(isAllowed).toBe(false);
  });

  it('should fail open (allow) if redis errors', async () => {
    mockRepo.increment.mockRejectedValue(new Error('Redis Down'));

    // Should return true to avoid blocking users during outage
    const isAllowed = await service.isAllowed('test_action', 'user_1', 10, 60);

    expect(isAllowed).toBe(true);
  });
});
