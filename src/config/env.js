import 'dotenv/config';
import { URL } from 'node:url';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

const sqlIdentifier = z.string().regex(/^[A-Za-z0-9_]+$/, 'must be a simple SQL identifier');

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('/api/v1'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('drive_luxury'),
  DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(10),
  DB_SSL: bool,
  DB_SSL_CA_PATH: z.string().default(''),
  DB_SSL_CA_BASE64: z.string().default(''),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  GOOGLE_CLIENT_IDS: z.string().default(''),
  GOOGLE_PLACES_API_KEY: z.string().default(''),
  GOOGLE_ROUTES_API_KEY: z.string().default(''),
  GOOGLE_ROUTES_ENABLED: bool,
  ALLOW_UNVERIFIED_DISTANCE: bool,
  EMAIL_PROVIDER: z.enum(['disabled', 'smtp']).default('disabled'),
  MAIL_HOST: z.string().default(''),
  MAIL_PORT: z.coerce.number().int().positive().default(587),
  MAIL_ENCRYPTION: z.enum(['tls', 'ssl', 'none']).default('tls'),
  MAIL_USERNAME: z.string().default(''),
  MAIL_PASSWORD: z.string().default(''),
  MAIL_FROM_ADDRESS: z.union([z.literal(''), z.string().email()]).default(''),
  MAIL_FROM_NAME: z.string().default('Drive Luxury'),
  MAIL_REPLY_TO: z.union([z.literal(''), z.string().email()]).default(''),
  PASSWORD_RESET_URL: z.string().min(1).default('http://localhost:5173/reset-password'),
  INVITATION_ACCEPT_URL: z.string().min(1).default('driveluxury://invitation'),
  PAYMENT_PROVIDER: z.enum(['mock', 'stripe']).default('mock'),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_PUBLISHABLE_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  // Proxy must be an approved HTTPS tunnel; never change Stripe's API host.
  STRIPE_PROXY_URL: z
    .union([
      z.literal(''),
      z
        .string()
        .url()
        .refine(
          (value) => ['http:', 'https:'].includes(new URL(value).protocol),
          'Must use an http(s) proxy URL',
        ),
    ])
    .default(''),
  STRIPE_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(12000),
  STRIPE_MAX_NETWORK_RETRIES: z.coerce.number().int().min(0).max(3).default(1),
  MASKED_CALL_PROVIDER: z
    .string()
    .regex(/^[a-z0-9_-]+$/)
    .default('disabled'),
  MASKED_CALL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(600),
  TELNYX_API_KEY: z.string().default(''),
  TELNYX_CONNECTION_ID: z.string().default(''),
  TELNYX_MASKED_NUMBER: z.string().default(''),
  TELNYX_PUBLIC_KEY: z.string().default(''),
  TELNYX_ALLOWED_DESTINATIONS: z.string().default(''),
  SUPPORT_PHONE: z.string().default(''),
  GPS_MIN_INTERVAL_SECONDS: z.coerce.number().int().min(1).max(300).default(5),
  GPS_STALE_AFTER_SECONDS: z.coerce.number().int().min(10).max(3600).default(45),
  UPLOAD_DRIVER: z.enum(['local', 'spaces']).default('local'),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(25).default(10),
  DO_SPACES_KEY: z.string().default(''),
  DO_SPACES_SECRET: z.string().default(''),
  DO_SPACES_REGION: z.string().default(''),
  DO_SPACES_BUCKET: z.string().default(''),
  DO_SPACES_ENDPOINT: z.string().default(''),
  DO_SPACES_CDN_ENDPOINT: z.string().default(''),
  DO_SPACES_PUBLIC_ROOT: z.string().default('images'),
  DO_SPACES_PRIVATE_ROOT: z.string().default('private'),
  MEDIA_CDN_ENABLED: bool,
  INVOICE_ADAPTER: z.enum(['disabled', 'legacy']).default('disabled'),
  LEGACY_INVOICE_TABLE: sqlIdentifier.default('reservation_invoices'),
  LEGACY_INVOICE_RESERVATION_COLUMN: sqlIdentifier.default('reservation_id'),
  LEGACY_PAID_PAYMENT_STATUS: z.coerce.number().int().nonnegative().default(20),
  REDIS_URL: z.string().default(''),
  EXPO_ACCESS_TOKEN: z.string().default(''),
  EXPO_NOTIFICATION_TEST_ENABLED: bool.default('false'),
  EXPO_PUSH_WORKER_ENABLED: bool.default('true'),
  EXPO_PUSH_WORKER_INTERVAL_SECONDS: z.coerce.number().int().min(5).max(300).default(10),
  EXPO_PUSH_RECEIPT_INTERVAL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

if (parsed.data.NODE_ENV === 'production' && parsed.data.PAYMENT_PROVIDER === 'mock') {
  throw new Error('PAYMENT_PROVIDER=mock is not allowed in production');
}
if (parsed.data.NODE_ENV === 'production' && parsed.data.ALLOW_UNVERIFIED_DISTANCE) {
  throw new Error('ALLOW_UNVERIFIED_DISTANCE cannot be used in production');
}
if (
  parsed.data.GOOGLE_ROUTES_ENABLED &&
  !parsed.data.GOOGLE_ROUTES_API_KEY &&
  !parsed.data.GOOGLE_PLACES_API_KEY
) {
  throw new Error('GOOGLE_ROUTES_ENABLED requires a Google Maps API key with Routes API enabled');
}
if (parsed.data.MASKED_CALL_PROVIDER === 'telnyx') {
  if (
    !parsed.data.TELNYX_API_KEY ||
    !parsed.data.TELNYX_CONNECTION_ID ||
    !parsed.data.TELNYX_PUBLIC_KEY ||
    !/^\+[1-9]\d{7,14}$/.test(parsed.data.TELNYX_MASKED_NUMBER)
  ) {
    throw new Error(
      'Telnyx masked calling requires an API key, Voice API connection, owned E.164 phone number and webhook signing public key',
    );
  }
}
if (parsed.data.NODE_ENV === 'production' && parsed.data.MASKED_CALL_PROVIDER === 'mock') {
  throw new Error('MASKED_CALL_PROVIDER=mock is not allowed in production');
}
if (parsed.data.NODE_ENV === 'production' && !parsed.data.GOOGLE_CLIENT_IDS.trim()) {
  throw new Error('GOOGLE_CLIENT_IDS is required in production');
}
if (parsed.data.NODE_ENV === 'production' && parsed.data.EMAIL_PROVIDER !== 'smtp') {
  throw new Error('EMAIL_PROVIDER=smtp is required in production');
}
if (
  parsed.data.EMAIL_PROVIDER === 'smtp' &&
  (!parsed.data.MAIL_HOST ||
    !parsed.data.MAIL_USERNAME ||
    !parsed.data.MAIL_PASSWORD ||
    !parsed.data.MAIL_FROM_ADDRESS)
) {
  throw new Error(
    'MAIL_HOST, MAIL_USERNAME, MAIL_PASSWORD and MAIL_FROM_ADDRESS are required for SMTP email',
  );
}
if (parsed.data.PAYMENT_PROVIDER === 'stripe') {
  const {
    STRIPE_SECRET_KEY: secret,
    STRIPE_PUBLISHABLE_KEY: publishable,
    STRIPE_WEBHOOK_SECRET: webhook,
  } = parsed.data;
  if (
    !/^sk_(test|live)_/.test(secret) ||
    !/^pk_(test|live)_/.test(publishable) ||
    !webhook.startsWith('whsec_') ||
    secret.includes('replace_me') ||
    publishable.includes('replace_me') ||
    webhook.includes('replace_me')
  ) {
    throw new Error(
      'PAYMENT_PROVIDER=stripe requires real Stripe secret (sk_), publishable (pk_), and webhook (whsec_) keys',
    );
  }
  if (secret.startsWith('sk_test_') !== publishable.startsWith('pk_test_')) {
    throw new Error(
      'Stripe publishable and secret keys must both use test mode or both use live mode',
    );
  }
}
if (
  parsed.data.UPLOAD_DRIVER === 'spaces' &&
  (!parsed.data.DO_SPACES_KEY ||
    !parsed.data.DO_SPACES_SECRET ||
    !parsed.data.DO_SPACES_REGION ||
    !parsed.data.DO_SPACES_BUCKET ||
    !parsed.data.DO_SPACES_ENDPOINT)
) {
  throw new Error(
    'DO_SPACES_KEY, DO_SPACES_SECRET, DO_SPACES_REGION, DO_SPACES_BUCKET and DO_SPACES_ENDPOINT are required for DigitalOcean Spaces uploads',
  );
}
if (
  parsed.data.UPLOAD_DRIVER === 'spaces' &&
  parsed.data.MEDIA_CDN_ENABLED &&
  !parsed.data.DO_SPACES_CDN_ENDPOINT
) {
  throw new Error('DO_SPACES_CDN_ENDPOINT is required when MEDIA_CDN_ENABLED=true');
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((item) => item.trim()),
  googleClientIds: parsed.data.GOOGLE_CLIENT_IDS.split(',')
    .map((item) => item.trim())
    .filter(Boolean),
};
