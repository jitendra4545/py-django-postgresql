import http from 'node:http';
import { Server } from 'socket.io';
import app from './app.js';
import { env } from './config/env.js';
import { registerSocketServer } from './services/realtime.js';

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: env.corsOrigins, credentials: true } });
registerSocketServer(io);

server.listen(env.PORT, () => {
  console.log(`Drive Luxury API listening on port ${env.PORT}`);
});

const shutdown = (signal) => {
  console.log(`${signal} received; closing server`);
  server.close(() => process.exit(0));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
