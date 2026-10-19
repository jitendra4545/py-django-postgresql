import http from 'node:http';
import { setInterval, clearInterval } from 'node:timers';
import { Server } from 'socket.io';
import app from './app.js';
import { env } from './config/env.js';
import { registerSocketServer } from './services/realtime.js';
import { sweepExpiredPaymentHolds } from './services/payment-holds.js';

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: env.corsOrigins, credentials: true },
  connectionStateRecovery: { maxDisconnectionDuration: 120_000, skipMiddlewares: false },
  pingInterval: 25_000,
  pingTimeout: 20_000,
});
registerSocketServer(io);

server.listen(env.PORT, '0.0.0.0', () => {
  console.log(`Drive Luxury API listening on port ${env.PORT}`);
});

// Idempotent database checks permit several API replicas. Stripe intents are
// cancelled before their unpaid vehicle hold is released.
const sweepTimer = setInterval(() => {
  sweepExpiredPaymentHolds().catch((error) =>
    console.error('Payment hold sweep failed', { code: error.code }),
  );
}, 60_000);

const shutdown = (signal) => {
  clearInterval(sweepTimer);
  console.log(`${signal} received; closing server`);
  server.close(() => process.exit(0));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
