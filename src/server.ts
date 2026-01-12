import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import dotenv from 'dotenv';
import cors from 'cors';
import { pubClient, subClient } from './redis/client';
import { setupSocketHandlers } from './socket/handlers';
import { logger } from './utils/logger';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.static('public')); // Serve the simple frontend

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

// Implement Redis Adapter for Horizontal Scaling
Promise.all([pubClient.ping(), subClient.ping()])
  .then(() => {
    io.adapter(createAdapter(pubClient, subClient));
    logger.info('✅ Socket.io Redis Adapter Configured');
  })
  .catch((err) => {
    logger.error('❌ Failed to connect Redis Adapter clients', err);
  });

// Setup Business Logic Handlers
setupSocketHandlers(io);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  logger.info(`🚀 Live Seat Map Engine running on port ${PORT}`);
  logger.info(`👉 Test at: http://localhost:${PORT}`);
});
