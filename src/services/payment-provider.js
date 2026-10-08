import Stripe from 'stripe';
import { env } from '../config/env.js';
import { stripePaymentStatus, toMinorUnits } from './payment-core.js';

export { stripePaymentStatus, toMinorUnits } from './payment-core.js';

let stripeClient;

const stripe = () => {
  if (!stripeClient) stripeClient = new Stripe(env.STRIPE_SECRET_KEY);
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

export const constructWebhookEvent = (payload, signature) => {
  if (env.PAYMENT_PROVIDER === 'mock') return JSON.parse(payload.toString('utf8'));
  return stripe().webhooks.constructEvent(payload, signature, env.STRIPE_WEBHOOK_SECRET);
};
