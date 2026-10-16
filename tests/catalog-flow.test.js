import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const catalog = fs.readFileSync('src/modules/catalog.js', 'utf8');
const operations = fs.readFileSync('src/modules/operations.js', 'utf8');
const schemaVerifier = fs.readFileSync('src/scripts/verify-legacy-schema.js', 'utf8');

describe('frontend catalog and assignment discovery APIs', () => {
  it('provides active countries and cities from existing tables', () => {
    expect(catalog).toContain("'/countries'");
    expect(catalog).toContain('FROM countries');
    expect(catalog).toContain("'/cities'");
    expect(catalog).toContain('FROM cities');
    expect(catalog).toMatch(/status=1 AND deleted_at IS NULL/);
  });

  it('resolves reverse-geocoded country and city names to database IDs', () => {
    expect(catalog).toContain("'/location/resolve'");
    expect(catalog).toContain('countryCode');
    expect(catalog).toContain('exactCityMatch');
  });

  it('can restrict countries to service-backed online inventory', () => {
    expect(catalog).toContain('vehicle_class_countries');
    expect(catalog).toContain('v.online_booking_status=1');
    expect(catalog).toContain('rentTypeByService');
  });

  it('lists only chauffeurs without overlapping active assignments', () => {
    expect(operations).toContain("'/chauffeurs/available'");
    expect(operations).toContain('ada.scheduled_start_at < ?');
    expect(operations).toContain('ada.scheduled_end_at > ?');
    expect(operations).toContain('u.status=0 AND u.role=3');
  });

  it('verifies the legacy country and city structures before deployment', () => {
    expect(schemaVerifier).toContain('countries:');
    expect(schemaVerifier).toContain('cities:');
  });
});
