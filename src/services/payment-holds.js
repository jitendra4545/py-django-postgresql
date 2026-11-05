import { query, transaction } from '../db/pool.js';
import { cancelAbandonedPayment, createPaymentIntent, isStripeConnectivityError } from './payment-provider.js';

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

// A Stripe outage can make each request block for a long time. Never start
// overlapping sweep passes, and avoid hammering Stripe every 60 seconds.
let sweepInProgress = false;
let stripeUnavailableUntil = 0;
const oldMissingReferencesWarned = new Set();
const MAX_SAFE_INTENT_RECREATION_AGE_MS = 23 * 60 * 60_000;
const STRIPE_OUTAGE_BACKOFF_MS = 3 * 60_000;

export const sweepExpiredPaymentHolds = async () => {
  if (sweepInProgress) return;
  sweepInProgress = true;
  try {
    const pending = await query(
      `SELECT p.id AS paymentId,p.reservation_id AS reservationId,p.provider,
              p.amount,p.currency,p.created_at AS createdAt,
              p.provider_reference AS providerReference
         FROM app_payment_transactions p
         JOIN app_reservation_meta arm ON arm.reservation_id=p.reservation_id
         JOIN app_quote_snapshots q ON q.id=arm.quote_snapshot_id
        WHERE arm.lifecycle_status='PAYMENT_PENDING' AND q.valid_until<NOW()
          AND p.status NOT IN ('PAID','PROCESSING','REFUNDED')
        ORDER BY p.id LIMIT 100`,
    );
    for (const payment of pending) {
      // Safety: Never release a hold when Stripe might already have been paid.
      // While Stripe is unreachable, keep the hold for later reconciliation.
      if (payment.provider === 'stripe' && Date.now() < stripeUnavailableUntil) continue;
      try {
        let providerReference = payment.providerReference;
        if (payment.provider === 'stripe' && !providerReference) {
          // Reusing the original idempotency key is safe only while Stripe
          // still retains its record (Stripe may prune keys at 24+ hours).
          const ageMs = Date.now() - new Date(payment.createdAt).getTime();
          if (!Number.isFinite(ageMs) || ageMs > MAX_SAFE_INTENT_RECREATION_AGE_MS) {
            if (!oldMissingReferencesWarned.has(payment.paymentId)) {
              oldMissingReferencesWarned.add(payment.paymentId);
              console.warn('Expired payment has no Stripe reference; manual reconciliation required', {
                paymentId: payment.paymentId,
                reservationId: payment.reservationId,
              });
            }
            continue;
          }
          const intent = await createPaymentIntent({
            paymentId: payment.paymentId,
            reservationId: payment.reservationId,
            amount: payment.amount,
            currency: payment.currency,
          });
          providerReference = intent.providerReference;
          // Store the recovered Stripe reference, even if cancel subsequently
          // fails. This avoids re-creating on a later sweep.
          await query(
            `UPDATE app_payment_transactions
                SET provider_reference=?, provider_payload=?, updated_at=NOW()
              WHERE id=? AND provider_reference IS NULL`,
            [providerReference, JSON.stringify(intent.raw ?? {}), payment.paymentId],
          );
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
        if (payment.provider === 'stripe' && isStripeConnectivityError(error)) {
          stripeUnavailableUntil = Date.now() + STRIPE_OUTAGE_BACKOFF_MS;
          console.error('Stripe unreachable during expired-hold cleanup; retrying after backoff', {
            paymentId: payment.paymentId,
            errorType: error?.type ?? error?.name,
            code: error?.code ?? error?.raw?.detail?.code ?? 'CONNECTION_TIMEOUT',
            backoffSeconds: STRIPE_OUTAGE_BACKOFF_MS / 1000,
          });
        } else {
          console.error('Unable to release an expired unpaid booking hold', {
            paymentId: payment.paymentId,
            errorType: error?.type ?? error?.name,
            code: error?.code ?? error?.raw?.detail?.code ?? 'UNKNOWN',
            message: error?.message,
          });
        }
      }
    }
  } finally {
    sweepInProgress = false;
  }
};
