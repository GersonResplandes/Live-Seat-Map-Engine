import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { logger } from '../utils/logger';
import { SeatService } from '../services/SeatService';

const SeatIdSchema = z.string().regex(/^[A-J](10|[1-9])$/, 'Invalid Seat ID format (e.g. A1, B10)');

interface SeatRequest {
  seatId: string;
}

import { RateLimitService } from '../services/RateLimitService';

export class SeatController {
  private seatService: SeatService;
  private rateLimitService: RateLimitService;
  private io: Server;

  constructor(io: Server) {
    this.io = io;
    this.seatService = new SeatService();
    this.rateLimitService = new RateLimitService();
  }

  handleConnection(socket: Socket) {
    // ... existing code
    const userId = socket.data.userId;
    logger.info(`🔌 Client connected: ${socket.id}`, { userId });

    // --- Events ---

    socket.on('join_room', (roomName) => this.joinRoom(socket, roomName));
    socket.on('whoami', () => this.whoAmI(socket));
    socket.on('request_seat', (data) => this.requestSeat(socket, data));
    socket.on('release_seat', (data) => this.releaseSeat(socket, data));
    socket.on('disconnect', () => this.handleDisconnect(socket));
  }

  // ... helpers

  private async joinRoom(socket: Socket, roomName: string) {
    socket.join(roomName);
    const currentLocks = await this.seatService.getSeatMap();
    socket.emit('current_state', currentLocks);
  }

  private whoAmI(socket: Socket) {
    socket.emit('your_identity', socket.data.userId);
  }

  private async requestSeat(socket: Socket, data: SeatRequest) {
    const { seatId } = data;
    const userId = socket.data.userId;

    // 1. Validation
    const validation = SeatIdSchema.safeParse(seatId);
    if (!validation.success) {
      socket.emit('error', { message: validation.error.issues[0].message });
      return;
    }

    // 2. Rate Limiting (Phase 3)
    // Limit: 5 requests per 60 seconds
    const isAllowed = await this.rateLimitService.isAllowed('lock_seat', userId, 5, 60);
    if (!isAllowed) {
      socket.emit('error', { message: 'Rate limit exceeded. Please wait a moment.' });
      return;
    }

    logger.info(`🔒 Request Lock: ${seatId}`, { userId, seatId });

    // 3. Service Call
    const success = await this.seatService.reserveSeat(seatId, userId, socket.id);

    if (success) {
      this.io.to('cinema_1').emit('seat_locked', { seatId, userId });
    } else {
      socket.emit('error', { message: `Seat ${seatId} is already taken.` });
    }
  }

  private async releaseSeat(socket: Socket, data: SeatRequest) {
    const { seatId } = data;
    const userId = socket.data.userId;

    if (!SeatIdSchema.safeParse(seatId).success) return;

    const success = await this.seatService.cancelReservation(seatId, userId, socket.id);

    if (success) {
      this.io.to('cinema_1').emit('seat_released', { seatId });
    }
  }

  private async handleDisconnect(socket: Socket) {
    logger.info(`❌ Disconnected: ${socket.id}`);
    const releasedSeats = await this.seatService.handleDisconnect(socket.id);

    if (releasedSeats.length > 0) {
      logger.info(`🧹 Cleaning up ${releasedSeats.length} seats for ${socket.id}`, {
        seats: releasedSeats,
      });
      releasedSeats.forEach((seatId) => {
        this.io.to('cinema_1').emit('seat_released', { seatId });
      });
    }
  }
}
