import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { z } from 'zod';
import { asyncHandler, ok, validate } from '../common/http.js';
import { requireAuth } from '../common/auth.js';
import { exec, rows } from '../db/pool.js';
import { emitToUser } from '../realtime/socket.js';
import { sendPush } from '../integrations/push.js';
export async function notifyUser(userId, type, title, body, data = {}) {
    const id = uuid();
    await exec('INSERT INTO mobile_notifications (id,user_id,type,title,body,data_json,created_at) VALUES (?,?,?,?,?,?,NOW())', [id, userId, type, title, body, JSON.stringify(data)]);
    emitToUser(userId, 'notification', { id, type, title, body, data });
    const tokenRows = await rows('SELECT push_token FROM user_devices WHERE user_id=? AND push_token IS NOT NULL AND push_token<>\'\'', [userId]);
    const stringData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));
    await sendPush(tokenRows.map((r) => r.push_token), title, body, stringData).catch(() => undefined);
}
export const notificationRouter = Router();
notificationRouter.use(requireAuth);
notificationRouter.post('/devices', asyncHandler(async (req, res) => {
    const body = validate(z.object({
        deviceId: z.string().min(1).max(191),
        platform: z.enum(['ios', 'android', 'web', 'unknown']).default('unknown'),
        pushToken: z.string().optional().nullable(),
        appVersion: z.string().max(50).optional().nullable()
    }), req.body);
    await exec(`INSERT INTO user_devices (user_id,device_id,platform,push_token,app_version,last_seen_at,created_at,updated_at)
     VALUES (?,?,?,?,?,NOW(),NOW(),NOW())
     ON DUPLICATE KEY UPDATE platform=VALUES(platform),push_token=VALUES(push_token),app_version=VALUES(app_version),last_seen_at=NOW(),updated_at=NOW()`, [req.auth.userId, body.deviceId, body.platform, body.pushToken ?? null, body.appVersion ?? null]);
    return ok(res, { registered: true });
}));
notificationRouter.get('/', asyncHandler(async (req, res) => {
    const data = await rows('SELECT id,type,title,body,data_json,read_at,created_at FROM mobile_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100', [req.auth.userId]);
    return ok(res, data);
}));
notificationRouter.patch('/:id/read', asyncHandler(async (req, res) => {
    await exec('UPDATE mobile_notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=? AND user_id=?', [req.params.id, req.auth.userId]);
    return ok(res, { read: true });
}));
