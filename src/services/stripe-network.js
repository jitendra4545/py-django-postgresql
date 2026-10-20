// Stripe network failures are distinct from payment/card declines.
// Kept separate from the Stripe SDK so diagnostics and tests need no secrets.
const NETWORK_CODES = new Set([
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENETUNREACH',
  'EHOSTUNREACH', 'EAI_AGAIN', 'ENOTFOUND', 'EPIPE',
]);

export const connectionFailureCode = (error) => {
  const candidates = [
    error?.code,
    error?.raw?.code,
    error?.raw?.detail?.code,
    error?.cause?.code,
    ...(error?.raw?.detail?.errors ?? []).map((entry) => entry?.code),
  ];
  return candidates.find((code) => NETWORK_CODES.has(code)) ?? null;
};

export const isStripeConnectivityError = (error) =>
  error?.type === 'StripeConnectionError' ||
  error?.name === 'StripeConnectionError' ||
  error?.type === 'StripeAPIConnectionError' ||
  Boolean(connectionFailureCode(error));

export const isStripeConfigurationError = (error) =>
  ['StripeAuthenticationError', 'StripePermissionError'].includes(error?.type);

export const stripeServiceErrorCode = (error) => {
  if (isStripeConnectivityError(error)) return 'STRIPE_UNREACHABLE';
  if (isStripeConfigurationError(error)) return 'STRIPE_CONFIGURATION_ERROR';
  return 'STRIPE_REQUEST_FAILED';
};
