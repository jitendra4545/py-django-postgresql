import { describe, expect, it } from 'vitest';
import {
  assertAssignmentTransition,
  canTransitionAssignment,
} from '../src/common/state-machine.js';

describe('chauffeur assignment state machine', () => {
  it('supports the complete happy path', () => {
    const path = [
      'OFFERED',
      'ACKNOWLEDGED',
      'PREPARING',
      'ON_THE_WAY',
      'ARRIVED',
      'WAITING',
      'PASSENGER_ONBOARD',
      'IN_SERVICE',
      'AT_STOP',
      'IN_SERVICE',
      'DROPOFF_REACHED',
      'COMPLETED',
    ];
    for (let index = 0; index < path.length - 1; index += 1)
      expect(canTransitionAssignment(path[index], path[index + 1])).toBe(true);
  });

  it('rejects skipping operational states', () => {
    expect(() => assertAssignmentTransition('OFFERED', 'COMPLETED')).toThrow(/cannot move/);
  });

  it('treats retries of the same status as no-op', () => {
    expect(assertAssignmentTransition('ARRIVED', 'ARRIVED')).toBe(false);
  });
});
