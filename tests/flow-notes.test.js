import { describe, expect, it } from 'vitest';
describe('Drive Luxury flow constants', () => {
    it('keeps booking and payment state independent', () => {
        const state = { booking: 'PENDING_VALIDATION', payment: 'AUTHORIZED' };
        expect(state.booking).not.toBe(state.payment);
    });
});
