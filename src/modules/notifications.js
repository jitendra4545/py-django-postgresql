import { Router } from 'express';
import { asyncHandler } from '../common/async-handler.js';
import { requireAuth } from '../common/auth.js';
import { pageResponse, pagination } from '../common/pagination.js';
import { one, query } from '../db/pool.js';

const router = Router();
router.use(requireAuth);

router.get(
  '/',
  asyncHandler(async (request, response) => {
    const { page, perPage, offset } = pagination(request.query);
    const items = await query(
      `SELECT id,type,title,body,data,read_at AS readAt,created_at AS createdAt FROM app_notifications WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [request.auth.userId, perPage, offset],
    );
    const total = await one('SELECT COUNT(*) AS total FROM app_notifications WHERE user_id=?', [
      request.auth.userId,
    ]);
    response.json(pageResponse(items, Number(total.total), page, perPage));
  }),
);

router.post(
  '/:id/read',
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
