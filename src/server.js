import http from 'node:http';
import { setInterval, clearInterval } from 'node:timers';
import { Server } from 'socket.io';
import app from './app.js';
import { env } from './config/env.js';
import { registerSocketServer } from './services/realtime.js';
import { sweepExpiredPaymentHolds } from './services/payment-holds.js';
import { checkPushReceipts, processPushJobs } from './services/notification-worker.js';
import { startApiAuditLogWriter, stopApiAuditLogWriter } from './services/api-audit-log.js';

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: env.corsOrigins, credentials: true },
  connectionStateRecovery: { maxDisconnectionDuration: 120_000, skipMiddlewares: false },
  pingInterval: 25_000,
  pingTimeout: 20_000,
});
registerSocketServer(io);
startApiAuditLogWriter();

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

// Work from the database-backed outbox so multiple API replicas may run safely.
// Push receipts are checked separately after Expo has had time to deliver.
const deliveryTimer = env.EXPO_PUSH_WORKER_ENABLED
  ? setInterval(() => {
      processPushJobs().catch((error) =>
        console.error('Push delivery worker failed', { code: error.code }),
      );
    }, env.EXPO_PUSH_WORKER_INTERVAL_SECONDS * 1000)
  : null;
const receiptTimer = env.EXPO_PUSH_WORKER_ENABLED
  ? setInterval(() => {
      checkPushReceipts().catch((error) =>
        console.error('Push receipt worker failed', { code: error.code }),
      );
    }, env.EXPO_PUSH_RECEIPT_INTERVAL_SECONDS * 1000)
  : null;

const shutdown = (signal) => {
  clearInterval(sweepTimer);
  if (deliveryTimer) clearInterval(deliveryTimer);
  if (receiptTimer) clearInterval(receiptTimer);
  console.log(`${signal} received; closing server`);
  server.close(async () => {
    try {
      await stopApiAuditLogWriter();
    } catch (error) {
      console.warn('API audit shutdown flush failed', { code: error?.code });
    }
    process.exit(0);
  });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
