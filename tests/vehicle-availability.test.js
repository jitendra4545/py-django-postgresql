import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const availability = fs.readFileSync('src/services/vehicle-availability.js', 'utf8');
const catalog = fs.readFileSync('src/modules/catalog.js', 'utf8');
const operations = fs.readFileSync('src/modules/operations.js', 'utf8');

describe('vehicle availability compatibility', () => {
  it('only considers active online-bookable physical vehicles', () => {
    expect(availability).toMatch(/v\.status=1 AND v\.online_booking_status=1/);
    expect(availability).toMatch(/av\.status=1 AND av\.online_booking_status=1/);
  });

  it('reuses all existing legacy availability sources', () => {
    for (const table of [
      'vehicle_blocks',
      'vehicle_reserved_dates',
      'reservation_vehicles',
      'vehicle_cities',
      'cities',
    ]) {
      expect(availability).toContain(table);
    }
  });

  it('filters public and operational availability by country and optional city', () => {
    expect(catalog).toContain('cityId: z.coerce.number().int().positive().optional()');
    expect(catalog).toContain('withCity: Boolean(request.query.cityId)');
    expect(operations).toContain('countryId: z.coerce.number().int().positive().optional()');
    expect(operations).toContain('cityId: z.coerce.number().int().positive().optional()');
    expect(availability).toContain('available_city.country_id=?');
    expect(availability).toContain('available_vehicle_city.city_id=?');
  });

  it('keeps fleet statuses out of the client catalog and exposes vehicles to operations only', () => {
    expect(catalog).not.toMatch(/SELECT[^;]*\bv\.status\s+AS/is);
    expect(catalog).toContain('availableClassSql({ withDates');
    expect(operations).toContain("'/vehicles/available'");
  });

  it('reuses legacy audit and replacement-history tables on assignment', () => {
    expect(operations).toContain('reservation_temp_vehicle_histories');
    expect(operations).toContain('writeActivityLog(connection');
  });

  it('rechecks location-aware inventory when approved booking changes are applied', () => {
    const bookingChanges = fs.readFileSync('src/services/booking-change-service.js', 'utf8');
    expect(bookingChanges).toContain('hasAvailableVehicle');
    expect(bookingChanges).toContain('countryId: pickup.countryId');
    expect(bookingChanges).toContain('cityId: pickup.cityId');
    expect(bookingChanges).toContain('connection,');
  });
});
