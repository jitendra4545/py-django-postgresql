import { transaction } from '../db/pool.js';
import { env } from '../config/env.js';
import { AppError } from '../common/errors.js';
import { createPaymentIntent, retrievePaymentIntent } from './payment-provider.js';
import { toMinorUnits } from './payment-core.js';
import { assertNativePaymentBalance } from './native-financials.js';
import { syncNativeBalancePayment } from './native-balance-payment.js';
import { parsePaymentPayload, updatedProviderPayload, MAX_UNREFERENCED_STRIPE_AGE_MS } from './booking-payment-policy.js';

export async function initializeNativeBalanceIntent(paymentId, reservationId, userId) {
  const payment = await transaction(async connection => {
    const balance = await syncNativeBalancePayment(connection,reservationId,userId);
    if(balance.blocked) throw new AppError(409,'PAYMENT_RECONCILIATION_REQUIRED',balance.reason);
    const [rows] = await connection.execute('SELECT * FROM app_payment_transactions WHERE id=? FOR UPDATE',[paymentId]);
    const current = rows[0];
    if(!current || !['DEFERRED','CREATED','FAILED','REQUIRES_ACTION'].includes(current.status)) {
      throw new AppError(409,'PAYMENT_NOT_RETRYABLE','Reload the booking to use its current payment action');
    }
    if(current.provider!==env.PAYMENT_PROVIDER) throw new AppError(409,'PAYMENT_PROVIDER_MISMATCH','The payment provider changed; operations review is required');
    if(parsePaymentPayload(current.provider_payload).reconciliationRequired) throw new AppError(409,'PAYMENT_RECONCILIATION_REQUIRED','Review this settlement before another payment');
    await assertNativePaymentBalance(connection,current);
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
    : await createPaymentIntent({paymentId:payment.id,reservationId,amount:payment.amount,currency:payment.currency});
  const providerState=intent.stripeStatus??intent.raw?.status;
  const terminal=['succeeded','processing','requires_capture','canceled'].includes(providerState);
  const providerAmountMatches=(intent.raw?.amount==null||Number(intent.raw.amount)===toMinorUnits(payment.amount))&&
    (intent.raw?.currency==null||String(intent.raw.currency).toUpperCase()===payment.currency);
  const saved = await transaction(async connection => {
    const [rows]=await connection.execute('SELECT * FROM app_payment_transactions WHERE id=? FOR UPDATE',[payment.id]);
    const current=rows[0];
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
