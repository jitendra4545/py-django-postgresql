import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/pool.js', () => ({ query: vi.fn() }));
vi.mock('../src/services/google-maps.js', () => ({ getVerifiedRouteKm: vi.fn() }));

import { query } from '../src/db/pool.js';
import { computeQuoteBreakdown } from '../src/services/pricing-core.js';
import { optionBillingDays } from '../src/services/legacy-pricing-rules.js';
import { calculateQuote } from '../src/services/pricing.js';

const swissVat = [{ id: 1, title: 'VAT', amount: 8.1 }];

const directQuote = (serviceCode, rateAmount, extras = {}) =>
  computeQuoteBreakdown({
    serviceCode,
    rateAmount,
    rateIsTotal: true,
    durationDays: 1,
    options: [],
    optionSelections: [],
    taxes: swissVat,
    currency: 'CHF',
    ...extras,
  });

describe('client website screenshots: CHF quote arithmetic', () => {
  it('rental: 400/day + 12 collection + 33.35 VAT = 445 payable', () => {
    const q = directQuote('CAR_RENTAL', 400, { oneWayCharge: 12 });
    expect(q).toMatchObject({
      baseRate: 400,
      oneWayCharge: 12,
      netCost: 412,
      totalTax: 33.35,
      roundingAdjustment: -0.35,
      total: 445,
    });
  });
  it('chauffeur: 13 hours * CHF 85 + CHF 89.50 VAT = CHF 1195 payable', () => {
    const q = directQuote('CHAUFFEUR', 1105);
    expect(q).toMatchObject({
      baseRate: 1105,
      totalTax: 89.5,
      roundingAdjustment: 0.5,
      total: 1195,
    });
  });
  it('transfer: CHF 1126 + CHF 91.20 VAT = CHF 1217 payable', () => {
    const q = directQuote('TRANSFER', 1126);
    expect(q).toMatchObject({ baseRate: 1126, totalTax: 91.2, total: 1217 });
  });
  it('keeps non-Swiss whole-unit legacy tax rounding', () => {
    const q = computeQuoteBreakdown({
      serviceCode: 'TRANSFER',
      rateAmount: 101.4,
      rateIsTotal: true,
      durationDays: 1,
      options: [],
      optionSelections: [],
      taxes: [{ id: 1, title: 'VAT', amount: 7.7 }],
      currency: 'EUR',
    });
    expect(q).toMatchObject({ baseRate: 101, totalTax: 8, total: 109 });
  });
});

describe('per-day option multipliers', () => {
  it('13-hour chauffeur is one option day, not 13 days', () => {
    expect(optionBillingDays({ serviceCode: 'CHAUFFEUR', billableUnits: 13 })).toBe(1);
    const q = computeQuoteBreakdown({
      serviceCode: 'CHAUFFEUR',
      rateAmount: 1105,
      rateIsTotal: true,
      durationDays: 1,
      options: [{ id: 10, title: 'Child Seat', based_on: 1, rate_type: 1, amount: 7, taxable: 1 }],
      optionSelections: [{ optionId: 10, quantity: 2 }],
      taxes: [],
      currency: 'CHF',
    });
    expect(q.options[0].amount).toBe(14);
  });
  it('25-hour chauffeur bills two option days; rental retains its charged rental days', () => {
    expect(optionBillingDays({ serviceCode: 'CHAUFFEUR', billableUnits: 25 })).toBe(2);
    expect(optionBillingDays({ serviceCode: 'CAR_RENTAL', billableUnits: 3 })).toBe(3);
    expect(optionBillingDays({ serviceCode: 'TRANSFER', billableUnits: 1 })).toBe(1);
  });
});

describe('DB-driven insurance and full quote selection', () => {
  let klass;
  beforeEach(() => {
    vi.clearAllMocks();
    klass = {
      id: 12,
      rental_type: 2,
      one_way_drop_off_charge: 0,
      half_insurance_amount: 0,
      half_insurance_text_en: 'Half coverage insurance',
      full_insurance_amount: 45,
      full_insurance_text_en: 'Full coverage insurance',
      car_with_driver_free_km: 160,
      car_with_driver_extra_cost_per_km: 2,
    };
    query.mockImplementation(async (sql) => {
      if (sql.includes('FROM vehicle_classes')) return [klass];
      if (sql.includes('FROM countries')) return [{ code: 'CH' }];
      if (sql.includes('FROM rental_seasons')) return [];
      if (sql.includes('FROM rental_durations')) return [{ id: 19, span_duration: 1 }];
      if (sql.includes('FROM vehicle_class_price_rates'))
        return [{ id: 31, amount: 400, country_id: 3 }];
      if (sql.includes('FROM rental_options'))
        return [{ id: 10, title: 'Child Seat', based_on: 1, rate_type: 1, amount: 6, taxable: 1 }];
      if (sql.includes('FROM tax_surecharges')) return swissVat;
      throw new Error(`Unexpected database query: ${sql}`);
    });
  });
  const args = {
    serviceCode: 'CAR_RENTAL',
    vehicleClassId: 12,
    countryId: 3,
    startAt: '2026-11-10T12:00:00Z',
    endAt: '2026-11-11T12:00:00Z',
    distanceKm: 0,
  };
  it('includes free half coverage when omitted and legacy row marks it included', async () => {
    const q = await calculateQuote(args);
    expect(q).toMatchObject({
      insuranceType: 'HALF',
      insuranceIncluded: true,
      insuranceBillingDays: 1,
      insuranceUnitAmount: 0,
      lines: { baseRate: 400, totalTax: 32.4, total: 432 },
    });
  });
  it('honors explicit NONE instead of silently adding default coverage', async () => {
    const q = await calculateQuote({ ...args, insuranceType: 'NONE' });
    expect(q.insuranceType).toBe('NONE');
    expect(q.insuranceIncluded).toBe(false);
  });
  it('multiplies CHF 45/day full insurance for a three-day rental', async () => {
    const q = await calculateQuote({
      ...args,
      insuranceType: 'FULL',
      endAt: '2026-11-13T12:00:00Z',
    });
    expect(q).toMatchObject({
      insuranceType: 'FULL',
      insuranceUnitAmount: 45,
      insuranceBillingDays: 3,
      durationDays: 3,
      lines: { insuranceCost: 135 },
    });
  });
  it('multiplies rental child seats by quantity and rental days', async () => {
    const q = await calculateQuote({
      ...args,
      endAt: '2026-11-12T12:00:00Z',
      optionSelections: [{ optionId: 10, quantity: 2 }],
    });
    expect(q.lines.options[0].amount).toBe(24);
  });
  it('uses 13 chauffeur hours as one child-seat day and exposes the km policy', async () => {
    klass.rental_type = 1;
    query.mockImplementation(async (sql) => {
      if (sql.includes('FROM vehicle_classes')) return [klass];
      if (sql.includes('FROM countries')) return [{ code: 'CH' }];
      if (sql.includes('FROM rental_seasons')) return [];
      if (sql.includes('FROM rental_durations')) return [{ id: 19, span_duration: 13 }];
      if (sql.includes('FROM vehicle_class_price_rates'))
        return [{ id: 31, amount: 1105, country_id: 3 }];
      if (sql.includes('FROM rental_options'))
        return [{ id: 10, title: 'Child Seat', based_on: 1, rate_type: 1, amount: 7, taxable: 1 }];
      if (sql.includes('FROM tax_surecharges')) return swissVat;
      throw new Error(`Unexpected database query: ${sql}`);
    });
    const q = await calculateQuote({
      ...args,
      serviceCode: 'CHAUFFEUR',
      endAt: '2026-11-11T01:00:00Z',
      requestedHours: 13,
      distanceKm: 200,
      optionSelections: [{ optionId: 10, quantity: 1 }],
    });
    expect(q).toMatchObject({
      billableHours: 13,
      durationDays: 1,
      includedDistanceKm: 260,
      freeKmPerHour: 20,
      extraCostPerKm: 2,
      lines: { baseRate: 1105, chauffeurExtraCost: 0, options: [{ amount: 7 }] },
    });
  });
});
