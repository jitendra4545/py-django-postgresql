import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const signAccessToken = (user) =>
  jwt.sign({ sub: user.id, role: user.role }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL,
    issuer: 'drive-luxury-api',
    audience: 'drive-luxury-mobile',
  });

export const verifyAccessToken = (token) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, {
    issuer: 'drive-luxury-api',
    audience: 'drive-luxury-mobile',
  });

export const signRefreshToken = (sessionId, userId) =>
  jwt.sign({ sub: userId, sid: sessionId }, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.JWT_REFRESH_TTL_DAYS}d`,
    issuer: 'drive-luxury-api',
    audience: 'drive-luxury-refresh',
  });

export const verifyRefreshToken = (token) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET, {
    issuer: 'drive-luxury-api',
    audience: 'drive-luxury-refresh',
  });

export const tokenHash = (value) => crypto.createHash('sha256').update(value).digest('hex');

export const randomToken = () => crypto.randomBytes(32).toString('hex');
