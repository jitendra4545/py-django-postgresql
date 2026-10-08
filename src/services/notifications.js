import { query } from '../db/pool.js';
import { emitToUser } from './realtime.js';
import { sendPushToUser } from './push.js';

export const notifyUser = async ({ userId, type, title, body, data = {} }, connection = null) => {
  const executor = connection ?? {
    execute: (sql, params) => query(sql, params).then((rows) => [rows]),
  };
  const [result] = await executor.execute(
    `INSERT INTO app_notifications
      (user_id, type, title, body, data, created_at)
     VALUES (?, ?, ?, ?, ?, NOW())`,
    [userId, type, title, body, JSON.stringify(data)],
  );
  emitToUser(userId, 'notification.created', { id: result.insertId, type, title, body, data });
  sendPushToUser(userId, { title, body }, data).catch((error) =>
    console.error('Push notification failed', { userId, error: error.message }),
  );
  return result.insertId;
};

export const notifyBookingAudience = async (reservationId, notification, connection = null) => {
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
  for (const row of users) await notifyUser({ userId: row.userId, ...notification }, connection);
};
