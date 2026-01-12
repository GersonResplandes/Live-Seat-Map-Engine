import { Server, Socket } from 'socket.io';
import { z } from 'zod';
import { atomicLockSeat, atomicReleaseSeat, getAllLockedSeats, redisClient } from '../redis/client';

// --- Validation Schemas ---
const SeatIdSchema = z.string().regex(/^[A-J](10|[1-9])$/, 'Invalid Seat ID format (e.g. A1, B10)');


interface SeatRequest {
  seatId: string;
}

export const setupSocketHandlers = (io: Server) => {
  // --- Middleware: Simple Authentication ---
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    // Mock Auth: Accept any token for now, or use a default if missing for PoC compatibility
    // In production: verify(token, SECRET)
    if (!token) {
      // For now, let's allow "Guest" for the UI demo to keep working without frontend auth changes yet
      // But strict Phase 1 requires identifying the issue.
      // Let's generate a user ID on backend if not provided, preventing spoofing from client body.
      socket.data.userId = `user_${socket.id.substring(0, 6)}`;
      return next();
    }
    socket.data.userId = `user_${token}`; // Mock ID
    next();
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId; // Trust backend-generated ID, not client payload
    console.log(`🔌 Client connected: ${socket.id} (User: ${userId})`);

    /**
     * 1. Join Room & Initial State
     */
    socket.on('join_room', async (roomName: string) => {
      socket.join(roomName);

      const currentLocks = await getAllLockedSeats();
      socket.emit('current_state', currentLocks);
    });

    socket.on('whoami', () => {
      socket.emit('your_identity', socket.data.userId);
    });

    /**
     * 2. Request Seat Lock
     */
    socket.on('request_seat', async (data: SeatRequest) => {
      const { seatId } = data; // We ignore userId from body! Use socket.data.userId

      // Validation
      const validation = SeatIdSchema.safeParse(seatId);
      if (!validation.success) {
        socket.emit('error', { message: validation.error.issues[0].message });
        return;
      }

      console.log(`🔒 Request Lock: ${seatId} by ${userId}`);

      const success = await atomicLockSeat(seatId, userId);

      if (success) {
        const room = 'cinema_1';
        io.to(room).emit('seat_locked', { seatId, userId });
        await redisClient.sadd(`socket_locks:${socket.id}`, seatId);
      } else {
        socket.emit('error', { message: `Seat ${seatId} is already taken.` });
      }
    });

    /**
     * 3. Release Seat
     */
    socket.on('release_seat', async (data: SeatRequest) => {
      const { seatId } = data;

      // Validation
      if (!SeatIdSchema.safeParse(seatId).success) return;

      const success = await atomicReleaseSeat(seatId, userId);

      if (success) {
        io.to('cinema_1').emit('seat_released', { seatId });
        await redisClient.srem(`socket_locks:${socket.id}`, seatId);
      }
    });

    /**
     * 4. Disconnect Handler
     */
    socket.on('disconnect', async () => {
      console.log(`❌ Disconnected: ${socket.id}`);

      const socketLockKey = `socket_locks:${socket.id}`;
      const seatsLockedBySocket = await redisClient.smembers(socketLockKey);

      if (seatsLockedBySocket.length > 0) {
        console.log(`🧹 Cleaning up ${seatsLockedBySocket.length} seats for ${socket.id}`);

        // We also need to remove from the Index!
        // Our bulk cleaner needs to do both DEL and SREM
        const indexKey = 'index:locked_seats';

        const pipeline = redisClient.pipeline();

        seatsLockedBySocket.forEach((seatId) => {
          pipeline.del(`seat:${seatId}`);
          pipeline.srem(indexKey, seatId); // Remove from index
          io.to('cinema_1').emit('seat_released', { seatId });
        });

        pipeline.del(socketLockKey);

        await pipeline.exec();
      }
    });
  });
};
