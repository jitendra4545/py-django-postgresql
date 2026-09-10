import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../common/auth.js';
import { LegacyRole } from '../common/legacy.js';
import { asyncHandler, ok, validate } from '../common/http.js';
import { conflict, forbidden, notFound } from '../common/errors.js';
import { exec, one, transaction } from '../db/pool.js';
import { paymentProvider } from '../integrations/payment.js';
import { notifyUser } from './notifications.js';
import { v4 as uuid } from 'uuid';
export const paymentRouter = Router();
paymentRouter.post('/reservations/:reservationId/create', requireAuth, requireRoles(LegacyRole.CUSTOMER), asyncHandler(async (req, res) => {
    const body = validate(z.object({ paymentMethodType: z.enum(['card', 'apple_pay', 'google_pay', 'mock']).default('mock') }), req.body ?? {});
    const reservationId = Number(req.params.reservationId);
    const reservation = await one('SELECT id,customer_id,currency FROM reservations WHERE id=? AND deleted_at IS NULL LIMIT 1', [reservationId]);
    if (!reservation)
        throw notFound('Booking');
    const owner = await one('SELECT user_id FROM customers WHERE id=? AND deleted_at IS NULL LIMIT 1', [reservation.customer_id]);
    if (!owner || owner.user_id !== req.auth.userId)
        throw forbidden();
    const existing = await one(`SELECT * FROM mobile_payment_transactions
      WHERE reservation_id=? AND user_id=?
      ORDER BY created_at DESC LIMIT 1`, [reservationId, req.auth.userId]);
    if (existing && ['REQUIRES_CONFIRMATION', 'AUTHORIZED', 'CAPTURED'].includes(existing.status) && existing.provider_payment_id) {
        return ok(res, existing);
    }
    const amountRow = await one('SELECT total_amount FROM reservation_costs WHERE reservation_id=? AND status=1 ORDER BY id DESC LIMIT 1', [reservationId]);
    if (!amountRow)
        throw notFound('Reservation cost');
    const paymentId = existing && ['FAILED', 'CANCELLED', 'REQUIRES_CONFIRMATION'].includes(existing.status) && !existing.provider_payment_id ? existing.id : uuid();
    if (!existing || paymentId !== existing.id) {
        await exec(`INSERT INTO mobile_payment_transactions (id,reservation_id,user_id,provider,provider_payment_id,amount,currency,status,payment_method_type,created_at,updated_at)
       VALUES (?,?,?,'pending',NULL,?,?,'REQUIRES_CONFIRMATION',?,NOW(),NOW())`, [paymentId, reservationId, req.auth.userId, amountRow.total_amount, reservation.currency || 'EUR', body.paymentMethodType]);
    }
    else {
        await exec("UPDATE mobile_payment_transactions SET payment_method_type=?,status='REQUIRES_CONFIRMATION',failure_reason=NULL,updated_at=NOW() WHERE id=?", [body.paymentMethodType, paymentId]);
    }
    try {
        const intent = await paymentProvider.create({
            amount: Number(amountRow.total_amount),
            currency: reservation.currency || 'EUR',
            reservationId,
            paymentMethodType: body.paymentMethodType
        });
        await exec('UPDATE mobile_payment_transactions SET provider=?,provider_payment_id=?,status=?,updated_at=NOW() WHERE id=?', [intent.provider, intent.providerPaymentId, intent.status, paymentId]);
        return ok(res, { id: paymentId, ...intent, amount: Number(amountRow.total_amount), currency: reservation.currency || 'EUR' }, 201);
    }
    catch (error) {
        await exec("UPDATE mobile_payment_transactions SET provider='payment-provider',status='FAILED',failure_reason=?,updated_at=NOW() WHERE id=?", [error instanceof Error ? error.message : 'Payment provider error', paymentId]);
        throw conflict('PAYMENT_PROVIDER_ERROR', 'Could not initialize payment. You can safely retry this endpoint.');
    }
}));
paymentRouter.post('/:id/confirm', requireAuth, requireRoles(LegacyRole.CUSTOMER), asyncHandler(async (req, res) => {
    const payment = await one('SELECT * FROM mobile_payment_transactions WHERE id=?', [req.params.id]);
    if (!payment)
        throw notFound('Payment');
    if (payment.user_id !== req.auth.userId)
        throw forbidden();
    if (payment.status === 'CAPTURED')
        return ok(res, payment);
    if (!['REQUIRES_CONFIRMATION', 'AUTHORIZED'].includes(payment.status))
        throw conflict('PAYMENT_NOT_CONFIRMABLE', `Payment is ${payment.status}`);
    if (!payment.provider_payment_id)
        throw conflict('PAYMENT_PROVIDER_NOT_INITIALIZED', 'Payment provider session has not been created. Retry payment initialization first.');
    const confirmed = await paymentProvider.confirm(payment.provider_payment_id);
    await transaction(async (conn) => {
        await exec('UPDATE mobile_payment_transactions SET status=?,updated_at=NOW() WHERE id=?', [confirmed.status, payment.id], conn);
        if (confirmed.status === 'CAPTURED') {
            await exec('UPDATE reservations SET payment_status=1,payment_method=2,updated_at=NOW() WHERE id=?', [payment.reservation_id], conn);
            const existing = await one('SELECT id FROM reservation_payments WHERE reservation_id=? AND note=? AND deleted_at IS NULL LIMIT 1', [payment.reservation_id, `mobile:${payment.id}`], conn);
            if (!existing) {
                await exec(`INSERT INTO reservation_payments (reservation_id,total_due,payment_amount,due_amount,payment_type,note,payment_date,status,user_id,created_at,updated_at)
           VALUES (?,?,?,?,2,?,DATE_FORMAT(NOW(),'%Y-%m-%d %H:%i:%s'),1,?,NOW(),NOW())`, [payment.reservation_id, payment.amount, payment.amount, 0, `mobile:${payment.id}`, req.auth.userId], conn);
            }
            await exec('INSERT INTO reservation_status_events (reservation_id,actor_user_id,actor_role,status,note,metadata,occurred_at) VALUES (?,? ,\'CUSTOMER\',\'PAYMENT_CAPTURED\',\'Payment confirmed\',?,NOW())', [payment.reservation_id, req.auth.userId, JSON.stringify({ paymentId: payment.id, amount: payment.amount, currency: payment.currency })], conn);
        }
    });
    await notifyUser(req.auth.userId, 'PAYMENT_CAPTURED', 'Payment successful', `Payment for reservation ${payment.reservation_id} was captured.`, { reservationId: payment.reservation_id, paymentId: payment.id });
    return ok(res, { ...payment, status: confirmed.status });
}));
paymentRouter.get('/:id', requireAuth, asyncHandler(async (req, res) => {
    const payment = await one('SELECT * FROM mobile_payment_transactions WHERE id=?', [req.params.id]);
    if (!payment)
        throw notFound('Payment');
    if (payment.user_id !== req.auth.userId && ![LegacyRole.ADMIN, LegacyRole.USER].includes(req.auth.role))
        throw forbidden();
    return ok(res, payment);
}));
paymentRouter.post('/webhooks/mock', asyncHandler(async (req, res) => {
    const body = validate(z.object({ externalEventId: z.string().default(() => uuid()), paymentId: z.string(), status: z.enum(['CAPTURED', 'FAILED', 'CANCELLED']) }), req.body);
    const duplicate = await one('SELECT id FROM mobile_webhook_events WHERE provider=\'mock\' AND external_event_id=?', [body.externalEventId]);
    if (duplicate)
        return ok(res, { duplicate: true });
    await transaction(async (conn) => {
        await exec('INSERT INTO mobile_webhook_events (provider,external_event_id,event_type,payload,processed_at,created_at) VALUES (\'mock\',?,?,?,NOW(),NOW())', [body.externalEventId, `payment.${body.status.toLowerCase()}`, JSON.stringify(body)], conn);
        const payment = await one('SELECT * FROM mobile_payment_transactions WHERE id=?', [body.paymentId], conn);
        if (!payment)
            throw notFound('Payment');
        await exec('UPDATE mobile_payment_transactions SET status=?,updated_at=NOW() WHERE id=?', [body.status, body.paymentId], conn);
        if (body.status === 'CAPTURED')
            await exec('UPDATE reservations SET payment_status=1,payment_method=2,updated_at=NOW() WHERE id=?', [payment.reservation_id], conn);
    });
    return ok(res, { processed: true });
}));
