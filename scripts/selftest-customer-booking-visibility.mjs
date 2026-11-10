import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bookingListStatusCondition } from '../src/services/booking-list-status.js';
import { paymentAction } from '../src/services/booking-payment-policy.js';

const makePayment = ({ id, state, option, reference = null, createdAt = '2026-11-09T00:00:00Z' }) => ({
  id, status: state, providerReference: reference, createdAt,
  providerPayload: { checkoutPaymentOption: option },
});

test('All bookings applies no lifecycle/payment filter', () => {
  assert.deepEqual(bookingListStatusCondition(undefined), { clause: null, params: [] });
  assert.deepEqual(bookingListStatusCondition(''), { clause: null, params: [] });
});

test('Unpaid tab includes both Pay Later and failed payments', () => {
  for (const value of ['UNPAID', 'PAYMENT_REQUIRED']) {
    const filter = bookingListStatusCondition(value);
    assert.match(filter.clause, /PAYMENT_DUE/);
    assert.match(filter.clause, /PAYMENT_FAILED/);
    assert.deepEqual(filter.params, []);
  }
});

test('Upcoming includes nonterminal future reservations without excluding unpaid', () => {
  const { clause, params } = bookingListStatusCondition('UPCOMING');
  assert.match(clause, /pick_up_date >= CURRENT_DATE/);
  assert.match(clause, /NOT IN \('COMPLETED','CANCELLED','REJECTED'\)/);
  assert.doesNotMatch(clause, /PAYMENT_DUE|PAYMENT_FAILED/);
  assert.deepEqual(params, []);
});

test('Explicit status filters preserve existing bound-parameter behavior', () => {
  assert.deepEqual(bookingListStatusCondition('PAYMENT_DUE'), { clause: 'arm.lifecycle_status = ?', params: ['PAYMENT_DUE'] });
  assert.deepEqual(bookingListStatusCondition('PAYMENT_FAILED'), { clause: 'arm.lifecycle_status = ?', params: ['PAYMENT_FAILED'] });
  assert.deepEqual(bookingListStatusCondition('CONFIRMED'), { clause: 'arm.lifecycle_status = ?', params: ['CONFIRMED'] });
});

test('Pay Later list item exposes payment action on same booking', () => {
  const result = paymentAction({
    payment: makePayment({ id: 41, state: 'DEFERRED', option: 'PAY_LATER' }),
    lifecycleStatus: 'PAYMENT_DUE', legacyStatus: 0, quoteIsValid: 0,
  });
  assert.deepEqual(result, { paymentId: 41, paymentState: 'DEFERRED', paymentOption: 'PAY_LATER', canRetryPayment: true });
});

test('Failed Pay Now list item exposes retry action on same booking', () => {
  const result = paymentAction({
    payment: makePayment({ id: 42, state: 'FAILED', option: 'PAY_NOW', reference: 'pi_known' }),
    lifecycleStatus: 'PAYMENT_FAILED', legacyStatus: 0, quoteIsValid: 0,
  });
  assert.deepEqual(result, { paymentId: 42, paymentState: 'FAILED', paymentOption: 'PAY_NOW', canRetryPayment: true });
});

test('Older unreconciled failed payments remain visible even if unsafe to retry', () => {
  const result = paymentAction({
    payment: makePayment({ id: 43, state: 'FAILED', option: 'PAY_NOW', createdAt: '2020-01-01T00:00:00Z' }),
    lifecycleStatus: 'PAYMENT_FAILED', legacyStatus: 0, quoteIsValid: 0,
  });
  assert.equal(result.paymentId, 43);
  assert.equal(result.paymentState, 'FAILED');
  assert.equal(result.canRetryPayment, false);
});
