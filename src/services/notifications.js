import { query, transaction } from '../db/pool.js';
import { emitToUser } from './realtime.js';

// Persist the inbox item and delivery job together. Push delivery happens from
// the database-backed worker, so a Node restart cannot silently lose it.
export const notifyUser = async ({ userId, type, title, body, data = {} }, connection = null) => {
  const persist = async (executor) => {
    const [result] = await executor.execute(
      `INSERT INTO app_notifications
        (user_id, type, title, body, data, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [userId, type, title, body, JSON.stringify(data)],
    );
    await executor.execute(
      `INSERT INTO app_push_delivery_jobs
         (notification_id,user_id,status,next_attempt_at,created_at,updated_at)
       VALUES (?,?,'PENDING',NOW(),NOW(),NOW())`,
      [result.insertId, userId],
    );
    return result.insertId;
  };
  // Outside a caller-owned transaction, use a single transaction for inbox+outbox.
  const id = connection ? await persist(connection) : await transaction(persist);
  // Existing producers call this after committing the booking/payment/change state.
  emitToUser(userId, 'notification.created', { id, type, title, body, data });
  return id;
};

export const notifyBookingAudience = async (
  reservationId,
  notification,
  connection = null,
  { excludeUserIds = [] } = {},
) => {
  const executor = connection ?? {
    execute: (sql, params) => query(sql, params).then((rows) => [rows]),
  };
  const [users] = await executor.execute(
    `SELECT DISTINCT u.id AS userId
       FROM reservations r
       JOIN customers c ON c.id = r.customer_id
       JOIN users u ON u.id = c.user_id
      WHERE r.id = ?
     UNION
     SELECT DISTINCT a.user_id
       FROM reservations r
       JOIN app_agent_customer_assignments aca ON aca.customer_id = r.customer_id AND aca.status = 'ACTIVE'
       JOIN agents a ON a.id = aca.agent_id
      WHERE r.id = ?
     UNION
     SELECT DISTINCT d.user_id
       FROM app_driver_assignments ada
       JOIN drivers d ON d.id = ada.driver_id
      WHERE ada.reservation_id = ? AND ada.status NOT IN ('DECLINED','CANCELLED')`,
    [reservationId, reservationId, reservationId],
  );
  const excluded = new Set(excludeUserIds.map(Number));
  for (const row of users) {
    if (!excluded.has(Number(row.userId)))
      await notifyUser({ userId: row.userId, ...notification }, connection);
  }
};

// Business operations must not report failure after their own DB commit just
// because an optional notification failed. Log and repair via monitoring.
export const notifyUserBestEffort = async (...args) => {
  try {
    return await notifyUser(...args);
  } catch (error) {
    console.error('Notification enqueue failed', { code: error.code, name: error.name });
    return null;
  }
};

export const notifyBookingAudienceBestEffort = async (...args) => {
  try {
    await notifyBookingAudience(...args);
  } catch (error) {
    console.error('Booking notification enqueue failed', { code: error.code, name: error.name });
  }
};
