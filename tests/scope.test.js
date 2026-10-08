import { describe, expect, it } from 'vitest';
import { ROLES } from '../src/config/constants.js';

describe('legacy role mapping', () => {
  it('keeps role 4 as agency agent and role 3 as chauffeur', () => {
    expect(ROLES.AGENCY_AGENT).toBe(4);
    expect(ROLES.CHAUFFEUR).toBe(3);
  });

  it('does not define a rental inspection agent in Release 1', () => {
    expect(ROLES.RENTAL_AGENT).toBeUndefined();
  });
});
