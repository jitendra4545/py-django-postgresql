import { verifyAccessToken } from './tokens.js';
import { one } from '../db/pool.js';

let socketServer = null;

export const registerSocketServer = (io) => {
  socketServer = io;
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = verifyAccessToken(token);
      const user = await one(
        'SELECT id, role FROM users WHERE id = ? AND status = 0 AND deleted_at IS NULL',
        [payload.sub],
      );
      if (!user || Number(user.role) !== Number(payload.role))
        return next(new Error('unauthorized'));
      socket.data.user = user;
      return next();
    } catch {
      return next(new Error('unauthorized'));
    }
  });
  io.on('connection', (socket) => {
    socket.join(`user:${socket.data.user.id}`);
    socket.on('conversation.join', async (conversationId, acknowledge = () => {}) => {
      try {
        const participant = await one(
          `SELECT id FROM app_conversation_participants
            WHERE conversation_id = ? AND user_id = ? AND left_at IS NULL`,
          [conversationId, socket.data.user.id],
        );
        if (!participant && ![1, 2].includes(Number(socket.data.user.role))) {
          return acknowledge({ ok: false, error: 'forbidden' });
        }
        await socket.join(`conversation:${conversationId}`);
        return acknowledge({ ok: true });
      } catch {
        return acknowledge({ ok: false, error: 'internal_error' });
      }
    });
  });
};

export const emitToUser = (userId, event, payload) =>
  socketServer?.to(`user:${userId}`).emit(event, payload);

export const emitToConversation = (conversationId, event, payload) =>
  socketServer?.to(`conversation:${conversationId}`).emit(event, payload);
