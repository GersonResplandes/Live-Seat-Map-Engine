import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import dotenv from 'dotenv';
import cors from 'cors';
import { pubClient, subClient } from './redis/client';
import { setupSocketHandlers } from './socket/handlers';
import { env } from './config/env';

// ... imports

// dotenv.config(); // Removed, handled in env.ts

const app = express();
// ...

const server = http.createServer(app);

// ...

// Setup Business Logic Handlers
setupSocketHandlers(io);

const PORT = parseInt(env.PORT, 10);

server.listen(PORT, () => {
  logger.info(`🚀 Live Seat Map Engine running on port ${PORT}`);
  logger.info(`👉 Test at: http://localhost:${PORT}`);
});
