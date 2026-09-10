import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { requireAuth } from '../common/auth.js';
import { asyncHandler, ok, validate } from '../common/http.js';
import { forbidden, notFound } from '../common/errors.js';
import { exec, one, rows, transaction } from '../db/pool.js';
import { emitToUser } from '../realtime/socket.js';
import { maskedCallingProvider } from '../integrations/calling.js';
import { roleName } from '../common/legacy.js';
async function reservationParticipants(reservationId) {
    const base = await one(`SELECT c.user_id AS customer_user_id FROM reservations r LEFT JOIN customers c ON c.id=r.customer_id WHERE r.id=? AND r.deleted_at IS NULL`, [reservationId]);
    if (!base)
        throw notFound('Reservation');
    const users = new Set();
    if (base.customer_user_id)
        users.add(base.customer_user_id);
    const drivers = await rows(`SELECT DISTINCT d.user_id FROM reservation_drivers rd JOIN drivers d ON d.id IN (rd.pick_up_driver_id,rd.drop_off_driver_id) WHERE rd.reservation_id=? AND rd.deleted_at IS NULL AND rd.status=1`, [reservationId]);
    drivers.forEach((d) => users.add(d.user_id));
    const agents = await rows(`SELECT DISTINCT ag.user_id FROM rental_agent_assignments a JOIN agents ag ON ag.id=a.agent_id WHERE a.reservation_id=? AND a.status<>'CANCELLED'`, [reservationId]);
    agents.forEach((a) => users.add(a.user_id));
    return [...users];
}
async function canAccessReservation(userId, reservationId) {
    const participants = await reservationParticipants(reservationId);
    if (participants.includes(userId))
        return true;
    const staff = await one('SELECT role FROM users WHERE id=? AND deleted_at IS NULL', [userId]);
    return staff ? [1, 2].includes(staff.role) : false;
}
async function ensureConversation(reservationId, actorUserId) {
    if (!(await canAccessReservation(actorUserId, reservationId)))
        throw forbidden();
    let conversation = await one('SELECT id FROM conversations WHERE reservation_id=? ORDER BY created_at LIMIT 1', [reservationId]);
    if (!conversation) {
        const id = uuid();
        await exec('INSERT INTO conversations (id,reservation_id,created_at,updated_at) VALUES (?,?,NOW(),NOW())', [id, reservationId]);
        conversation = { id };
    }
    const participants = await reservationParticipants(reservationId);
    await transaction(async (conn) => {
        for (const userId of participants) {
            const user = await one('SELECT role FROM users WHERE id=?', [userId], conn);
            if (user)
                await exec('INSERT IGNORE INTO conversation_participants (conversation_id,user_id,role,joined_at) VALUES (?,?,?,NOW())', [conversation.id, userId, roleName(user.role)], conn);
        }
    });
    return conversation.id;
}
export const chatRouter = Router();
chatRouter.use(requireAuth);
chatRouter.post('/reservations/:id/conversation', asyncHandler(async (req, res) => {
    const reservationId = Number(req.params.id);
    const conversationId = await ensureConversation(reservationId, req.auth.userId);
    return ok(res, { conversationId, reservationId });
}));
chatRouter.get('/conversations/:id/messages', asyncHandler(async (req, res) => {
    const participant = await one('SELECT id FROM conversation_participants WHERE conversation_id=? AND user_id=?', [req.params.id, req.auth.userId]);
    if (!participant)
        throw forbidden();
    const data = await rows(`SELECT m.id,m.sender_user_id,u.full_name AS sender_name,m.body,m.created_at FROM messages m JOIN users u ON u.id=m.sender_user_id WHERE m.conversation_id=? ORDER BY m.created_at,m.id LIMIT 1000`, [req.params.id]);
    return ok(res, data);
}));
chatRouter.post('/conversations/:id/messages', asyncHandler(async (req, res) => {
    const body = validate(z.object({ body: z.string().min(1).max(5000) }), req.body);
    const participants = await rows('SELECT user_id FROM conversation_participants WHERE conversation_id=?', [req.params.id]);
    if (!participants.some((p) => p.user_id === req.auth.userId))
        throw forbidden();
    const id = uuid();
    await exec('INSERT INTO messages (id,conversation_id,sender_user_id,body,created_at) VALUES (?,?,?,?,NOW())', [id, req.params.id, req.auth.userId, body.body]);
    const message = { id, conversationId: req.params.id, senderUserId: req.auth.userId, body: body.body, createdAt: new Date().toISOString() };
    participants.filter((p) => p.user_id !== req.auth.userId).forEach((p) => emitToUser(p.user_id, 'chat.message', message));
    return ok(res, message, 201);
}));
chatRouter.post('/reservations/:id/masked-call', asyncHandler(async (req, res) => {
    const reservationId = Number(req.params.id);
    if (!(await canAccessReservation(req.auth.userId, reservationId)))
        throw forbidden();
    const participants = (await reservationParticipants(reservationId)).filter((id) => id !== req.auth.userId);
    const body = validate(z.object({ calleeUserId: z.number().int().positive().optional() }), req.body ?? {});
    const callee = body.calleeUserId ?? participants[0] ?? null;
    if (callee && !participants.includes(callee))
        throw forbidden('Callee is not a participant in this reservation');
    const session = await maskedCallingProvider.createSession();
    const id = uuid();
    await exec('INSERT INTO mobile_call_sessions (id,reservation_id,caller_user_id,callee_user_id,provider,provider_session_id,masked_number,status,created_at) VALUES (?,?,?,?,?,?,?,?,NOW())', [id, reservationId, req.auth.userId, callee, session.provider, session.providerSessionId, session.maskedNumber, session.status]);
    return ok(res, { id, reservationId, calleeUserId: callee, ...session }, 201);
}));
