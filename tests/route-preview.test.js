import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/env.js', () => ({
  env: {
    GOOGLE_ROUTES_ENABLED: true,
    GOOGLE_ROUTES_API_KEY: 'mock-routes-key',
    GOOGLE_PLACES_API_KEY: '',
  },
}));
vi.mock('../src/db/pool.js', () => ({
  query: vi.fn(async () => []),
  transaction: vi.fn(),
  one: vi.fn(),
}));

import { env } from '../src/config/env.js';
import catalogRouter from '../src/modules/catalog.js';
import { errorHandler } from '../src/middleware/error-handler.js';

const app = express();
app.use(express.json());
app.use('/api/v1/catalog', catalogRouter);
app.use(errorHandler);
const endpoint = '/api/v1/catalog/route-preview';

beforeEach(() => {
  env.GOOGLE_ROUTES_ENABLED = true;
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ routes: [{ distanceMeters: 35200, duration: '4920s' }] }),
  })));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/v1/catalog/route-preview', () => {
  it('returns kilometres and traffic-unaware duration for selected place IDs', async () => {
    const response = await request(app).post(endpoint).send({
      pickup: { placeId: 'ChIJpickup' },
      dropoff: { placeId: 'ChIJdropoff' },
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ distanceKm: 35.2, durationMinutes: 82, durationText: '1 hr 22 min' });
    expect(response.headers['cache-control']).toBe('no-store');
    const [, config] = fetch.mock.calls[0];
    expect(config.headers['X-Goog-FieldMask']).toBe('routes.distanceMeters,routes.duration');
  });

  it('accepts numeric coordinates and rejects incomplete locations', async () => {
    const valid = await request(app).post(endpoint).send({
      pickup: { latitude: 30.3165, longitude: 78.0322 },
      dropoff: { latitude: 30.4598, longitude: 78.0644 },
    });
    expect(valid.status).toBe(200);
    const invalid = await request(app).post(endpoint).send({
      pickup: { latitude: 30.3165 },
      dropoff: { latitude: 30.4598, longitude: 78.0644 },
    });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('does not contact Google while Routes is disabled', async () => {
    env.GOOGLE_ROUTES_ENABLED = false;
    const response = await request(app).post(endpoint).send({
      pickup: { placeId: 'ChIJpickup' },
      dropoff: { placeId: 'ChIJdropoff' },
    });
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('GOOGLE_ROUTES_NOT_CONFIGURED');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns a clear error when there is no drivable route', async () => {
    fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ routes: [] }) });
    const response = await request(app).post(endpoint).send({
      pickup: { placeId: 'ChIJpickup' },
      dropoff: { placeId: 'ChIJdropoff' },
    });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('ROUTE_UNAVAILABLE');
  });
});
