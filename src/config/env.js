import 'dotenv/config';
import { z } from 'zod';
const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    API_PREFIX: z.string().default('/api/v1'),
    APP_URL: z.string().default('http://localhost:4000'),
    CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),
    LOG_LEVEL: z.string().default('info'),
    DB_HOST: z.string().default('127.0.0.1'),
    DB_PORT: z.coerce.number().int().positive().default(3306),
    DB_USER: z.string().default('root'),
    DB_PASSWORD: z.string().default(''),
    DB_NAME: z.string().default('drive_luxury'),
    DB_CONNECTION_LIMIT: z.coerce.number().int().positive().default(20),
    REDIS_URL: z.string().default('redis://127.0.0.1:6379'),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),
    DEFAULT_COUNTRY_ID: z.coerce.number().int().positive().default(1),
    DEFAULT_CURRENCY: z.string().default('EUR'),
    LEGACY_NEW_USER_STATUS: z.coerce.number().int().default(0),
    ENFORCE_LEGACY_USER_STATUS: z.string().default('false').transform((v) => v === 'true'),
    AUTO_CONFIRM_BOOKINGS: z.string().default('false').transform((v) => v === 'true'),
    ALLOW_BACKOFFICE_TEST_API: z.string().default('true').transform((v) => v === 'true'),
    SERVICE_TYPE_CHAUFFEUR: z.coerce.number().int().default(1),
    SERVICE_TYPE_CAR_RENTAL: z.coerce.number().int().default(2),
    SERVICE_TYPE_TRANSFER: z.coerce.number().int().default(3),
    PAYMENT_PROVIDER: z.enum(['mock']).default('mock'),
    MASKED_CALL_PROVIDER: z.enum(['mock']).default('mock'),
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    UPLOAD_DIR: z.string().default('uploads'),
    AWS_REGION: z.string().optional().default(''),
    AWS_S3_BUCKET: z.string().optional().default(''),
    AWS_ACCESS_KEY_ID: z.string().optional().default(''),
    AWS_SECRET_ACCESS_KEY: z.string().optional().default(''),
    GOOGLE_CLIENT_ID: z.string().optional().default(''),
    FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional().default(''),
    TEST_ADMIN_EMAIL: z.string().email().default('admin.mobile@drive-luxury.local'),
    TEST_ADMIN_PASSWORD: z.string().default('Admin123!'),
    TEST_DRIVER_EMAIL: z.string().email().default('driver.mobile@drive-luxury.local'),
    TEST_DRIVER_PASSWORD: z.string().default('Driver123!'),
    TEST_AGENT_EMAIL: z.string().email().default('agent.mobile@drive-luxury.local'),
    TEST_AGENT_PASSWORD: z.string().default('Agent123!')
});
const parsed = schema.safeParse(process.env);
if (!parsed.success) {
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
}
export const env = parsed.data;
export const corsOrigins = env.CORS_ORIGINS.split(',').map((x) => x.trim()).filter(Boolean);
