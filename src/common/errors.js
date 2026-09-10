import { ZodError } from 'zod';
import { logger } from './logger.js';
export class AppError extends Error {
    statusCode;
    code;
    details;
    constructor(statusCode, code, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}
export const badRequest = (code, message, details) => new AppError(400, code, message, details);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message);
export const forbidden = (message = 'You are not allowed to access this resource') => new AppError(403, 'FORBIDDEN', message);
export const notFound = (resource = 'Resource') => new AppError(404, 'NOT_FOUND', `${resource} not found`);
export const conflict = (code, message) => new AppError(409, code, message);
export function notFoundHandler(req, _res, next) {
    next(new AppError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} not found`));
}
export function errorHandler(err, req, res, _next) {
    if (err instanceof ZodError) {
        return res.status(422).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: err.flatten() } });
    }
    if (err instanceof AppError) {
        return res.status(err.statusCode).json({ success: false, error: { code: err.code, message: err.message, details: err.details } });
    }
    logger.error({ err, method: req.method, path: req.path }, 'Unhandled request error');
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_SERVER_ERROR', message: 'Unexpected server error' } });
}
