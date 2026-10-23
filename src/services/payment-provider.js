import Stripe from 'stripe';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { env } from '../config/env.js';
import { stripePaymentStatus, toMinorUnits } from './payment-core.js';
export { isStripeConnectivityError } from './stripe-network.js';

export { stripePaymentStatus, toMinorUnits } from './payment-core.js';

let stripeClient;

const stripe = () => {
  if (!stripeClient) {
    // Reduce time spent waiting on an unavailable Stripe API. This does NOT
    // fix DNS, firewall, proxy, or routing problems on the host machine.
    stripeClient = new Stripe(env.STRIPE_SECRET_KEY, {
      timeout: env.STRIPE_TIMEOUT_MS,
      maxNetworkRetries: env.STRIPE_MAX_NETWORK_RETRIES,
      ...(env.STRIPE_PROXY_URL
        ? { httpAgent: new HttpsProxyAgent(env.STRIPE_PROXY_URL) }
        : {}),
    });
  }
  return stripeClient;
};

export const createPaymentIntent = async ({
  paymentId,
  amount,
  currency,
  reservationId,
  customerEmail,
}) => {
  if (env.PAYMENT_PROVIDER === 'mock') {
    return {
      providerReference: `mock_${paymentId}_${Date.now()}`,
      status: 'REQUIRES_ACTION',
      clientSecret: `mock_secret_${paymentId}`,
      publishableKey: null,
      raw: { reservationId },
    };
  }

  const intent = await stripe().paymentIntents.create(
    {
      amount: toMinorUnits(amount),
      currency: currency.toLowerCase(),
      automatic_payment_methods: { enabled: true },
      receipt_email: customerEmail || undefined,
      metadata: {
        paymentId: String(paymentId),
        reservationId: String(reservationId),
      },
    },
    { idempotencyKey: `drive-luxury-payment-${paymentId}` },
  );

  return {
    providerReference: intent.id,
    status: stripePaymentStatus(intent.status),
    clientSecret: intent.client_secret,
    publishableKey: env.STRIPE_PUBLISHABLE_KEY,
    raw: intent,
  };
};

// Retrieve an existing intent instead of charging/creating a second one.
// A paid intent is never confirmable again in the browser.
export const retrievePaymentIntent = async (paymentIntentId) => {
  const intent = await stripe().paymentIntents.retrieve(paymentIntentId);
  return {
    providerReference: intent.id,
    status: stripePaymentStatus(intent.status),
    stripeStatus: intent.status,
    clientSecret: ['requires_payment_method', 'requires_confirmation', 'requires_action']
      .includes(intent.status) ? intent.client_secret : null,
    publishableKey: env.STRIPE_PUBLISHABLE_KEY,
    raw: intent,
  };
};

export const createRefund = async ({ paymentIntentId, paymentId, amount }) => {
  if (env.PAYMENT_PROVIDER === 'mock') {
    return { id: `mock_refund_${paymentId}_${Date.now()}`, status: 'succeeded' };
  }
  return stripe().refunds.create(
    {
      payment_intent: paymentIntentId,
      amount: amount === undefined ? undefined : toMinorUnits(amount),
      metadata: { paymentId: String(paymentId) },
    },
    { idempotencyKey: `drive-luxury-refund-${paymentId}-${amount ?? 'full'}` },
  );
};

export const cancelAbandonedPayment = async (provider, providerReference) => {
  if (provider === 'mock') return true;
  if (provider !== 'stripe' || !providerReference) return false;
  const intent = await stripe().paymentIntents.retrieve(providerReference);
  if (intent.status === 'canceled') return true;
  if (
    !['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(intent.status)
  ) {
    return false; // Never free inventory after a successful or processing payment.
  }
  await stripe().paymentIntents.cancel(providerReference);
  return true;
};

export const constructWebhookEvent = (payload, signature) => {
  if (env.PAYMENT_PROVIDER === 'mock') return JSON.parse(payload.toString('utf8'));
  return stripe().webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
};
