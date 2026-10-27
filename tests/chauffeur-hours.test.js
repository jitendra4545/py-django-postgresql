import { describe, expect, it } from 'vitest';
import { effectiveLegEndAt, normalizeChauffeurDetails } from '../src/services/chauffeur-hours.js';

const startAt = '2026-11-05T10:00:00.000Z';

describe('chauffeur selected-hour bookings', () => {
  it('derives endAt and hourly flag from hour selection', () => {
    const result = normalizeChauffeurDetails('CHAUFFEUR', {
      legs: [{ startAt, requestedHours: 4, isHourly: false }],
    });
    expect(result.legs[0]).toMatchObject({
      requestedHours: 4,
      isHourly: true,
      endAt: '2026-11-05T14:00:00.000Z',
    });
  });
  it('accepts five selected hours and derives a five-hour booking window', () => {
    const normalized = normalizeChauffeurDetails('CHAUFFEUR', {
      legs: [{ startAt, requestedHours: 5, isHourly: false }],
    });
    expect(normalized.legs[0]).toMatchObject({
      requestedHours: 5,
      isHourly: true,
      endAt: '2026-11-05T15:00:00.000Z',
    });
  });
  it('extends a shorter supplied period to cover paid hours', () => {
    expect(effectiveLegEndAt('CHAUFFEUR', {
      startAt, endAt: '2026-11-05T11:00:00.000Z', requestedHours: 4,
    })).toBe('2026-11-05T14:00:00.000Z');
  });
  it('rejects a booking exceeding chosen hours', () => {
    expect(() => effectiveLegEndAt('CHAUFFEUR', {
      startAt, endAt: '2026-11-05T15:00:00.000Z', requestedHours: 4,
    })).toThrow();
  });
  it('does not affect car rental or transfer', () => {
    const details = { legs: [{ startAt, requestedHours: 4 }] };
    expect(normalizeChauffeurDetails('TRANSFER', details)).toBe(details);
    expect(normalizeChauffeurDetails('CAR_RENTAL', details)).toBe(details);
  });
  it('does not change existing chauffeur endAt-only flow', () => {
    expect(effectiveLegEndAt('CHAUFFEUR', { startAt, endAt: '2026-11-05T13:00:00.000Z' }))
      .toBe('2026-11-05T13:00:00.000Z');
  });
});
