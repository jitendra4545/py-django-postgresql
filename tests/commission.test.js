import { describe, expect, it } from 'vitest';
import { calculateCommissionAmount } from '../src/services/commission-service.js';

describe('agency commission calculation', () => {
  it('uses the agency percentage and fixed two-decimal precision', () => {
    expect(calculateCommissionAmount('199.99', 10)).toBe(20);
    expect(calculateCommissionAmount('1000', 7.5)).toBe(75);
  });
});
