import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { stripePaymentStatus, toMinorUnits } from '../src/services/payment-core.js';

describe('Stripe payment adapter', () => {
  it('converts decimal amounts to integer cents without floating point drift', () => {
    expect(toMinorUnits('10.01')).toBe(1001);
    expect(toMinorUnits('7.999')).toBe(800);
  });

  it('maps Stripe PaymentIntent states to application states', () => {
    expect(stripePaymentStatus('succeeded')).toBe('PAID');
    expect(stripePaymentStatus('requires_payment_method')).toBe('FAILED');
    expect(stripePaymentStatus('requires_action')).toBe('REQUIRES_ACTION');
  });

  it('keeps real Stripe credentials out of the environment template', () => {
    const template = fs.readFileSync('.env.example', 'utf8');
    expect(template).not.toMatch(/sk_(test|live)_[A-Za-z0-9]{20,}/);
    expect(template).not.toMatch(/pk_(test|live)_[A-Za-z0-9]{20,}/);
  });
});
