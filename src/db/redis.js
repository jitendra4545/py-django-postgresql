import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../common/logger.js';
export const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true
});
let attempted = false;
redis.on('error', (error) => logger.debug({ error }, 'Redis unavailable; continuing without cache'));
async function ensureConnected() {
    if (redis.status === 'ready')
        return true;
    if (attempted && ['end', 'close'].includes(redis.status))
        return false;
    attempted = true;
    try {
        if (redis.status === 'wait')
            await redis.connect();
        return redis.status === 'ready';
    }
    catch {
        return false;
    }
}
export async function cacheGet(key) {
    if (!(await ensureConnected()))
        return null;
    try {
        const value = await redis.get(key);
        return value ? JSON.parse(value) : null;
    }
    catch {
        return null;
    }
}
export async function cacheSet(key, value, ttlSeconds = 60) {
    if (!(await ensureConnected()))
        return;
    try {
        await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    }
    catch {
        // Cache failure must not break booking operations.
    }
}
export async function cacheDeleteByPrefix(prefix) {
    if (!(await ensureConnected()))
        return;
    let cursor = '0';
    do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
        cursor = next;
        if (keys.length)
            await redis.del(...keys);
    } while (cursor !== '0');
}
