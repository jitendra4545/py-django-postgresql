import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { LegacyRole, roleName } from './legacy.js';
import { unauthorized, forbidden } from './errors.js';
import { one } from '../db/pool.js';
export function signAccessToken(userId, role) {
    return jwt.sign({ sub: String(userId), role, type: 'access' }, env.JWT_ACCESS_SECRET, {
        expiresIn: env.JWT_ACCESS_TTL
    });
}
export function signRefreshToken(userId, role) {
    return jwt.sign({ sub: String(userId), role, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
        expiresIn: `${env.JWT_REFRESH_TTL_DAYS}d`
    });
}
export function verifyRefreshToken(token) {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET);
    if (payload.type !== 'refresh')
        throw unauthorized('Invalid refresh token');
    return payload;
}
async function hydrate(userId, role) {
    const context = { userId, role: role, roleName: roleName(role) };
    if (role === LegacyRole.CUSTOMER) {
        const row = await one('SELECT id FROM customers WHERE user_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', [userId]);
        if (row)
            context.customerId = row.id;
    }
    if (role === LegacyRole.DRIVER) {
        const row = await one('SELECT id FROM drivers WHERE user_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', [userId]);
        if (row)
            context.driverId = row.id;
    }
    if (role === LegacyRole.AGENT) {
        const row = await one('SELECT id FROM agents WHERE user_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', [userId]);
        if (row)
            context.agentId = row.id;
    }
    return context;
}
export async function requireAuth(req, _res, next) {
    try {
        const auth = req.headers.authorization;
        if (!auth?.startsWith('Bearer '))
            throw unauthorized();
        const token = auth.slice(7);
        const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
        if (payload.type !== 'access')
            throw unauthorized('Invalid access token');
        req.auth = await hydrate(Number(payload.sub), payload.role);
        next();
    }
    catch (error) {
        if (error instanceof Error && error.name === 'TokenExpiredError')
            return next(unauthorized('Access token expired'));
        if (error instanceof Error && error.name === 'JsonWebTokenError')
            return next(unauthorized('Invalid access token'));
        next(error);
    }
}
export const requireRoles = (...roles) => (req, _res, next) => {
    if (!req.auth)
        return next(unauthorized());
    if (!roles.includes(req.auth.role))
        return next(forbidden());
    next();
};
