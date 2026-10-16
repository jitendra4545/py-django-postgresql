import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { validate } from '../src/common/validate.js';

describe('request validation', () => {
  it('replaces an Express 5 query getter with parsed query values', () => {
    const request = {};
    Object.defineProperty(request, 'query', {
      get: () => ({ page: '2' }),
      configurable: true,
      enumerable: true,
    });
    const next = vi.fn();

    validate(z.object({ page: z.coerce.number().int().positive() }), 'query')(request, {}, next);

    expect(next).toHaveBeenCalledWith();
    expect(request.query).toEqual({ page: 2 });
  });
});
