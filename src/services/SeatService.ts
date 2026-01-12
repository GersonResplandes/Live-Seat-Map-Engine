import { SeatRepository } from '../repositories/SeatRepository';

export class SeatService {
  private seatRepository: SeatRepository;

  constructor() {
    this.seatRepository = new SeatRepository();
  }

  async getSeatMap() {
    return await this.seatRepository.findAllLocked();
  }

  async reserveSeat(seatId: string, userId: string, socketId: string): Promise<boolean> {
    // Here we can add Business Logic
    // e.g. Max 4 seats per user (requires another index)
    // e.g. Valid seat check

    const acquired = await this.seatRepository.acquireLock(seatId, userId);

    if (acquired) {
      // Track for disconnect cleanup
      await this.seatRepository.trackSocketLock(socketId, seatId);
    }

    return acquired;
  }

  async cancelReservation(seatId: string, userId: string, socketId: string): Promise<boolean> {
    const released = await this.seatRepository.releaseLock(seatId, userId);

    if (released) {
      await this.seatRepository.untrackSocketLock(socketId, seatId);
    }

    return released;
  }

  async handleDisconnect(socketId: string): Promise<string[]> {
    const lockedSeats = await this.seatRepository.getSocketLocks(socketId);

    if (lockedSeats.length > 0) {
      const promises = lockedSeats.map(async (seatId) => {
        await this.seatRepository.forceRelease(seatId);
        return seatId;
      });

      await Promise.all(promises);
      await this.seatRepository.clearSocketLocks(socketId);
    }

    return lockedSeats;
  }
}
