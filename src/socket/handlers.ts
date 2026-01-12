import { Server } from 'socket.io';
import { SeatController } from '../controllers/SeatController';
import { logger } from '../utils/logger';

export const setupSocketHandlers = (io: Server) => {
  const seatController = new SeatController(io);

  // --- Middleware: Simple Authentication ---
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      socket.data.userId = `user_${socket.id.substring(0, 6)}`;
      return next();
    }
    socket.data.userId = `user_${token}`;
    next();
  });

  io.on('connection', (socket) => {
    seatController.handleConnection(socket);
  });
};
