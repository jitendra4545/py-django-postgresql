import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/db/pool.js', () => ({ query: vi.fn() }));
vi.mock('../src/services/vehicle-availability.js', () => ({
  listAvailableVehicles: vi.fn(),
}));
vi.mock('../src/services/google-maps.js', () => ({
  getVerifiedRouteKm: vi.fn(),
}));

import { query } from '../src/db/pool.js';
import { getVerifiedRouteKm } from '../src/services/google-maps.js';
import { listAvailableVehicles } from '../src/services/vehicle-availability.js';
import { buildDraftQuote } from '../src/services/booking-service.js';
import { normalizeChauffeurDetails } from '../src/services/chauffeur-hours.js';

const startAt = '2026-11-05T10:00:00.000Z';
let bandSpan;
let configuredAmount;

const makeDraft = (requestedHours = 5) => ({
  service_code: 'CHAUFFEUR',
  customer_id: 100,
  revision: 1,
  details: normalizeChauffeurDetails('CHAUFFEUR', {
    vehicleClassId: 12,
    insuranceType: 'NONE',
    passenger: { fullName: 'Five Hour Tester', phone: '+919876543210', count: 2 },
    legs: [
      {
        startAt,
        requestedHours,
        isHourly: true,
        pickup: { address: 'Pickup', countryId: 3, cityId: 25 },
        dropoff: { address: 'Dropoff', countryId: 3, cityId: 25 },
        stops: [],
      },
    ],
    options: [],
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
  bandSpan = 5;
  configuredAmount = 500;
  listAvailableVehicles.mockResolvedValue([{ id: 210 }]);
  getVerifiedRouteKm.mockResolvedValue(20);
  query.mockImplementation(async (sql) => {
    if (sql.includes('FROM vehicle_classes')) {
      return [{
        id: 12, rental_type: 1, one_way_drop_off_charge: 0,
        car_with_driver_free_km: 80, car_with_driver_extra_cost_per_km: 2,
      }];
    }
    if (sql.includes('FROM countries')) return [{ code: 'CH' }];
    if (sql.includes('FROM rental_seasons')) return [];
    if (sql.includes('FROM rental_durations')) return [{ id: 45, span_duration: bandSpan }];
    if (sql.includes('FROM vehicle_class_price_rates')) {
      return [{ id: 89, amount: configuredAmount, country_id: 3 }];
    }
    if (sql.includes('FROM tax_surecharges')) return [];
    throw new Error(`Unexpected query in chauffeur quote test: ${sql}`);
  });
});

describe('five-hour chauffeur booking quote', () => {
  it('quotes exactly five hours when there is a five-hour rate', async () => {
    const quote = await buildDraftQuote(makeDraft(5));
    expect(quote.currency).toBe('CHF');
    expect(quote.legs[0]).toMatchObject({
      vehicleId: 210,
      startAt,
      endAt: '2026-11-05T15:00:00.000Z',
      billableUnits: 5,
      billableHours: 5,
      durationBandId: 45,
      lines: { baseRate: 500, total: 500 },
    });
    expect(quote.total).toBe(500);
    expect(listAvailableVehicles).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceCode: 'CHAUFFEUR',
        startAt,
        endAt: '2026-11-05T15:00:00.000Z',
      }),
    );
    // The actual five-hour rate row must be the band used for pricing.
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM vehicle_class_price_rates'),
      [12, 0, 45, 1, 3, 3],
    );
  });

  it('prorates a four-hour rate to five billable hours, not four or twenty', async () => {
    bandSpan = 4;
    configuredAmount = 240;
    const quote = await buildDraftQuote(makeDraft(5));
    expect(quote.legs[0].billableHours).toBe(5);
    expect(quote.legs[0].lines.baseRate).toBe(300); // (240 / 4) * 5
    expect(quote.total).toBe(300);
  });

  it('uses the five-hour included-km allowance for chauffeur extra-distance fees', async () => {
    bandSpan = 4;
    configuredAmount = 240;
    getVerifiedRouteKm.mockResolvedValue(60);
    const quote = await buildDraftQuote(makeDraft(5));
    // 80 km per 8 hours = 50 km included for five hours, 10 km * 2 = 20 extra.
    expect(quote.legs[0].lines.baseRate).toBe(300);
    expect(quote.legs[0].lines.chauffeurExtraCost).toBe(20);
    expect(quote.total).toBe(320);
  });

  it('rejects pricing instead of guessing when the configured rate is missing', async () => {
    query.mockImplementation(async (sql) => {
      if (sql.includes('FROM vehicle_classes')) return [{ id: 12, rental_type: 1 }];
      if (sql.includes('FROM countries')) return [{ code: 'CH' }];
      if (sql.includes('FROM rental_seasons')) return [];
      if (sql.includes('FROM rental_durations')) return [{ id: 45, span_duration: 5 }];
      if (sql.includes('FROM vehicle_class_price_rates')) return [];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    await expect(buildDraftQuote(makeDraft(5))).rejects.toMatchObject({
      status: 422,
      code: 'RATE_UNAVAILABLE',
    });
  });
});
