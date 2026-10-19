import { describe, expect, it } from 'vitest';
import { computeQuoteBreakdown } from '../src/services/pricing-core.js';
import {
  LEGACY_SERVICE_TYPES,
  amountForDuration,
  billableUnits,
  currencyForCountry,
  transferTierAmount,
} from '../src/services/legacy-pricing-rules.js';

const startAt = '2026-10-20T10:00:00.000Z';

describe('existing PHP pricing rules', () => {
  it('maps service types into the shared reservation schema', () => {
    expect(LEGACY_SERVICE_TYPES).toEqual({ CHAUFFEUR: 1, CAR_RENTAL: 2, TRANSFER: 3 });
  });

  it('uses rental day grace and hourly minimum', () => {
    expect(
      billableUnits({ serviceCode: 'CAR_RENTAL', startAt, endAt: '2026-10-21T12:00:00.000Z' }),
    ).toBe(1);
    expect(
      billableUnits({ serviceCode: 'CAR_RENTAL', startAt, endAt: '2026-10-21T12:01:00.000Z' }),
    ).toBe(2);
    expect(
      billableUnits({
        serviceCode: 'CHAUFFEUR',
        startAt,
        endAt: '2026-10-20T11:00:00.000Z',
        requestedHours: 2,
      }),
    ).toBe(2);
    expect(() =>
      billableUnits({
        serviceCode: 'CHAUFFEUR',
        startAt,
        endAt: '2026-10-20T13:00:00.000Z',
        requestedHours: 2,
      }),
    ).toThrow();
  });

  it('prorates the nearest configured seasonal duration band', () => {
    expect(amountForDuration(700, 7, 3)).toBe(300);
  });

  it('applies the existing transfer distance tiers and minimum', () => {
    const rate = { base_rate: 100, rate_1: 4, rate_2: 3, rate_3: 2 };
    expect(transferTierAmount(rate, 10)).toBe(100);
    expect(transferTierAmount(rate, 25)).toBe(100);
    expect(transferTierAmount(rate, 40)).toBe(120);
    expect(transferTierAmount(rate, 60)).toBe(120);
  });

  it('uses CHF five-cent tax rounding and whole-number net charges', () => {
    expect(currencyForCountry('ch')).toBe('CHF');
    expect(currencyForCountry('de')).toBe('EUR');
    const quote = computeQuoteBreakdown({
      serviceCode: 'TRANSFER',
      rateAmount: 101.4,
      rateIsTotal: true,
      durationDays: 1,
      options: [],
      optionSelections: [],
      taxes: [{ id: 1, title: 'VAT', amount: 7.7 }],
      currency: 'CHF',
    });
    expect(quote.baseRate).toBe(101);
    expect(quote.totalTax).toBe(7.8);
    expect(quote.total).toBe(108.8);
  });
});
