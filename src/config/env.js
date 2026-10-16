import 'dotenv/config';
import { z } from 'zod';

const bool = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

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
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
  GOOGLE_CLIENT_IDS: z.string().default(''),
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
  PAYMENT_PROVIDER: z.enum(['mock', 'stripe']).default('mock'),
  STRIPE_SECRET_KEY: z.string().default(''),
  STRIPE_PUBLISHABLE_KEY: z.string().default(''),
  STRIPE_WEBHOOK_SECRET: z.string().default(''),
  MASKED_CALL_PROVIDER: z.enum(['mock']).default('mock'),
  UPLOAD_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(25).default(10),
  AWS_REGION: z.string().default(''),
  AWS_S3_BUCKET: z.string().default(''),
  AWS_ACCESS_KEY_ID: z.string().default(''),
  AWS_SECRET_ACCESS_KEY: z.string().default(''),
  REDIS_URL: z.string().default(''),
  EXPO_ACCESS_TOKEN: z.string().default(''),
  LOG_LEVEL: z.string().default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
}

if (parsed.data.NODE_ENV === 'production' && parsed.data.PAYMENT_PROVIDER === 'mock') {
  throw new Error('PAYMENT_PROVIDER=mock is not allowed in production');
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
if (
  parsed.data.PAYMENT_PROVIDER === 'stripe' &&
  (!parsed.data.STRIPE_SECRET_KEY || !parsed.data.STRIPE_WEBHOOK_SECRET)
) {
  throw new Error('STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are required for Stripe');
}
if (parsed.data.UPLOAD_DRIVER === 's3' && (!parsed.data.AWS_REGION || !parsed.data.AWS_S3_BUCKET)) {
  throw new Error('AWS_REGION and AWS_S3_BUCKET are required for S3 uploads');
}

export const env = {
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((item) => item.trim()),
  googleClientIds: parsed.data.GOOGLE_CLIENT_IDS.split(',')
    .map((item) => item.trim())
    .filter(Boolean),
};
