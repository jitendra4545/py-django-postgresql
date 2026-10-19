import { query, transaction } from '../db/pool.js';
import { cancelAbandonedPayment, createPaymentIntent } from './payment-provider.js';

export const releasePendingHold = async (connection, reservationId) => {
  const [rows] = await connection.execute(
    `SELECT r.id FROM reservations r
      JOIN app_reservation_meta arm ON arm.reservation_id=r.id
      WHERE r.id=? AND r.status=0 AND r.payment_status=0
        AND arm.lifecycle_status='PAYMENT_PENDING' FOR UPDATE`,
    [reservationId],
  );
  if (!rows.length) return false;
  await connection.execute('DELETE FROM vehicle_reserved_dates WHERE reservation_id=?', [
    reservationId,
  ]);
  await connection.execute(
    'UPDATE reservation_vehicles SET status=2,deleted_at=NOW(),updated_at=NOW() WHERE reservation_id=? AND status=1',
    [reservationId],
  );
  await connection.execute('UPDATE reservations SET status=3,updated_at=NOW() WHERE id=?', [
    reservationId,
  ]);
  await connection.execute(
    `UPDATE app_reservation_meta SET lifecycle_status='CANCELLED',updated_at=NOW()
      WHERE reservation_id=?`,
    [reservationId],
  );
  await connection.execute(
    `INSERT INTO app_booking_status_events
      (reservation_id,status,actor_user_id,note,occurred_at,created_at)
      VALUES (?,'CANCELLED',NULL,'Unpaid vehicle hold expired',NOW(),NOW())`,
    [reservationId],
  );
  return true;
};

export const sweepExpiredPaymentHolds = async () => {
  const pending = await query(
    `SELECT p.id AS paymentId,p.reservation_id AS reservationId,p.provider,
            p.amount,p.currency,
            p.provider_reference AS providerReference
       FROM app_payment_transactions p
       JOIN app_reservation_meta arm ON arm.reservation_id=p.reservation_id
       JOIN app_quote_snapshots q ON q.id=arm.quote_snapshot_id
      WHERE arm.lifecycle_status='PAYMENT_PENDING' AND q.valid_until<NOW()
        AND p.status NOT IN ('PAID','PROCESSING','REFUNDED')
      ORDER BY p.id LIMIT 100`,
  );
  for (const payment of pending) {
    try {
      let providerReference = payment.providerReference;
      if (payment.provider === 'stripe' && !providerReference) {
        // Reusing create's Stripe idempotency key recovers an ambiguous prior
        // request timeout; it cannot create a second charge for this payment.
        const intent = await createPaymentIntent({
          paymentId: payment.paymentId,
          reservationId: payment.reservationId,
          amount: payment.amount,
          currency: payment.currency,
        });
        providerReference = intent.providerReference;
      }
      if (!(await cancelAbandonedPayment(payment.provider, providerReference))) continue;
      await transaction(async (connection) => {
        const [rows] = await connection.execute(
          'SELECT status FROM app_payment_transactions WHERE id=? FOR UPDATE',
          [payment.paymentId],
        );
        if (!rows[0] || ['PAID', 'PROCESSING'].includes(rows[0].status)) return;
        if (await releasePendingHold(connection, payment.reservationId)) {
          await connection.execute(
            `UPDATE app_payment_transactions SET status='CANCELLED',updated_at=NOW() WHERE id=?`,
            [payment.paymentId],
          );
        }
      });
    } catch (error) {
      console.error('Unable to release an expired unpaid booking hold', {
        paymentId: payment.paymentId,
        code: error.code,
      });
    }
  }
};
