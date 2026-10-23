import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../common/async-handler.js';
import { requireAuth } from '../common/auth.js';
import { pageResponse, pagination } from '../common/pagination.js';
import { validate } from '../common/validate.js';
import { one, query } from '../db/pool.js';
import { enqueueSelfTestNotification, getSelfTestNotificationStatus } from '../services/notification-testing.js';
import { registerPushDevice, unregisterPushDevice } from '../services/push-devices.js';

const router = Router();
router.use(requireAuth);

const deviceSchema = z.object({
  deviceId: z.string().min(4).max(191),
  platform: z.enum(['IOS', 'ANDROID']),
  pushToken: z.string().min(10).max(512),
  appVersion: z.string().max(32).optional(),
});

router.put(
  '/devices',
  validate(deviceSchema),
  asyncHandler(async (request, response) => {
    await registerPushDevice(request.auth.userId, request.body);
    response.json({ registered: true, deviceId: request.body.deviceId });
  }),
);

router.get(
  '/devices',
  asyncHandler(async (request, response) => {
    const rows = await query(
      `SELECT device_id AS deviceId,platform,app_version AS appVersion,
              last_seen_at AS lastSeenAt,(push_token IS NOT NULL) AS pushEnabled
         FROM app_user_devices WHERE user_id=? ORDER BY last_seen_at DESC`,
      [request.auth.userId],
    );
    response.json({
      items: rows.map((row) => ({ ...row, pushEnabled: Boolean(row.pushEnabled) })),
    });
  }),
);

router.delete(
  '/devices/:deviceId',
  validate(z.object({ deviceId: z.string().min(4).max(191) }), 'params'),
  asyncHandler(async (request, response) => {
    await unregisterPushDevice(request.auth.userId, request.params.deviceId);
    response.status(204).end();
  }),
);

// Opt-in QA endpoint: tests the real inbox -> outbox -> Expo worker flow.
// Only the authenticated user's own registered devices can receive these pushes.
const testPushSchema = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    body: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

router.post(
  '/test',
  validate(testPushSchema),
  asyncHandler(async (request, response) => {
    const result = await enqueueSelfTestNotification(request.auth.userId, request.body);
    response.status(202).json(result);
  }),
);

router.get(
  '/test/:notificationId/status',
  validate(z.object({ notificationId: z.coerce.number().int().positive() }), 'params'),
  asyncHandler(async (request, response) => {
    const result = await getSelfTestNotificationStatus(
      request.auth.userId,
      request.params.notificationId,
    );
    response.json(result);
  }),
);

router.get(
  '/unread-count',
  asyncHandler(async (request, response) => {
    const unread = await one(
      'SELECT COUNT(*) AS total FROM app_notifications WHERE user_id=? AND read_at IS NULL',
      [request.auth.userId],
    );
    response.json({ count: Number(unread.total) });
  }),
);

router.get(
  '/',
  validate(
    z.object({
      page: z.coerce.number().int().min(1).optional(),
      perPage: z.coerce.number().int().min(1).max(100).optional(),
      unreadOnly: z.enum(['true', 'false']).optional(),
    }),
    'query',
  ),
  asyncHandler(async (request, response) => {
    const { page, perPage, offset } = pagination(request.query);
    const unreadOnly = request.query.unreadOnly === 'true';
    const suffix = unreadOnly ? ' AND read_at IS NULL' : '';
    const items = await query(
      `SELECT id,type,title,body,data,read_at AS readAt,created_at AS createdAt
         FROM app_notifications WHERE user_id=?${suffix}
        ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`,
      [request.auth.userId, perPage, offset],
    );
    const total = await one(
      `SELECT COUNT(*) AS total FROM app_notifications WHERE user_id=?${suffix}`,
      [request.auth.userId],
    );
    response.json(pageResponse(items, Number(total.total), page, perPage));
  }),
);

router.post(
  '/:id/read',
  validate(z.object({ id: z.coerce.number().int().positive() }), 'params'),
  asyncHandler(async (request, response) => {
    await query(
      'UPDATE app_notifications SET read_at=COALESCE(read_at,NOW()) WHERE id=? AND user_id=?',
      [request.params.id, request.auth.userId],
    );
    response.status(204).end();
  }),
);

router.post(
  '/read-all',
  asyncHandler(async (request, response) => {
    await query('UPDATE app_notifications SET read_at=COALESCE(read_at,NOW()) WHERE user_id=?', [
      request.auth.userId,
    ]);
    response.status(204).end();
  }),
);

export default router;
