import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env, corsOrigins } from '../config/env.js';
import { logger } from '../common/logger.js';
let io = null;
export function initSocket(server) {
    io = new Server(server, { cors: { origin: corsOrigins, credentials: true } });
    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token;
            if (!token)
                return next(new Error('Unauthorized'));
            const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
            if (payload.type !== 'access')
                return next(new Error('Unauthorized'));
            socket.data.userId = Number(payload.sub);
            return next();
        }
        catch {
            return next(new Error('Unauthorized'));
        }
    });
    io.on('connection', (socket) => {
        const userId = Number(socket.data.userId);
        socket.join(`user:${userId}`);
        logger.debug({ userId, socketId: socket.id }, 'Socket connected');
    });
    return io;
}
export function emitToUser(userId, event, payload) {
    io?.to(`user:${userId}`).emit(event, payload);
}
export function emitToReservation(reservationId, event, payload) {
    io?.to(`reservation:${reservationId}`).emit(event, payload);
}
