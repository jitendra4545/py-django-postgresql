import { describe, expect, it } from 'vitest';
const order = ['ASSIGNED', 'ON_THE_WAY', 'ARRIVED', 'CUSTOMER_COLLECTED', 'IN_SERVICE', 'DROP_OFF_REACHED', 'COMPLETED'];
function canTransition(current, next) {
    return current === next || order.indexOf(next) === order.indexOf(current) + 1;
}
describe('chauffeur ride state machine', () => {
    it('allows sequential transition', () => expect(canTransition('ARRIVED', 'CUSTOMER_COLLECTED')).toBe(true));
    it('rejects skipping states', () => expect(canTransition('ASSIGNED', 'COMPLETED')).toBe(false));
});
