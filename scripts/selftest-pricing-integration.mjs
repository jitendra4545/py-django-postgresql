import process from 'node:process';
import console from 'node:console';
// No MySQL, Google, or Stripe calls. All SQL reads use the injected connection.
import assert from 'node:assert/strict';

// Suppress telecom/payment provider startup checks in an offline test process.
process.env.NODE_ENV = 'development';
process.env.MASKED_CALL_PROVIDER = 'mock';
process.env.PAYMENT_PROVIDER = 'mock';

const { calculateQuote } = await import('../src/services/pricing.js');

function makeConnection({ serviceCode, withChildSeat = false } = {}) {
  const classes = {
    CAR_RENTAL: {
      id: 18,
      rental_type: 2,
      one_way_drop_off_charge: 4,
      half_insurance_amount: 0,
      half_insurance_text_en: 'Half coverage included',
      full_insurance_amount: 45,
      full_insurance_text_en: 'Full coverage',
    },
    CHAUFFEUR: {
      id: 18,
      rental_type: 1,
      one_way_drop_off_charge: 0,
      car_with_driver_free_km: 160,
      car_with_driver_extra_cost_per_km: 2,
    },
    TRANSFER: { id: 18, rental_type: 3, one_way_drop_off_charge: 0 },
  };
  return {
    async execute(sql) {
      let rows;
      if (sql.includes('FROM vehicle_classes')) rows = [classes[serviceCode]];
      else if (sql.includes('FROM countries')) rows = [{ code: 'CH' }];
      else if (sql.includes('FROM rental_seasons')) rows = [];
      else if (sql.includes('FROM rental_durations'))
        rows = [{ id: 7, span_duration: serviceCode === 'CHAUFFEUR' ? 13 : 1 }];
      else if (sql.includes('FROM vehicle_class_price_rates'))
        rows = [
          {
            id: 8,
            country_id: 3,
            amount: serviceCode === 'CHAUFFEUR' ? 1105 : 400,
          },
        ];
      else if (sql.includes('FROM transfer_city_wise_prices')) rows = [{ id: 9, price: 1126 }];
      else if (sql.includes('FROM tax_surecharges'))
        rows = [{ id: 1, title: 'Swiss VAT', amount: 8.1 }];
      else if (sql.includes('FROM rental_options'))
        rows = withChildSeat
          ? [
              {
                id: 5,
                title: 'Child seat',
                amount: 7,
                based_on: 1,
                rate_type: 1,
                taxable: 1,
              },
            ]
          : [];
      else throw new Error(`Unexpected SQL: ${sql}`);
      return [rows];
    },
  };
}

const common = {
  vehicleClassId: 18,
  countryId: 3,
  startAt: '2026-11-10T12:00:00.000Z',
  distanceKm: 0,
};
const rental = await calculateQuote({
  ...common,
  serviceCode: 'CAR_RENTAL',
  endAt: '2026-11-11T12:00:00.000Z',
  distanceKm: 3,
  connection: makeConnection({ serviceCode: 'CAR_RENTAL' }),
});
assert.equal(rental.insuranceType, 'HALF');
assert.equal(rental.insuranceIncluded, true);
assert.equal(rental.lines.oneWayCharge, 12);
assert.equal(rental.lines.totalTax, 33.35);
assert.equal(rental.lines.total, 445);

const rentalThreeDays = await calculateQuote({
  ...common,
  serviceCode: 'CAR_RENTAL',
  endAt: '2026-11-13T12:00:00.000Z',
  insuranceType: 'FULL',
  connection: makeConnection({ serviceCode: 'CAR_RENTAL' }),
});
assert.equal(rentalThreeDays.insuranceBillingDays, 3);
assert.equal(rentalThreeDays.insuranceUnitAmount, 45);
assert.equal(rentalThreeDays.lines.insuranceCost, 135);

const chauffeur = await calculateQuote({
  ...common,
  serviceCode: 'CHAUFFEUR',
  endAt: '2026-11-11T01:00:00.000Z',
  requestedHours: 13,
  distanceKm: 200,
  connection: makeConnection({ serviceCode: 'CHAUFFEUR' }),
});
assert.equal(chauffeur.billableHours, 13);
assert.equal(chauffeur.durationDays, 1);
assert.equal(chauffeur.freeKmPerHour, 20);
assert.equal(chauffeur.includedDistanceKm, 260);
assert.equal(chauffeur.lines.totalTax, 89.5);
assert.equal(chauffeur.lines.total, 1195);

const chauffeurWithSeat = await calculateQuote({
  ...common,
  serviceCode: 'CHAUFFEUR',
  endAt: '2026-11-11T01:00:00.000Z',
  requestedHours: 13,
  distanceKm: 200,
  optionSelections: [{ optionId: 5, quantity: 1 }],
  connection: makeConnection({ serviceCode: 'CHAUFFEUR', withChildSeat: true }),
});
assert.equal(chauffeurWithSeat.lines.options[0].amount, 7);

const transfer = await calculateQuote({
  ...common,
  serviceCode: 'TRANSFER',
  endAt: '2026-11-11T12:00:00.000Z',
  pickupCityId: 1,
  dropoffCityId: 2,
  distanceKm: 281.5,
  connection: makeConnection({ serviceCode: 'TRANSFER' }),
});
assert.equal(transfer.sourceRateType, 'TRANSFER_CITY_PAIR');
assert.equal(transfer.lines.baseRate, 1126);
assert.equal(transfer.lines.totalTax, 91.2);
assert.equal(transfer.lines.total, 1217);

const { buildDraftQuote } = await import('../src/services/booking-service.js');
await assert.rejects(
  () =>
    buildDraftQuote({
      service_code: 'CAR_RENTAL',
      details: { vehicleClassId: 18, legs: [{}], couponCode: 'NOT-VERIFIED' },
    }),
  (error) => error.code === 'COUPON_PRICING_UNAVAILABLE' && error.status === 422,
);

console.log(
  'PASS: full quote selection & client screenshot totals for all 3 services; insurance/option billing; unsupported coupons rejected',
);
