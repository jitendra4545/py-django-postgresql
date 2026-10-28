import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { env } from './config/env.js';
import authRouter from './modules/auth.js';
import catalogRouter from './modules/catalog.js';
import bookingRouter from './modules/bookings.js';
import clientRouter from './modules/client.js';
import agentRouter from './modules/agency-agent.js';
import chauffeurRouter from './modules/chauffeur.js';
import communicationRouter from './modules/communication.js';
import telnyxWebhookRouter from './modules/telnyx-webhook.js';
import paymentRouter from './modules/payments.js';
import operationsRouter from './modules/operations.js';
import notificationRouter from './modules/notifications.js';
import documentRouter from './modules/documents.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createApiAuditMiddleware } from './middleware/api-audit.js';
import { enqueueApiAuditLog } from './services/api-audit-log.js';

const openapi = JSON.parse(readFileSync(new URL('../docs/openapi.json', import.meta.url), 'utf8'));
const publicDirectory = fileURLToPath(new URL('../public', import.meta.url));
const resetPasswordPage = fileURLToPath(new URL('../public/reset-password.html', import.meta.url));
const app = express();

// DigitalOcean App Platform forwards public requests through one trusted proxy hop. This lets
// Express and express-rate-limit use the real client IP from X-Forwarded-For.
app.set('trust proxy', 1);
app.disable('x-powered-by');
// Register before body parsers and routers: captures 401/422/429/500/304 without
// affecting request bodies, Stripe/Telnyx raw signatures, or normal responses.
if (env.API_AUDIT_LOG_ENABLED) {
  app.use(
    createApiAuditMiddleware({
      enqueue: enqueueApiAuditLog,
      apiPrefix: env.API_PREFIX,
      maxPayloadBytes: env.API_AUDIT_LOG_MAX_BODY_BYTES,
    }),
  );
}
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(cors({ origin: env.corsOrigins, credentials: true }));
app.use(compression());
app.use(
  express.json({
    limit: '1mb',
    verify: (request, _response, buffer) => {
      const routePath = request.originalUrl.split('?')[0];
      if (
        routePath.endsWith('/payments/webhook') ||
        routePath.endsWith('/communication/telnyx/webhook')
      )
        request.rawBody = buffer;
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (_request, response) => response.json({ status: 'ok', version: '2.3.0' }));
app.use(
  '/reset-assets',
  express.static(publicDirectory, {
    dotfiles: 'deny',
    index: false,
    maxAge: env.NODE_ENV === 'production' ? '1d' : 0,
  }),
);
app.get('/reset-password', (_request, response) => {
  response.set({
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
  });
  response.sendFile(resetPasswordPage);
});
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.get('/openapi.json', (_request, response) => response.json(openapi));

app.use(`${env.API_PREFIX}/auth`, rateLimit({ windowMs: 15 * 60_000, limit: 50 }), authRouter);
app.use(`${env.API_PREFIX}/catalog`, catalogRouter);
app.use(`${env.API_PREFIX}/bookings`, bookingRouter);
app.use(`${env.API_PREFIX}/client`, clientRouter);
app.use(`${env.API_PREFIX}/agent`, agentRouter);
app.use(`${env.API_PREFIX}/chauffeur`, chauffeurRouter);
app.use(`${env.API_PREFIX}/communication/telnyx`, telnyxWebhookRouter);
app.use(`${env.API_PREFIX}/communication`, communicationRouter);
app.use(`${env.API_PREFIX}/payments`, paymentRouter);
app.use(`${env.API_PREFIX}/operations`, operationsRouter);
app.use(`${env.API_PREFIX}/notifications`, notificationRouter);
app.use(`${env.API_PREFIX}/documents`, documentRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
