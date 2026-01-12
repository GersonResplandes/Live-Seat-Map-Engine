import { Server, Socket } from 'socket.io';
import { atomicLockSeat, atomicReleaseSeat, getAllLockedSeats, redisClient } from '../redis/client';

interface SeatRequest {
  seatId: string;
  userId: string;
}

export const setupSocketHandlers = (io: Server) => {
  io.on('connection', (socket: Socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    /**
     * 1. Join Room & Initial State
     * Client asks to join the "cinema" room to get updates.
     * Server sends back all currently locked seats.
     */
    socket.on('join_room', async (roomName: string) => {
      socket.join(roomName);
      console.log(`Socket ${socket.id} joined ${roomName}`);

      // Send current state just to this socket
      const currentLocks = await getAllLockedSeats();
      socket.emit('current_state', currentLocks);
    });

    /**
     * 2. Request Seat Lock
     * Client attempts to book a seat.
     */
    socket.on('request_seat', async (data: SeatRequest) => {
      const { seatId, userId } = data;

      console.log(`🔒 Request Lock: ${seatId} by ${userId}`);

      // ATOMIC LOCK in Redis
      const success = await atomicLockSeat(seatId, userId);

      if (success) {
        // Determine which room (demo assumes single room 'cinema_1')
        const room = 'cinema_1';

        // 1. Broadcast to EVERYONE in the room (including sender)
        // that the seat is now red.
        io.to(room).emit('seat_locked', { seatId, userId });

        // 2. Map socket.id to this seat for auto-cleanup on disconnect
        // We use a Redis Set specific to this socket
        await redisClient.sadd(`socket_locks:${socket.id}`, seatId);
      } else {
        // Failed (Race Condition lost or already taken)
        socket.emit('error', { message: `Seat ${seatId} is already taken.` });
      }
    });

    /**
     * 3. Release Seat
     * User cancels selection or unclicks.
     */
    socket.on('release_seat', async (data: SeatRequest) => {
      const { seatId, userId } = data;

      const success = await atomicReleaseSeat(seatId, userId);

      if (success) {
        io.to('cinema_1').emit('seat_released', { seatId });
        // Remove from socket tracker
        await redisClient.srem(`socket_locks:${socket.id}`, seatId);
      }
    });

    /**
     * 4. Disconnect Handler (The "Garbage Collect")
     * If user closes connection, release their seats.
     */
    socket.on('disconnect', async () => {
      console.log(`❌ Disconnected: ${socket.id}`);

      // Get all seats locked by this specific socket connection
      const socketLockKey = `socket_locks:${socket.id}`;
      const seatsLockedBySocket = await redisClient.smembers(socketLockKey);

      if (seatsLockedBySocket.length > 0) {
        console.log(`🧹 Cleaning up ${seatsLockedBySocket.length} seats for ${socket.id}`);

        const pipeline = redisClient.pipeline();

        seatsLockedBySocket.forEach((seatId) => {
          // 1. Delete the seat lock key (seat:A1)
          // We can force delete since we know this socket owns it via the set
          pipeline.del(`seat:${seatId}`);

          // 2. Emit release to room
          io.to('cinema_1').emit('seat_released', { seatId });
        });

        // 3. Delete the tracking set
        pipeline.del(socketLockKey);

        await pipeline.exec();
      }
    });
  });
};
