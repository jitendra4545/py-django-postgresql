import { nativeLifecycleSql, nativeServiceCodeSql } from './legacy-reservation-adapter.js';
import Decimal from 'decimal.js';
import { env } from '../config/env.js';
import { transaction } from '../db/pool.js';
import { assertNativePaymentBalance } from './native-financials.js';
import { ACTIVE_PAYMENT_STATES, parsePaymentPayload } from './booking-payment-policy.js';

const openStates = ['DEFERRED', 'CREATED', 'FAILED', 'REQUIRES_ACTION'];
const blocked = (reason, position) => ({ payment: null, blocked: true, reason, position });

// Only an untouched DEFERRED transaction may change amount. Once provider setup
// starts, a retry must cancel the old intent before replacing the amount.
// This never calls a gateway and never turns an operating expense into a fare.
export async function syncNativeBalancePayment(connection, reservationId, userId, { lifecycleStatus } = {}) {
  const [bookings] = await connection.execute(`SELECT r.id,r.status,r.payment_status,
    ${nativeLifecycleSql()} AS lifecycle_status,COALESCE(r.created_by_user_id,c.user_id,r.user_id) AS created_by_user_id,
    ${nativeServiceCodeSql()} AS service_code FROM reservations r LEFT JOIN customers c ON c.id=r.customer_id
    WHERE r.id=? AND r.deleted_at IS NULL FOR UPDATE`, [reservationId]);
  const [payments] = await connection.execute(`SELECT * FROM app_payment_transactions
    WHERE reservation_id=? ORDER BY id DESC FOR UPDATE`, [reservationId]);
  const booking = bookings[0];
  const currentLifecycle=booking?.lifecycle_status;
  if (!booking || Number(booking.status) === 3 || !ACTIVE_PAYMENT_STATES.includes(lifecycleStatus ?? booking.lifecycle_status)) {
    return { payment: payments[0] ?? null, blocked: false };
  }
  const position = await assertNativePaymentBalance(connection,
    { reservation_id: reservationId, amount: 0, currency: '' }, { allowMismatch: true });
  const [webPending]=await connection.execute("SELECT id FROM activity_logs WHERE subject_type='Reservation' AND subject_id=? AND feature_name='website_payment' AND action='created' LIMIT 1",[reservationId]);
  if(webPending.length)return {...blocked('WEBSITE_PAYMENT_PENDING',position),payment:payments[0]??null};
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
  let resolvedLifecycle=currentLifecycle;
  if(position.balance===0&&position.total>0&&['PAYMENT_DUE','PAYMENT_FAILED','CHANGE_PAYMENT_PENDING'].includes(booking.lifecycle_status)){
    resolvedLifecycle=Number(booking.status)===2?'COMPLETED':'CONFIRMED';
    await connection.execute('UPDATE reservations SET lifecycle_status=?,updated_at=NOW() WHERE id=?',[resolvedLifecycle,reservationId]);
  }
  if (current) {
    if(position.balance<=0 && current.provider_reference)return {...blocked('NATIVE_BALANCE_ALREADY_PAID',position),payment:current};
    if (current.status === 'DEFERRED' && !current.provider_reference) {
      if (position.balance === 0) {
        await connection.execute("UPDATE app_payment_transactions SET status='CANCELLED',updated_at=NOW() WHERE id=?", [current.id]);
        return { payment: { ...current, status: 'CANCELLED' }, blocked: false, position, lifecycleStatus:resolvedLifecycle };
      }
      if (Number(current.amount) !== position.balance || current.currency !== position.currency) {
        await connection.execute('UPDATE app_payment_transactions SET amount=?,currency=?,updated_at=NOW() WHERE id=?', [position.balance, position.currency, current.id]);
      }
      return { payment: { ...current, amount: position.balance, currency: position.currency }, blocked: false, position, lifecycleStatus:resolvedLifecycle };
    }
    if (current.currency !== position.currency || !new Decimal(current.amount).equals(position.balance)) {
      // The retry endpoint cancels this non-settled provider intent before
      // replacing its amount. Never modify an initialized Stripe amount here.
      if(current.provider_reference && ['FAILED','REQUIRES_ACTION','CREATED'].includes(current.status))
        return {payment:{...current,amount:position.balance,currency:position.currency},position,blocked:false,lifecycleStatus:resolvedLifecycle,needsReprice:true};
      return blocked('ACTIVE_PROVIDER_AMOUNT_CHANGED', position);
    }
    return { payment: current, blocked: false, position, lifecycleStatus:resolvedLifecycle };
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
    blocked: false, position, lifecycleStatus:resolvedLifecycle, created: true };
}

export async function refreshNativeBalancePayment(reservationId, userId) {
  for (let attempt = 0; ; attempt++) {
    try { return await transaction(c => syncNativeBalancePayment(c, reservationId, userId)); }
    catch (error) { if (error.code !== 'ER_LOCK_DEADLOCK' || attempt >= 2) throw error; }
  }
}
