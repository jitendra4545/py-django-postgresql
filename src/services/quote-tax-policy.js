import { AppError } from '../common/errors.js';

export const QUOTE_TAX_POLICY = 'BASE_FEE_ONLY_V1';

// Persisted inside existing quote_data JSON and omitted from public responses.
// An unexpired quote from before the correction must be recalculated at checkout.
export function assertCurrentQuoteTaxPolicy(quote) {
  if (quote?.__native?.taxPolicy !== QUOTE_TAX_POLICY) {
    throw new AppError(409,'QUOTE_STALE','The pricing policy changed. Request a fresh quote before checkout.');
  }
}
