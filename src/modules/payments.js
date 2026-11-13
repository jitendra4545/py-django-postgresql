import { refreshNativeBalancePayment } from '../services/native-balance-payment.js';
import { nativeLifecycleSql } from '../services/legacy-reservation-adapter.js';
import { recordBookingStatusEvent } from '../services/mobile-status-events.js';
import {assertNativePaymentBalance,markNativeFinancialChange} from '../services/native-financials.js';
import { ACTIVE_PAYMENT_STATES, SAVED_UNPAID_STATES, updatedProviderPayload, parsePaymentPayload } from '../services/booking-payment-policy.js';
import { initializeNativeBalanceIntent } from '../services/native-balance-intent.js';
import { Router } from 'express';
import { asyncHandler } from '../common/async-handler.js';
import { requireAuth } from '../common/auth.js';
import { AppError, notFound } from '../common/errors.js';
import { env } from '../config/env.js';
import { one, transaction } from '../db/pool.js';
import { getReservationForAccess } from '../services/access.js';
import { notifyBookingAudience } from '../services/notifications.js';
import { releasePendingHold } from '../services/payment-holds.js';
import { stripeServiceErrorCode } from '../services/stripe-network.js';
import {
  constructWebhookEvent,
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

    if (!providerReference) {
      return response.status(200).json({
        received: true,
        ignored: true,
      });
    }

    const payment = await one('SELECT * FROM app_payment_transactions WHERE provider_reference=?', [
      providerReference,
    ]);

    if (!payment) {
      return response.status(200).json({
        received: true,
        ignored: true,
      });
    }

    let status;

    if (event.type?.startsWith('payment_intent.')) {
      status = stripePaymentStatus(object.status);
    }

    if (event.type === 'payment_intent.payment_failed') {
      status = 'FAILED';
    }

    if (event.type === 'charge.refunded') {
      status = object.amount_refunded >= object.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
    }

    if (event.type === 'refund.updated' && object.status === 'failed') {
      status = 'PAID';
    }

    if (!status) {
      status = payment.status;
    }

    const outcome = await transaction(async (connection) => {
      await connection.execute('SELECT id FROM reservations WHERE id=? FOR UPDATE',[payment.reservation_id]);
      const [lockedPayments] = await connection.execute(
        `SELECT status,provider_reference,provider_payload
         FROM app_payment_transactions
         WHERE id=?
         FOR UPDATE`,
        [payment.id],
      );

      if (!lockedPayments[0]) {
        return 'missing';
      }

      if(lockedPayments[0].provider_reference!==providerReference) return 'ignored';
      const previousStatus = lockedPayments[0].status;

      // The database unique constraint is the final authority.
      // Two concurrent webhook deliveries may contain
      // the same Stripe event ID.
      try {
        await connection.execute(
          `INSERT INTO app_payment_webhook_events
           (provider, provider_event_id, payload, received_at)
           VALUES (?, ?, ?, NOW())`,
          [payment.provider, event.id, raw.toString('utf8')],
        );
      } catch (error) {
        if (
          error?.code === 'ER_DUP_ENTRY' &&
          String(error?.sqlMessage ?? '').includes('uq_app_payment_webhook_event')
        ) {
          return 'duplicate';
        }

        // Genuine database errors must not be hidden.
        throw error;
      }

      // A delayed Stripe event must not undo
      // a payment that was already confirmed.
      if (
        previousStatus === 'PAID' &&
        !['PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'].includes(status)
      ) {
        status = 'PAID';
      }

      await connection.execute(
        `UPDATE app_payment_transactions
         SET status=?,
             provider_payload=?,
             updated_at=NOW()
         WHERE id=?`,
        [status, updatedProviderPayload(payment.provider_payload, object), payment.id],
      );

      if (status === 'CANCELLED') {
        await releasePendingHold(connection, payment.reservation_id);
      }

      if (status === 'FAILED' && previousStatus !== 'PAID') {
        const [unpaidBookings] = await connection.execute(
          `SELECT lifecycle_status FROM reservations WHERE id=? FOR UPDATE`,
          [payment.reservation_id],
        );
        if (['PAYMENT_PENDING', 'PAYMENT_DUE'].includes(unpaidBookings[0]?.lifecycle_status)) {
          await connection.execute(
            `UPDATE reservations SET lifecycle_status='PAYMENT_FAILED',updated_at=NOW() WHERE id=?`,
            [payment.reservation_id],
          );
          await recordBookingStatusEvent(connection, {
            reservationId: payment.reservation_id,
            status: 'PAYMENT_FAILED',
            actorUserId: payment.user_id,
            note: 'Payment failed; reservation retained for payment retry',
          });
        }
      }

      if (status === 'PAID' && previousStatus !== 'PAID' && event.type?.startsWith('payment_intent.')) {
        const position=await assertNativePaymentBalance(connection,payment,{allowMismatch:true});
        const actualAmount=Number(object.amount_received??object.amount??Math.round(payment.amount*100))/100;
        const actualCurrency=String(object.currency??payment.currency).toUpperCase();
        const reconcile=!position.matches || actualAmount!==Number(payment.amount) || actualCurrency!==position.currency;
        if(reconcile){
          if(actualCurrency===position.currency)await connection.execute(`INSERT INTO reservation_payments
            (reservation_id,total_due,payment_amount,due_amount,payment_type,note,payment_date,status,user_id,created_at,updated_at)
            VALUES (?,?,?,?,2,?,NOW(),1,?,NOW(),NOW())`,[payment.reservation_id,position.balance,actualAmount,Math.max(0,position.balance-actualAmount),
            `Stripe received ${payment.provider_reference}; operations reconciliation required`,payment.user_id]);
          await connection.execute('UPDATE app_payment_transactions SET provider_payload=? WHERE id=?',[
            updatedProviderPayload(payment.provider_payload,{...object,reconciliationRequired:true}),payment.id]);
          await recordBookingStatusEvent(connection,{reservationId:payment.reservation_id,status:'PAYMENT_RECONCILIATION_REQUIRED',actorUserId:payment.user_id,note:'Payment received after native financial state changed. Review the balance and any refund; booking state retained.'});
          await markNativeFinancialChange(connection,payment.reservation_id);
          return 'reconciliation';
        }
        const [reservations] = await connection.execute(
          `SELECT
             r.status,
             ${nativeLifecycleSql()} AS lifecycle_status
           FROM reservations r
           JOIN reservations arm ON arm.id=r.id
           WHERE r.id=?
           FOR UPDATE`,
          [payment.reservation_id],
        );

        // An expired/cancelled hold cannot be
        // automatically resurrected.
        if (
          !reservations[0] ||
          reservations[0].status === 3 ||
          !ACTIVE_PAYMENT_STATES.includes(reservations[0].lifecycle_status)
        ) {
          return;
        }

        await connection.execute(
          `UPDATE reservations
           SET payment_status=?,
               status=IF(status=2,2,1),
               updated_at=NOW()
           WHERE id=?`,
          [env.LEGACY_PAID_PAYMENT_STATUS, payment.reservation_id],
        );

        await connection.execute(
          `UPDATE reservations
           SET lifecycle_status=
             CASE
               WHEN lifecycle_status IN (
                 'PAYMENT_PENDING', 'CHANGE_PAYMENT_PENDING', 'PAYMENT_DUE', 'PAYMENT_FAILED'
               ) THEN 'CONFIRMED'
               ELSE lifecycle_status
             END,
             updated_at=NOW()
           WHERE id=?`,
          [payment.reservation_id],
        );

        await connection.execute(
          `INSERT INTO reservation_payments
           (
             reservation_id,
             total_due,
             payment_amount,
             due_amount,
             payment_type,
             note,
             payment_date,
             status,
             user_id,
             created_at,
             updated_at
           )
           VALUES (?, ?, ?, ?, 2, ?, NOW(), 1, ?, NOW(), NOW())`,
          [
            payment.reservation_id,
            payment.amount,
            payment.amount,
            0,
            `Stripe payment ${payment.provider_reference}`,
            payment.user_id,
          ],
        );

        await recordBookingStatusEvent(connection, {
          reservationId: payment.reservation_id,
          status: 'CONFIRMED',
          actorUserId: payment.user_id,
          note: 'Stripe payment confirmed',
        });
        await markNativeFinancialChange(connection,payment.reservation_id);
      }

      if (status === 'REFUNDED') {
        const [outstandingPayments] = await connection.execute(
          `SELECT COUNT(*) AS total
             FROM app_payment_transactions
             WHERE reservation_id=?
               AND id<>?
               AND status IN (
                 'PAID',
                 'PARTIALLY_REFUNDED',
                 'REFUND_PENDING'
               )`,
          [payment.reservation_id, payment.id],
        );

        if (Number(outstandingPayments[0].total) === 0) {
          await connection.execute(
            `UPDATE reservations
             SET payment_status=0,
                 updated_at=NOW()
             WHERE id=?`,
            [payment.reservation_id],
          );
        }

        const [requests] = await connection.execute(
          `SELECT id
           FROM app_booking_cancellation_requests
           WHERE reservation_id=?
             AND status='APPROVED_REFUND_PENDING'
           FOR UPDATE`,
          [payment.reservation_id],
        );

        if (requests[0] && Number(outstandingPayments[0].total) === 0) {
          await connection.execute(
            `UPDATE app_booking_cancellation_requests
             SET status='APPROVED',
                 updated_at=NOW()
             WHERE id=?`,
            [requests[0].id],
          );

          await connection.execute(
            `UPDATE reservations
             SET status=3,
                 updated_at=NOW()
             WHERE id=?`,
            [payment.reservation_id],
          );

          await connection.execute(
            `UPDATE reservations
             SET lifecycle_status='CANCELLED',
                 updated_at=NOW()
             WHERE id=?`,
            [payment.reservation_id],
          );

          await connection.execute(
            `UPDATE app_mobile_assignment_ids a JOIN reservation_drivers rd ON rd.id=a.reservation_driver_id SET a.assignment_status='CANCELLED',a.current_slot=NULL,a.updated_at=NOW(),rd.status=2 WHERE rd.reservation_id=? AND a.assignment_status NOT IN ('COMPLETED','CANCELLED')`,
            [payment.reservation_id],
          );

          await connection.execute(
            `DELETE FROM vehicle_reserved_dates
             WHERE reservation_id=?`,
            [payment.reservation_id],
          );

          await connection.execute(
            `UPDATE reservation_vehicles
             SET status=2,
                 deleted_at=NOW(),
                 updated_at=NOW()
             WHERE reservation_id=?
               AND status=1`,
            [payment.reservation_id],
          );
        }
      }

      return 'processed';
    });

    if (outcome === 'duplicate') {
      console.info('Duplicate Stripe webhook acknowledged', {
        eventId: event.id,
        paymentId: payment.id,
      });

      return response.status(200).json({
        received: true,
        duplicate: true,
      });
    }

    if (outcome === 'missing') {
      return response.status(200).json({
        received: true,
        ignored: true,
      });
    }

    // Only alert on a real payment-status transition. A duplicate or unrelated
    // Stripe event must not generate another customer notification.
    if (outcome === 'processed' && payment.status !== status) {
      try {
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
      } catch (error) {
        console.error('Payment webhook notification failed after database commit', {
          eventId: event.id,
          reservationId: payment.reservation_id,
          message: error?.message,
        });
      }
    }

    response.status(200).json({
      received: true,
    });
  }),
);

router.use(requireAuth);

router.get(
  '/:paymentId',
  asyncHandler(async (request, response) => {
    let payment = await one(
      `SELECT
         id,
         reservation_id AS reservationId,
         provider,
         provider_reference AS providerReference,
         amount,
         currency,
         status,
         created_at AS createdAt
       FROM app_payment_transactions
       WHERE id=?`,
      [request.params.paymentId],
    );

    if (!payment) {
      throw notFound('Payment not found');
    }

    await getReservationForAccess(request.auth, payment.reservationId);

    await refreshNativeBalancePayment(payment.reservationId,request.auth.userId);
    payment=await one(`SELECT id,reservation_id AS reservationId,provider,
      provider_reference AS providerReference,amount,currency,status,created_at AS createdAt
      FROM app_payment_transactions WHERE id=?`,[request.params.paymentId]);
    // Prevent stale payment statuses during polling.
    response.set('Cache-Control', 'no-store');

    response.json(payment);
  }),
);

router.post(
  '/:paymentId/retry',
  asyncHandler(async (request, response) => {
    const payment = await one(
      `SELECT *
       FROM app_payment_transactions
       WHERE id=?`,
      [request.params.paymentId],
    );

    if (!payment) {
      throw notFound('Payment not found');
    }

    await getReservationForAccess(request.auth, payment.reservation_id);

    if (payment.provider !== env.PAYMENT_PROVIDER) {
      throw new AppError(
        409,
        'PAYMENT_PROVIDER_MISMATCH',
        'This payment belongs to a different configured provider; do not retry it automatically.',
      );
    }

    if (!['CREATED', 'FAILED', 'REQUIRES_ACTION', 'DEFERRED'].includes(payment.status)) {
      throw new AppError(
        409,
        'PAYMENT_NOT_RETRYABLE',
        `Payment in ${payment.status} state cannot be retried`,
      );
    }

    const hold = await one(
      `SELECT
         r.status AS reservationStatus,
         ${nativeLifecycleSql()} AS lifecycleStatus,
         (q.valid_until > NOW()) AS quoteIsValid
       FROM reservations r
       JOIN reservations arm ON arm.id=r.id
       LEFT JOIN app_quote_snapshots q
         ON q.id=arm.quote_snapshot_id
       WHERE r.id=?`,
      [payment.reservation_id],
    );

    if (
      !hold ||
      Number(hold.reservationStatus) === 3 ||
      !ACTIVE_PAYMENT_STATES.includes(hold.lifecycleStatus)
    ) {
      throw new AppError(
        409,
        'PAYMENT_HOLD_NOT_ACTIVE',
        'This reservation is no longer awaiting payment; check booking status.',
      );
    }

    if (!SAVED_UNPAID_STATES.includes(hold.lifecycleStatus) && !Number(hold.quoteIsValid)) {
      throw new AppError(
        409,
        'PAYMENT_HOLD_EXPIRED',
        'The reservation quote has expired. Do not retry a payment for this hold.',
      );
    }

    if (!payment.provider_reference) {
      const age = Date.now() - new Date(parsePaymentPayload(payment.provider_payload).providerAttemptStartedAt??payment.created_at).getTime();

      if (payment.status !== 'DEFERRED' && (!Number.isFinite(age) || age > 23 * 60 * 60_000)) {
        throw new AppError(
          409,
          'PAYMENT_RECONCILIATION_REQUIRED',
          'This payment has no saved Stripe reference and is too old to retry automatically. Check the Stripe Dashboard first.',
        );
      }
    }

    let intent;

    try {
      intent = await initializeNativeBalanceIntent(payment.id,payment.reservation_id,request.auth.userId);
    } catch (error) {
      if(error instanceof AppError) throw error;
      const code = stripeServiceErrorCode(error);

      console.error('Stripe payment setup/recovery failed', {
        paymentId: payment.id,
        errorType: error?.type ?? error?.name,
        code,
      });

      throw new AppError(
        code === 'STRIPE_UNREACHABLE' ? 503 : 502,
        code,
        code === 'STRIPE_UNREACHABLE'
          ? 'This server cannot reach Stripe. Fix outbound HTTPS connectivity or the approved proxy, then retry this SAME payment.'
          : 'Stripe could not initialize this payment. Check backend Stripe configuration and Stripe logs.',
      );
    }

    response.json({
      id: payment.id,
      ...intent,
    });
  }),
);

router.post(
  '/:paymentId/mock-confirm',
  asyncHandler(async (request, response) => {
    if (env.NODE_ENV === 'production' || env.PAYMENT_PROVIDER !== 'mock') {
      throw notFound();
    }

    const payment = await one(
      `SELECT *
       FROM app_payment_transactions
       WHERE id=?`,
      [request.params.paymentId],
    );

    if (!payment) {
      throw notFound('Payment not found');
    }

    await getReservationForAccess(request.auth, payment.reservation_id);

    if (payment.status === 'PAID') {
      return response.json({ id: payment.id, status: 'PAID' });
    }
    if (!['REQUIRES_ACTION', 'FAILED', 'CREATED'].includes(payment.status)) {
      throw new AppError(409, 'PAYMENT_NOT_CONFIRMABLE', 'Initiate payment before confirming it');
    }
    const payableBooking = await one(
      `SELECT r.status, ${nativeLifecycleSql()} AS lifecycleStatus FROM reservations r WHERE r.id=?`,
      [payment.reservation_id],
    );
    if (!payableBooking || Number(payableBooking.status) === 3 ||
        !ACTIVE_PAYMENT_STATES.includes(payableBooking.lifecycleStatus)) {
      throw new AppError(409, 'PAYMENT_HOLD_NOT_ACTIVE', 'This reservation is not payable');
    }
    if (payment.status !== 'PAID') {
      await transaction(async (connection) => {
        await connection.execute('SELECT id FROM reservations WHERE id=? FOR UPDATE',[payment.reservation_id]);
        const [locked]=await connection.execute('SELECT status FROM app_payment_transactions WHERE id=? FOR UPDATE',[payment.id]);
        if(locked[0]?.status==='PAID')return;
        await assertNativePaymentBalance(connection,payment);
        await connection.execute(
          `UPDATE app_payment_transactions
           SET status='PAID',
               updated_at=NOW()
           WHERE id=?`,
          [payment.id],
        );

        await connection.execute(
          `UPDATE reservations
           SET payment_status=?,
               status=IF(status=2,2,1),
               updated_at=NOW()
           WHERE id=?`,
          [env.LEGACY_PAID_PAYMENT_STATUS, payment.reservation_id],
        );

        await connection.execute(
          `UPDATE reservations
           SET lifecycle_status=IF(status=2,'COMPLETED',IF(lifecycle_status IN ('PAYMENT_PENDING','PAYMENT_DUE','PAYMENT_FAILED','CHANGE_PAYMENT_PENDING'),'CONFIRMED',lifecycle_status)),
               updated_at=NOW()
           WHERE id=?`,
          [payment.reservation_id],
        );

        await connection.execute(
          `INSERT INTO reservation_payments
           (
             reservation_id,
             total_due,
             payment_amount,
             due_amount,
             payment_type,
             note,
             payment_date,
             status,
             user_id,
             created_at,
             updated_at
           )
           VALUES
           (?, ?, ?, ?, 2, 'Mock mobile payment', NOW(), 1, ?, NOW(), NOW())`,
          [payment.reservation_id, payment.amount, payment.amount, 0, request.auth.userId],
        );
        await markNativeFinancialChange(connection,payment.reservation_id);
      });
    }

    response.json({
      id: payment.id,
      status: 'PAID',
    });
  }),
);

export default router;
