import Decimal from 'decimal.js';

export const toMinorUnits = (amount) =>
  new Decimal(amount).times(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

export const stripePaymentStatus = (status) =>
  ({
    succeeded: 'PAID',
    processing: 'PROCESSING',
    requires_action: 'REQUIRES_ACTION',
    requires_confirmation: 'REQUIRES_ACTION',
    requires_payment_method: 'FAILED',
    canceled: 'CANCELLED',
  })[status] ?? 'CREATED';
