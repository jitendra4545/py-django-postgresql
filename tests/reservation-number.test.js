import { describe, expect, it } from 'vitest';
import { legacyReservationNumber } from '../src/services/reservation-number.js';

describe('legacy reservation numbering', () => {
  it('matches the existing PHP IDs in the supplied database export', () => {
    expect(legacyReservationNumber(1)).toBe('DL03615');
    expect(legacyReservationNumber(11849)).toBe('DL15463');
    expect(legacyReservationNumber(11850)).toBe('DL15464');
  });
});
