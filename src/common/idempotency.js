import crypto from 'node:crypto';
import { AppError, conflict } from './errors.js';
import { one, query } from '../db/pool.js';

const hashPayload = (payload) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(payload ?? {}))
    .digest('hex');

export const idempotent = (scope) => async (request, response, next) => {
  const key = request.get('Idempotency-Key');
  if (!key)
    return next(
      new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required'),
    );

  const requestHash = hashPayload(request.body);
  await query(
    `DELETE FROM app_idempotency_keys
      WHERE user_id = ? AND scope = ? AND idempotency_key = ? AND expires_at <= NOW()`,
    [request.auth.userId, scope, key],
  );
  const existing = await one(
    `SELECT request_hash, response_status, response_body
       FROM app_idempotency_keys
      WHERE user_id = ? AND scope = ? AND idempotency_key = ? AND expires_at > NOW()`,
    [request.auth.userId, scope, key],
  );

  if (existing) {
    if (existing.request_hash !== requestHash) {
      return next(conflict('Idempotency key was already used with another request'));
    }
    if (Number(existing.response_status) === 0) {
      return next(conflict('A request with this idempotency key is already in progress'));
    }
    return response.status(existing.response_status).json(JSON.parse(existing.response_body));
  }

  try {
    await query(
      `INSERT INTO app_idempotency_keys
        (user_id, scope, idempotency_key, request_hash, response_status, response_body, expires_at, created_at)
       VALUES (?, ?, ?, ?, 0, JSON_OBJECT(), DATE_ADD(NOW(), INTERVAL 5 MINUTE), NOW())`,
      [request.auth.userId, scope, key, requestHash],
    );
  } catch (error) {
    if (error?.code === 'ER_DUP_ENTRY') {
      return next(conflict('A request with this idempotency key is already in progress'));
    }
    return next(error);
  }
  request.idempotency = { key, scope, requestHash };
  return next();
};

export const storeIdempotencyResponse = async (request, status, body) => {
  if (!request.idempotency) return;
  await query(
    `UPDATE app_idempotency_keys
        SET response_status = ?, response_body = ?, expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR)
      WHERE user_id = ? AND scope = ? AND idempotency_key = ? AND request_hash = ?`,
    [
      status,
      JSON.stringify(body),
      request.auth.userId,
      request.idempotency.scope,
      request.idempotency.key,
      request.idempotency.requestHash,
    ],
  );
};
