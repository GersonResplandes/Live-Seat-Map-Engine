import { SeatService } from '../../src/services/SeatService';
import { SeatRepository } from '../../src/repositories/SeatRepository';

jest.mock('../../src/repositories/SeatRepository');

describe('SeatService', () => {
  let service: SeatService;
  let mockRepo: jest.Mocked<SeatRepository>;

  beforeEach(() => {
    mockRepo = new SeatRepository() as jest.Mocked<SeatRepository>;
    service = new SeatService();
    (service as any).seatRepository = mockRepo;
  });

  it('should reserve seat if repository returns true', async () => {
    mockRepo.acquireLock.mockResolvedValue(true);

    const result = await service.reserveSeat('A1', 'user_1', 'socket_1');

    expect(result).toBe(true);
    expect(mockRepo.trackSocketLock).toHaveBeenCalledWith('socket_1', 'A1');
  });

  it('should NOT track lock if reservation fails', async () => {
    mockRepo.acquireLock.mockResolvedValue(false);

    const result = await service.reserveSeat('A1', 'user_1', 'socket_1');

    expect(result).toBe(false);
    expect(mockRepo.trackSocketLock).not.toHaveBeenCalled();
  });

  it('should handle disconnect cleanup', async () => {
    mockRepo.getSocketLocks.mockResolvedValue(['A1', 'A2']);

    const lockedSeats = await service.handleDisconnect('socket_1');

    expect(lockedSeats).toEqual(['A1', 'A2']);
    expect(mockRepo.forceRelease).toHaveBeenCalledTimes(2);
    expect(mockRepo.clearSocketLocks).toHaveBeenCalledWith('socket_1');
  });
});
