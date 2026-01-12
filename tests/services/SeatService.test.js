"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const SeatService_1 = require("../../src/services/SeatService");
const SeatRepository_1 = require("../../src/repositories/SeatRepository");
jest.mock('../../src/repositories/SeatRepository');
describe('SeatService', () => {
    let service;
    let mockRepo;
    beforeEach(() => {
        mockRepo = new SeatRepository_1.SeatRepository();
        service = new SeatService_1.SeatService();
        service.seatRepository = mockRepo;
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
