import { Router } from 'express';
import { asyncHandler } from '../common/async-handler.js';
import { requireAuth } from '../common/auth.js';
import { AppError, notFound } from '../common/errors.js';
import { env } from '../config/env.js';
import { one, transaction } from '../db/pool.js';
import { getReservationForAccess } from '../services/access.js';
import { notifyBookingAudience } from '../services/notifications.js';
import {
  constructWebhookEvent,
  createPaymentIntent,
  stripePaymentStatus,
} from '../services/payment-provider.js';

const router = Router();

router.post(
  '/webhook',
  asyncHandler(async (request, response) => {
    const raw = request.rawBody ?? Buffer.from(JSON.stringify(request.body));
    let event;
    try {
      event = constructWebhookEvent(raw, request.get('stripe-signature'));
    } catch {
      throw new AppError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Stripe webhook signature is invalid');
    }
    const object = event.data?.object ?? event;
    const providerReference =
      object.object === 'payment_intent'
        ? object.id
        : typeof object.payment_intent === 'string'
          ? object.payment_intent
          : object.payment_intent?.id;
    if (!providerReference) return response.status(200).json({ received: true, ignored: true });
    const payment = await one('SELECT * FROM app_payment_transactions WHERE provider_reference=?', [
      providerReference,
    ]);
    if (!payment) return response.status(200).json({ received: true, ignored: true });
    const duplicate = await one(
      'SELECT id FROM app_payment_webhook_events WHERE provider=? AND provider_event_id=?',
      [payment.provider, event.id],
    );
    if (duplicate) return response.status(200).json({ received: true, duplicate: true });

    let status;
    if (event.type?.startsWith('payment_intent.')) status = stripePaymentStatus(object.status);
    if (event.type === 'charge.refunded') {
      status = object.amount_refunded >= object.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    }
    if (event.type === 'refund.updated' && object.status === 'failed') status = 'PAID';
    if (!status) status = payment.status;

    await transaction(async (connection) => {
      await connection.execute(
        `INSERT INTO app_payment_webhook_events (provider,provider_event_id,payload,received_at) VALUES (?,?,?,NOW())`,
        [payment.provider, event.id, raw.toString('utf8')],
      );
      await connection.execute(
        `UPDATE app_payment_transactions SET status=?,provider_payload=?,updated_at=NOW() WHERE id=?`,
        [status, JSON.stringify(object), payment.id],
      );
      if (status === 'PAID' && payment.status !== 'PAID') {
        await connection.execute(
          'UPDATE reservations SET payment_status=1,updated_at=NOW() WHERE id=?',
          [payment.reservation_id],
        );
        await connection.execute(
          `UPDATE app_reservation_meta
              SET lifecycle_status=CASE
                    WHEN lifecycle_status='PAYMENT_PENDING' THEN 'PENDING_CONFIRMATION'
                    WHEN lifecycle_status='CHANGE_PAYMENT_PENDING' THEN 'CONFIRMED'
                    ELSE lifecycle_status
                  END,
                  updated_at=NOW()
            WHERE reservation_id=?`,
          [payment.reservation_id],
        );
        await connection.execute(
          `INSERT INTO reservation_payments (reservation_id,total_due,payment_amount,due_amount,payment_type,note,payment_date,status,user_id,created_at,updated_at)
           VALUES (?,?,?,?,2,?,NOW(),1,?,NOW(),NOW())`,
          [
            payment.reservation_id,
            payment.amount,
            payment.amount,
            0,
            `Stripe payment ${payment.provider_reference}`,
            payment.user_id,
          ],
        );
        await connection.execute(
          `INSERT INTO app_booking_status_events (reservation_id,status,actor_user_id,note,occurred_at,created_at) VALUES (?,'PAYMENT_CONFIRMED',?,'Payment confirmed',NOW(),NOW())`,
          [payment.reservation_id, payment.user_id],
        );
      }
      if (status === 'REFUNDED') {
        const [outstandingPayments] = await connection.execute(
          `SELECT COUNT(*) AS total FROM app_payment_transactions
            WHERE reservation_id=? AND id<>?
              AND status IN ('PAID','PARTIALLY_REFUNDED','REFUND_PENDING')`,
          [payment.reservation_id, payment.id],
        );
        if (Number(outstandingPayments[0].total) === 0) {
          await connection.execute(
            'UPDATE reservations SET payment_status=0,updated_at=NOW() WHERE id=?',
            [payment.reservation_id],
          );
        }
        const [requests] = await connection.execute(
          `SELECT id FROM app_booking_cancellation_requests
            WHERE reservation_id=? AND status='APPROVED_REFUND_PENDING' FOR UPDATE`,
          [payment.reservation_id],
        );
        if (requests[0] && Number(outstandingPayments[0].total) === 0) {
          await connection.execute(
            `UPDATE app_booking_cancellation_requests SET status='APPROVED',updated_at=NOW() WHERE id=?`,
            [requests[0].id],
          );
          await connection.execute('UPDATE reservations SET status=3,updated_at=NOW() WHERE id=?', [
            payment.reservation_id,
          ]);
          await connection.execute(
            `UPDATE app_reservation_meta SET lifecycle_status='CANCELLED',updated_at=NOW() WHERE reservation_id=?`,
            [payment.reservation_id],
          );
          await connection.execute(
            `UPDATE app_driver_assignments SET status='CANCELLED',updated_at=NOW()
              WHERE reservation_id=? AND status NOT IN ('COMPLETED','CANCELLED')`,
            [payment.reservation_id],
          );
          await connection.execute('DELETE FROM vehicle_reserved_dates WHERE reservation_id=?', [
            payment.reservation_id,
          ]);
        }
      }
    });
    await notifyBookingAudience(payment.reservation_id, {
      type: 'PAYMENT',
      title: 'Payment updated',
      body: `Payment status: ${status}`,
      data: {
        reservationId: payment.reservation_id,
        paymentId: payment.id,
        status,
      },
    });
    response.json({ received: true });
  }),
);

router.use(requireAuth);

router.get(
  '/:paymentId',
  asyncHandler(async (request, response) => {
    const payment = await one(
      `SELECT id,reservation_id AS reservationId,provider,provider_reference AS providerReference,amount,currency,status,created_at AS createdAt FROM app_payment_transactions WHERE id=?`,
      [request.params.paymentId],
    );
    if (!payment) throw notFound('Payment not found');
    await getReservationForAccess(request.auth, payment.reservationId);
    response.json(payment);
  }),
);

router.post(
  '/:paymentId/retry',
  asyncHandler(async (request, response) => {
    const payment = await one('SELECT * FROM app_payment_transactions WHERE id=?', [
      request.params.paymentId,
    ]);
    if (!payment) throw notFound('Payment not found');
    await getReservationForAccess(request.auth, payment.reservation_id);
    if (!['CREATED', 'FAILED'].includes(payment.status)) {
      throw new AppError(
        409,
        'PAYMENT_NOT_RETRYABLE',
        `Payment in ${payment.status} state cannot be retried`,
      );
    }
    const intent = await createPaymentIntent({
      paymentId: payment.id,
      amount: payment.amount,
      currency: payment.currency,
      reservationId: payment.reservation_id,
    });
    await transaction(async (connection) => {
      await connection.execute(
        'UPDATE app_payment_transactions SET provider_reference=?,provider_payload=?,status=?,updated_at=NOW() WHERE id=?',
        [intent.providerReference, JSON.stringify(intent.raw ?? {}), intent.status, payment.id],
      );
    });
    response.json({ id: payment.id, ...intent });
  }),
);

router.post(
  '/:paymentId/mock-confirm',
  asyncHandler(async (request, response) => {
    if (env.NODE_ENV === 'production' || env.PAYMENT_PROVIDER !== 'mock') throw notFound();
    const payment = await one('SELECT * FROM app_payment_transactions WHERE id=?', [
      request.params.paymentId,
    ]);
    if (!payment) throw notFound('Payment not found');
    await getReservationForAccess(request.auth, payment.reservation_id);
    if (payment.status !== 'PAID') {
      await transaction(async (connection) => {
        await connection.execute(
          `UPDATE app_payment_transactions SET status='PAID',updated_at=NOW() WHERE id=?`,
          [payment.id],
        );
        await connection.execute(
          'UPDATE reservations SET payment_status=1,updated_at=NOW() WHERE id=?',
          [payment.reservation_id],
        );
        await connection.execute(
          `UPDATE app_reservation_meta SET lifecycle_status='PENDING_CONFIRMATION',updated_at=NOW() WHERE reservation_id=?`,
          [payment.reservation_id],
        );
        await connection.execute(
          `INSERT INTO reservation_payments (reservation_id,total_due,payment_amount,due_amount,payment_type,note,payment_date,status,user_id,created_at,updated_at) VALUES (?,?,?,?,2,'Mock mobile payment',NOW(),1,?,NOW(),NOW())`,
          [payment.reservation_id, payment.amount, payment.amount, 0, request.auth.userId],
        );
      });
    }
    response.json({ id: payment.id, status: 'PAID' });
  }),
);

export default router;
