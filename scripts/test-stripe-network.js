import assert from 'node:assert/strict';
import {
  connectionFailureCode,
  isStripeConnectivityError,
  stripeServiceErrorCode,
} from '../src/services/stripe-network.js';

assert.equal(isStripeConnectivityError({ type: 'StripeConnectionError' }), true);
assert.equal(stripeServiceErrorCode({ type: 'StripeConnectionError', raw: { detail: { code: 'ETIMEDOUT' } } }), 'STRIPE_UNREACHABLE');
assert.equal(connectionFailureCode({ raw: { detail: { errors: [{ code: 'ENETUNREACH' }] } } }), 'ENETUNREACH');
assert.equal(stripeServiceErrorCode({ type: 'StripeAuthenticationError' }), 'STRIPE_CONFIGURATION_ERROR');
assert.equal(stripeServiceErrorCode({ type: 'StripeCardError', code: 'card_declined' }), 'STRIPE_REQUEST_FAILED');
assert.equal(isStripeConnectivityError({ type: 'StripeCardError', code: 'card_declined' }), false);
console.log('Stripe error classification tests passed.');
