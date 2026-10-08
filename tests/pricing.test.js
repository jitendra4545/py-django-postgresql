import { describe, expect, it } from 'vitest';
import { computeQuoteBreakdown } from '../src/services/pricing-core.js';

describe('pricing arithmetic', () => {
  it('treats configured tax amount as a percentage', () => {
    const result = computeQuoteBreakdown({
      serviceCode: 'TRANSFER',
      rateAmount: 1000,
      durationDays: 1,
      options: [],
      optionSelections: [],
      taxes: [{ id: 1, title: 'VAT', amount: 7.7 }],
    });
    expect(result.totalTax).toBe(77);
    expect(result.total).toBe(1077);
  });

  it('uses fixed precision for money', () => {
    const result = computeQuoteBreakdown({
      serviceCode: 'CAR_RENTAL',
      rateAmount: 100,
      durationDays: 2,
      options: [
        { id: 10, title: 'Child seat', based_on: 1, rate_type: 1, amount: 10, taxable: 1 },
        { id: 11, title: 'Meet and greet', based_on: 2, rate_type: 2, amount: 5, taxable: 2 },
      ],
      optionSelections: [
        { optionId: 10, quantity: 2 },
        { optionId: 11, quantity: 1 },
      ],
      taxes: [{ id: 1, title: 'VAT', amount: 10 }],
    });
    expect(result.baseRate).toBe(200);
    expect(result.taxableOptions).toBe(40);
    expect(result.nonTaxableOptions).toBe(10);
    expect(result.totalTax).toBe(24);
    expect(result.total).toBe(274);
  });
});
