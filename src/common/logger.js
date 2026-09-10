import winston from 'winston';
import { env } from '../config/env.js';
const redact = (value) => {
    if (!value || typeof value !== 'object')
        return value;
    if (value instanceof Error) {
        return { name: value.name, message: value.message, stack: value.stack };
    }
    if (Array.isArray(value))
        return value.map(redact);
    const hidden = new Set(['password', 'token', 'refreshToken', 'authorization', 'cardNumber', 'cvv', 'cvc']);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
        key,
        hidden.has(key) ? '[REDACTED]' : redact(item)
    ]));
};
const base = winston.createLogger({
    level: env.LOG_LEVEL,
    levels: winston.config.npm.levels,
    format: winston.format.combine(winston.format.timestamp(), winston.format.errors({ stack: true }), env.NODE_ENV === 'production' ? winston.format.json() : winston.format.combine(winston.format.colorize(), winston.format.simple())),
    transports: [new winston.transports.Console()]
});
function write(level, metaOrMessage, maybeMessage) {
    if (typeof metaOrMessage === 'string' && maybeMessage === undefined) {
        base.log(level, metaOrMessage);
        return;
    }
    const message = maybeMessage ?? 'Log event';
    base.log(level, message, { meta: redact(metaOrMessage) });
}
export const logger = {
    debug: (metaOrMessage, message) => write('debug', metaOrMessage, message),
    info: (metaOrMessage, message) => write('info', metaOrMessage, message),
    warn: (metaOrMessage, message) => write('warn', metaOrMessage, message),
    error: (metaOrMessage, message) => write('error', metaOrMessage, message),
    fatal: (metaOrMessage, message) => write('error', metaOrMessage, message),
    http: (message, meta) => base.http(message, { meta: redact(meta) })
};
