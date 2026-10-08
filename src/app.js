import compression from 'compression';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { readFileSync } from 'node:fs';
import { URL } from 'node:url';
import { env } from './config/env.js';
import authRouter from './modules/auth.js';
import catalogRouter from './modules/catalog.js';
import bookingRouter from './modules/bookings.js';
import clientRouter from './modules/client.js';
import agentRouter from './modules/agency-agent.js';
import chauffeurRouter from './modules/chauffeur.js';
import communicationRouter from './modules/communication.js';
import paymentRouter from './modules/payments.js';
import operationsRouter from './modules/operations.js';
import notificationRouter from './modules/notifications.js';
import documentRouter from './modules/documents.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';

const openapi = JSON.parse(readFileSync(new URL('../docs/openapi.json', import.meta.url), 'utf8'));
const app = express();

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(cors({ origin: env.corsOrigins, credentials: true }));
app.use(compression());
app.use(
  express.json({
    limit: '1mb',
    verify: (request, _response, buffer) => {
      if (request.originalUrl.endsWith('/payments/webhook')) request.rawBody = buffer;
    },
  }),
);
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: true, legacyHeaders: false }));

app.get('/health', (_request, response) => response.json({ status: 'ok', version: '2.0.0' }));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.get('/openapi.json', (_request, response) => response.json(openapi));

app.use(`${env.API_PREFIX}/auth`, rateLimit({ windowMs: 15 * 60_000, limit: 50 }), authRouter);
app.use(`${env.API_PREFIX}/catalog`, catalogRouter);
app.use(`${env.API_PREFIX}/bookings`, bookingRouter);
app.use(`${env.API_PREFIX}/client`, clientRouter);
app.use(`${env.API_PREFIX}/agent`, agentRouter);
app.use(`${env.API_PREFIX}/chauffeur`, chauffeurRouter);
app.use(`${env.API_PREFIX}/communication`, communicationRouter);
app.use(`${env.API_PREFIX}/payments`, paymentRouter);
app.use(`${env.API_PREFIX}/operations`, operationsRouter);
app.use(`${env.API_PREFIX}/notifications`, notificationRouter);
app.use(`${env.API_PREFIX}/documents`, documentRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
