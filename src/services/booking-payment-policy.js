/**
 * Payment state policy for existing reservations and payment transactions.
 * Uses existing VARCHAR/JSON columns; no database migration is required.
 * PAY_LATER and a genuine payment failure retain the vehicle reservation;
 * unattempted PAY_NOW holds remain subject to the existing expiry worker.
 */
export const PAYMENT_OPTIONS = Object.freeze({
  PAY_NOW: 'PAY_NOW',
  PAY_LATER: 'PAY_LATER',
});

export const SAVED_UNPAID_STATES = Object.freeze(['PAYMENT_DUE', 'PAYMENT_FAILED','CHANGE_PAYMENT_PENDING','CONFIRMED','ASSIGNED',
  'PREPARING','ON_THE_WAY','ARRIVED','WAITING','PASSENGER_ONBOARD','IN_SERVICE','AT_STOP','DROPOFF_REACHED','COMPLETED','NO_SHOW']);
export const ACTIVE_PAYMENT_STATES = Object.freeze([
  'PAYMENT_PENDING',
  'CHANGE_PAYMENT_PENDING',
  ...SAVED_UNPAID_STATES,
]);

export const RETRYABLE_PAYMENT_STATES = Object.freeze([
  'CREATED',
  'FAILED',
  'REQUIRES_ACTION',
  'DEFERRED',
]);

export const MAX_UNREFERENCED_STRIPE_AGE_MS = 23 * 60 * 60_000;

export const parsePaymentPayload = (value) => {
  if (!value) return {};
  try {
    const data = typeof value === 'string' || Buffer.isBuffer(value)
      ? JSON.parse(value.toString())
      : value;
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
};

export const checkoutPaymentOption = (payload) => {
  const option = parsePaymentPayload(payload).checkoutPaymentOption;
  return option === PAYMENT_OPTIONS.PAY_LATER ? PAYMENT_OPTIONS.PAY_LATER : PAYMENT_OPTIONS.PAY_NOW;
};

// Preserve the checkout selection when provider SDK/webhook payloads are refreshed.
export const updatedProviderPayload = (previous, latest) => {
  const before = parsePaymentPayload(previous);
  const after = parsePaymentPayload(latest);
  const retained = Object.fromEntries(['purpose','nativeTotal','nativePaid','providerAttemptStartedAt','reconciliationRequired','providerAttemptKey','retiredProviderReferences']
    .filter(key => Object.hasOwn(before,key)).map(key=>[key,before[key]]));
  return JSON.stringify({ ...retained, ...after, ...(before.checkoutPaymentOption
    ? { checkoutPaymentOption: checkoutPaymentOption(before) }
    : {}) });
};

export const canRetryPayment = ({
  lifecycleStatus,
  legacyStatus,
  paymentStatus,
  quoteIsValid,
  createdAt,
  providerReference,
  now = Date.now(),
}) => {
  if (Number(legacyStatus) === 3 || !ACTIVE_PAYMENT_STATES.includes(lifecycleStatus)) return false;
  if (!RETRYABLE_PAYMENT_STATES.includes(paymentStatus)) return false;
  if (!SAVED_UNPAID_STATES.includes(lifecycleStatus) && !Number(quoteIsValid)) {
    return false;
  }
  // Do not create a new Stripe Intent after its 24h idempotency record may expire.
  // A deferred payment has never attempted Stripe, so the restriction does not apply.
  if (!providerReference && paymentStatus !== 'DEFERRED') {
    const age = now - new Date(createdAt).getTime();
    if (!Number.isFinite(age) || age > MAX_UNREFERENCED_STRIPE_AGE_MS) return false;
  }
  return true;
};

export const paymentAction = ({ payment, lifecycleStatus, legacyStatus, quoteIsValid }) => {
  if (!payment) return {
    paymentId: null,
    paymentState: null,
    paymentOption: null,
    canRetryPayment: false,
  };
  return {
    paymentId: payment.id,
    paymentState: payment.status,
    paymentOption: checkoutPaymentOption(payment.providerPayload ?? payment.provider_payload),
    canRetryPayment: canRetryPayment({
      lifecycleStatus,
      legacyStatus,
      paymentStatus: payment.status,
      quoteIsValid,
      createdAt: parsePaymentPayload(payment.providerPayload ?? payment.provider_payload).providerAttemptStartedAt ?? payment.createdAt ?? payment.created_at,
      providerReference: payment.providerReference ?? payment.provider_reference,
    }),
  };
};
