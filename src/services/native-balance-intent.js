import { transaction } from '../db/pool.js';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../common/errors.js';
import { createPaymentIntent, retrievePaymentIntent, cancelAbandonedPayment } from './payment-provider.js';
import { toMinorUnits } from './payment-core.js';
import { assertNativePaymentBalance } from './native-financials.js';
import { syncNativeBalancePayment } from './native-balance-payment.js';
import { parsePaymentPayload, updatedProviderPayload, MAX_UNREFERENCED_STRIPE_AGE_MS } from './booking-payment-policy.js';

export async function initializeNativeBalanceIntent(paymentId, reservationId, userId) {
  const payment = await transaction(async connection => {
    const balance = await syncNativeBalancePayment(connection,reservationId,userId);
    if(balance.blocked) throw new AppError(409,'PAYMENT_RECONCILIATION_REQUIRED',balance.reason);
    const [webPending]=await connection.execute("SELECT id FROM activity_logs WHERE subject_type='Reservation' AND subject_id=? AND feature_name='website_payment' AND action='created' LIMIT 1",[reservationId]);
    if(webPending.length)throw new AppError(409,'WEBSITE_PAYMENT_PENDING','A website payment is still active. Complete or reconcile it before paying in the app');
    const [rows] = await connection.execute('SELECT * FROM app_payment_transactions WHERE id=? FOR UPDATE',[paymentId]);
    const current = rows[0];
    if(current && Number(current.reservation_id)!==Number(reservationId)) throw new AppError(409,'PAYMENT_NOT_RETRYABLE','Payment does not belong to this booking');
    if(!current || !['DEFERRED','CREATED','FAILED','REQUIRES_ACTION'].includes(current.status)) {
      throw new AppError(409,'PAYMENT_NOT_RETRYABLE','Reload the booking to use its current payment action');
    }
    if(current.provider!==env.PAYMENT_PROVIDER) throw new AppError(409,'PAYMENT_PROVIDER_MISMATCH','The payment provider changed; operations review is required');
    if(parsePaymentPayload(current.provider_payload).reconciliationRequired) throw new AppError(409,'PAYMENT_RECONCILIATION_REQUIRED','Review this settlement before another payment');
    const position=await assertNativePaymentBalance(connection,current,{allowMismatch:true});
    if(!position.matches) {
      if(position.balance<=0 || Number(position.currency?.length)!==3)
        throw new AppError(409,'PAYMENT_RECONCILIATION_REQUIRED','This reservation has no payable balance');
      // Serialize cancellation and replacement with refresh/webhook operations.
      // A processing/successful intent can never be automatically replaced.
      if(!current.provider_reference || !(await cancelAbandonedPayment(current.provider,current.provider_reference)))
        throw new AppError(409,'PAYMENT_RECONCILIATION_REQUIRED','The previous payment must settle or be reconciled before collecting the updated balance');
      const oldPayload=parsePaymentPayload(current.provider_payload);
      const retired=[...(oldPayload.retiredProviderReferences??[]),current.provider_reference];
      current.amount=position.balance; current.currency=position.currency;
      current.provider_reference=null; current.status='DEFERRED';
      current.provider_payload=JSON.stringify({checkoutPaymentOption:oldPayload.checkoutPaymentOption??'PAY_LATER',
        purpose:'NATIVE_BALANCE_DUE',nativeTotal:position.total,nativePaid:position.paid,
        providerAttemptKey:randomUUID(),retiredProviderReferences:retired});
      await connection.execute(`UPDATE app_payment_transactions SET amount=?,currency=?,status='DEFERRED',
        provider_reference=NULL,provider_payload=?,updated_at=NOW() WHERE id=?`,
      [current.amount,current.currency,current.provider_payload,current.id]);
    }
    const payload = parsePaymentPayload(current.provider_payload);
    if(!current.provider_reference && current.status!=='DEFERRED') {
      const age=Date.now()-new Date(payload.providerAttemptStartedAt??current.created_at).getTime();
      if(!Number.isFinite(age)||age>MAX_UNREFERENCED_STRIPE_AGE_MS) throw new AppError(409,'PAYMENT_RECONCILIATION_REQUIRED','An earlier provider attempt needs review before retry');
    }
    if(current.status==='DEFERRED'&&!current.provider_reference) {
      current.status='CREATED';
      current.provider_payload=updatedProviderPayload(current.provider_payload,{providerAttemptStartedAt:new Date().toISOString()});
      await connection.execute("UPDATE app_payment_transactions SET status='CREATED',provider_payload=?,updated_at=NOW() WHERE id=?",[current.provider_payload,current.id]);
    }
    return current;
  });
  const intent = payment.provider==='mock'&&payment.provider_reference
    ? {providerReference:payment.provider_reference,status:'REQUIRES_ACTION',clientSecret:`mock_secret_${payment.id}`,publishableKey:null,raw:{reservationId}}
    : payment.provider_reference ? await retrievePaymentIntent(payment.provider_reference)
    : await createPaymentIntent({paymentId:payment.id,reservationId,amount:payment.amount,currency:payment.currency,
      attemptKey:parsePaymentPayload(payment.provider_payload).providerAttemptKey});
  const providerState=intent.stripeStatus??intent.raw?.status;
  const terminal=['succeeded','processing','requires_capture','canceled'].includes(providerState);
  const providerAmountMatches=(intent.raw?.amount==null||Number(intent.raw.amount)===toMinorUnits(payment.amount))&&
    (intent.raw?.currency==null||String(intent.raw.currency).toUpperCase()===payment.currency);
  const saved = await transaction(async connection => {
    await connection.execute('SELECT id FROM reservations WHERE id=? FOR UPDATE',[reservationId]);
    const [rows]=await connection.execute('SELECT * FROM app_payment_transactions WHERE id=? FOR UPDATE',[payment.id]);
    const current=rows[0];
    if(parsePaymentPayload(current.provider_payload).providerAttemptKey!==parsePaymentPayload(payment.provider_payload).providerAttemptKey)
      throw new AppError(409,'PAYMENT_RECONCILIATION_REQUIRED','A newer payment attempt exists; reload the booking');
    const position=await assertNativePaymentBalance(connection,current,{allowMismatch:true});
    // Always retain the recovered reference, even if native staff changed the
    // fare during gateway setup. Never return a stale client secret.
    await connection.execute(`UPDATE app_payment_transactions SET provider_reference=?,provider_payload=?,
      status=IF(status IN ('DEFERRED','CREATED','FAILED','REQUIRES_ACTION'),?,status),updated_at=NOW() WHERE id=?`,
    [intent.providerReference,updatedProviderPayload(current.provider_payload,{...intent.raw,...(!providerAmountMatches?{reconciliationRequired:true}:{})}),
      terminal?current.status:intent.status,payment.id]);
    return {position,closed:!['DEFERRED','CREATED','FAILED','REQUIRES_ACTION'].includes(current.status)};
  });
  if(terminal) throw new AppError(409,'STRIPE_INTENT_NOT_PAYABLE',`Provider reports ${providerState}; verify webhook settlement before continuing`);
  if(!saved.position.matches||saved.closed||!providerAmountMatches) throw new AppError(409,'PAYMENT_RECONCILIATION_REQUIRED','The native or provider balance changed during payment setup. Operations must review the saved provider reference.');
  return intent;
}
