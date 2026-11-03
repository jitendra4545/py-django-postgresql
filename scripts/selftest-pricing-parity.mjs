import console from 'node:console';
import assert from 'node:assert/strict';
import { computeQuoteBreakdown } from '../src/services/pricing-core.js';
import { optionBillingDays } from '../src/services/legacy-pricing-rules.js';

const vat = [{ id: 1, title: 'Swiss VAT', amount: 8.1 }];
const quote = (serviceCode, amount, extra = {}) =>
  computeQuoteBreakdown({
    serviceCode,
    rateAmount: amount,
    rateIsTotal: true,
    durationDays: 1,
    options: [],
    optionSelections: [],
    taxes: vat,
    currency: 'CHF',
    ...extra,
  });

const rent = quote('CAR_RENTAL', 400, { oneWayCharge: 12 });
assert.equal(rent.baseRate, 400);
assert.equal(rent.oneWayCharge, 12);
assert.equal(rent.totalTax, 33.35);
assert.equal(rent.roundingAdjustment, -0.35);
assert.equal(rent.total, 445);

const chauffeur = quote('CHAUFFEUR', 85 * 13);
assert.equal(chauffeur.totalTax, 89.5);
assert.equal(chauffeur.roundingAdjustment, 0.5);
assert.equal(chauffeur.total, 1195);

const transfer = quote('TRANSFER', 1126);
assert.equal(transfer.totalTax, 91.2);
assert.equal(transfer.total, 1217);

assert.equal(optionBillingDays({ serviceCode: 'CHAUFFEUR', billableUnits: 13 }), 1);
assert.equal(optionBillingDays({ serviceCode: 'CHAUFFEUR', billableUnits: 25 }), 2);
assert.equal(optionBillingDays({ serviceCode: 'CAR_RENTAL', billableUnits: 3 }), 3);
assert.equal(optionBillingDays({ serviceCode: 'TRANSFER', billableUnits: 1 }), 1);
const seat = quote('CHAUFFEUR', 100, {
  options: [{ id: 5, title: 'Child Seat', based_on: 1, rate_type: 1, amount: 7, taxable: 1 }],
  optionSelections: [{ optionId: 5, quantity: 2 }],
});
assert.equal(seat.options[0].amount, 14);
assert.equal(seat.taxes[0].amount, 9.25); // 114 x 8.1% = 9.234 -> 9.25
assert.equal(seat.total, 123);

// Whole amount remains compatible with the legacy booking/checkout amounts.
assert.equal(quote('CAR_RENTAL', 400, { insuranceCost: 45 * 3 }).insuranceCost, 135);
console.log('PASS: screenshot totals (445/1195/1217 CHF), CHF 0.05 VAT, daily extras, insurance');
