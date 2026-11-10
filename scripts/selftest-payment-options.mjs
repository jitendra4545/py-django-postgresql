import { URL } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  paymentAction, canRetryPayment, checkoutPaymentOption,
  updatedProviderPayload, ACTIVE_PAYMENT_STATES,
} from '../src/services/booking-payment-policy.js';

const old = '2026-01-01T00:00:00Z';
const recent = new Date(Date.now() - 60_000).toISOString();
const original = { lifecycleStatus: 'PAYMENT_PENDING', legacyStatus: 0, paymentStatus: 'CREATED', quoteIsValid: 1, createdAt: recent, providerReference: null };

test('Pay Later defers Stripe and remains eligible beyond quote expiry', () => {
  assert.equal(canRetryPayment({ ...original, lifecycleStatus: 'PAYMENT_DUE', paymentStatus: 'DEFERRED', createdAt: old, quoteIsValid: 0 }), true);
});

test('existing failed payment with a Stripe reference remains retryable', () => {
  assert.equal(canRetryPayment({ ...original, lifecycleStatus: 'PAYMENT_FAILED', paymentStatus: 'FAILED', createdAt: old, providerReference: 'pi_known', quoteIsValid: 0 }), true);
});

test('do not recreate a potentially charged 24h-old intent with no reference', () => {
  assert.equal(canRetryPayment({ ...original, lifecycleStatus: 'PAYMENT_FAILED', paymentStatus: 'FAILED', createdAt: old, quoteIsValid: 0 }), false);
});

test('old PAY_NOW holds expire when quote does', () => {
  assert.equal(canRetryPayment({ ...original, quoteIsValid: 0 }), false);
});

test('never offer retry to paid, processing or cancelled payments', () => {
  for (const paymentStatus of ['PAID', 'PROCESSING', 'REFUNDED', 'CANCELLED']) {
    assert.equal(canRetryPayment({ ...original, lifecycleStatus: 'PAYMENT_DUE', paymentStatus }), false);
  }
  assert.equal(canRetryPayment({ ...original, lifecycleStatus: 'CANCELLED', paymentStatus: 'FAILED' }), false);
  assert.equal(canRetryPayment({ ...original, lifecycleStatus: 'PAYMENT_FAILED', legacyStatus: 3, paymentStatus: 'FAILED' }), false);
});

test('checkout option persists through provider/webhook payload updates', () => {
  const payload = updatedProviderPayload(JSON.stringify({ checkoutPaymentOption: 'PAY_LATER' }), { object: 'payment_intent', id: 'pi_x' });
  assert.equal(checkoutPaymentOption(payload), 'PAY_LATER');
  assert.equal(JSON.parse(payload).id, 'pi_x');
  assert.equal(checkoutPaymentOption('{}'), 'PAY_NOW');
});

test('bookings expose a usable payment action without exposing provider secrets', () => {
  const action = paymentAction({ payment: {
    id: 91,
    status: 'DEFERRED',
    createdAt: old,
    providerPayload: { checkoutPaymentOption: 'PAY_LATER', client_secret: 'must-hide' },
  }, lifecycleStatus: 'PAYMENT_DUE', legacyStatus: 0, quoteIsValid: 0 });
  assert.deepEqual(action, { paymentId: 91, paymentState: 'DEFERRED', paymentOption: 'PAY_LATER', canRetryPayment: true });
});

test('payment success accepts all durable outstanding payment lifecycles', () => {
  assert.ok(ACTIVE_PAYMENT_STATES.includes('PAYMENT_DUE'));
  assert.ok(ACTIVE_PAYMENT_STATES.includes('PAYMENT_FAILED'));
});

test('hold expiry still targets only temporary PAYMENT_PENDING holds', async () => {
  const fs = await import('node:fs');
  const sweep = fs.readFileSync(new URL('../src/services/payment-holds.js', import.meta.url), 'utf8');
  assert.match(sweep, /arm\.lifecycle_status='PAYMENT_PENDING'/);
  assert.doesNotMatch(sweep, /arm\.lifecycle_status\s+IN\s*\([^)]*PAYMENT_DUE/);
});

test('later approved change is durable beyond the original quote',()=>{
  assert.equal(canRetryPayment({...original,lifecycleStatus:'CHANGE_PAYMENT_PENDING',paymentStatus:'DEFERRED',createdAt:old,quoteIsValid:0}),true);
});
test('provider metadata refresh retains native balance purpose and attempt clock',()=>{
  const before={purpose:'NATIVE_BALANCE_DUE',nativeTotal:330,nativePaid:300,providerAttemptStartedAt:recent,reconciliationRequired:true};
  const after=JSON.parse(updatedProviderPayload(before,{id:'pi_known'}));
  for(const [key,value] of Object.entries(before))assert.deepEqual(after[key],value);
});
test('a first deferred attempt today remains retryable when its booking is old',()=>{
  assert.equal(paymentAction({payment:{id:8,status:'CREATED',createdAt:old,providerPayload:{providerAttemptStartedAt:recent}},lifecycleStatus:'COMPLETED',legacyStatus:2,quoteIsValid:0}).canRetryPayment,true);
});
