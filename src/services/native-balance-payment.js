import Decimal from 'decimal.js';
import { env } from '../config/env.js';
import { transaction } from '../db/pool.js';
import { assertNativePaymentBalance } from './native-financials.js';
import { SAVED_UNPAID_STATES, parsePaymentPayload } from './booking-payment-policy.js';

const openStates = ['DEFERRED', 'CREATED', 'FAILED', 'REQUIRES_ACTION'];
const blocked = (reason, position) => ({ payment: null, blocked: true, reason, position });

// Only an untouched DEFERRED transaction may change amount. Once provider setup
// starts, retain its identity/reference and require reconciliation for a mismatch.
// This never calls a gateway and never turns an operating expense into a fare.
export async function syncNativeBalancePayment(connection, reservationId, userId, { lifecycleStatus } = {}) {
  const [payments] = await connection.execute(`SELECT * FROM app_payment_transactions
    WHERE reservation_id=? ORDER BY id DESC FOR UPDATE`, [reservationId]);
  const [bookings] = await connection.execute(`SELECT id,status,payment_status,lifecycle_status,
    created_by_user_id,service_code FROM reservations WHERE id=? AND deleted_at IS NULL FOR UPDATE`, [reservationId]);
  const booking = bookings[0];
  if (!booking || Number(booking.status) === 3 || !SAVED_UNPAID_STATES.includes(lifecycleStatus ?? booking.lifecycle_status)) {
    return { payment: payments[0] ?? null, blocked: false };
  }
  const position = await assertNativePaymentBalance(connection,
    { reservation_id: reservationId, amount: 0, currency: '' }, { allowMismatch: true });
  const paidInApp = payments.filter(p => p.status === 'PAID')
    .reduce((s, p) => s.plus(p.amount), new Decimal(0));
  if(payments.some(p=>p.status==='PAID'&&p.currency!==position.currency)) return blocked('SETTLED_CURRENCY_CHANGED',position);
  if (payments.some(p => p.refund_reference || ['REFUNDED', 'PARTIALLY_REFUNDED'].includes(p.status) || parsePaymentPayload(p.provider_payload).reconciliationRequired)) {
    return blocked('REFUND_OR_SETTLEMENT_REVIEW_REQUIRED', position);
  }
  if (paidInApp.minus(position.paid).gt('0.005') ||
      (Number(booking.payment_status) === Number(env.LEGACY_PAID_PAYMENT_STATUS) && position.paid === 0 && position.total > 0)) {
    return blocked('NATIVE_PAYMENT_LEDGER_INCOMPLETE', position);
  }
  const open = payments.filter(p => openStates.includes(p.status));
  if (open.length > 1 || payments.some(p => ![...openStates, 'PAID', 'CANCELLED', 'SUPERSEDED'].includes(p.status))) {
    return blocked('MULTIPLE_OR_UNKNOWN_PAYMENT_ATTEMPTS', position);
  }
  const current = open[0];
  let resolvedLifecycle;
  if(position.balance===0&&position.total>0&&['PAYMENT_DUE','PAYMENT_FAILED','CHANGE_PAYMENT_PENDING'].includes(booking.lifecycle_status)){
    resolvedLifecycle=Number(booking.status)===2?'COMPLETED':'CONFIRMED';
    await connection.execute('UPDATE reservations SET lifecycle_status=?,updated_at=NOW() WHERE id=?',[resolvedLifecycle,reservationId]);
  }
  if (current) {
    if (current.status === 'DEFERRED' && !current.provider_reference) {
      if (position.balance === 0) {
        await connection.execute("UPDATE app_payment_transactions SET status='CANCELLED',updated_at=NOW() WHERE id=?", [current.id]);
        return { payment: { ...current, status: 'CANCELLED' }, blocked: false, position, lifecycleStatus:resolvedLifecycle };
      }
      if (Number(current.amount) !== position.balance || current.currency !== position.currency) {
        await connection.execute('UPDATE app_payment_transactions SET amount=?,currency=?,updated_at=NOW() WHERE id=?', [position.balance, position.currency, current.id]);
      }
      return { payment: { ...current, amount: position.balance, currency: position.currency }, blocked: false, position };
    }
    if (current.currency !== position.currency || !new Decimal(current.amount).equals(position.balance)) {
      return blocked('ACTIVE_PROVIDER_AMOUNT_CHANGED', position);
    }
    return { payment: current, blocked: false, position };
  }
  if (position.balance <= 0) return { payment: payments[0] ?? null, blocked: false, position, lifecycleStatus:resolvedLifecycle };
  const payer = booking.created_by_user_id || userId;
  if (!payer || !booking.service_code) return blocked('MOBILE_PAYER_NOT_LINKED', position);
  const payload = JSON.stringify({ checkoutPaymentOption: 'PAY_LATER', purpose: 'NATIVE_BALANCE_DUE',
    nativeTotal: position.total, nativePaid: position.paid });
  const [created] = await connection.execute(`INSERT INTO app_payment_transactions
    (reservation_id,user_id,provider,amount,currency,status,idempotency_key,provider_payload,created_at,updated_at)
    VALUES (?,?,?,?,?,'DEFERRED',?,?,NOW(),NOW())`,
  [reservationId, payer, env.PAYMENT_PROVIDER, position.balance, position.currency,
    `native-balance-${reservationId}-${payments[0]?.id ?? 0}`, payload]);
  return { payment: { id: created.insertId, reservation_id: reservationId, user_id: payer,
    provider: env.PAYMENT_PROVIDER, amount: position.balance, currency: position.currency,
    status: 'DEFERRED', provider_reference: null, provider_payload: payload, created_at: new Date() },
    blocked: false, position, created: true };
}

export async function refreshNativeBalancePayment(reservationId, userId) {
  for (let attempt = 0; ; attempt++) {
    try { return await transaction(c => syncNativeBalancePayment(c, reservationId, userId)); }
    catch (error) { if (error.code !== 'ER_LOCK_DEADLOCK' || attempt >= 2) throw error; }
  }
}
