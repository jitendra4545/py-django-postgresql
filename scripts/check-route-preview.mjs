// Dependency-free, zero-network smoke test of the Google Routes adapter.
// Run: node --experimental-test-module-mocks scripts/check-route-preview.mjs
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const testEnv = {
  GOOGLE_ROUTES_ENABLED: true,
  GOOGLE_ROUTES_API_KEY: 'mock-google-routes-key',
  GOOGLE_PLACES_API_KEY: '',
};
const envFile = fileURLToPath(new URL('../src/config/env.js', import.meta.url));
mock.module(envFile, { namedExports: { env: testEnv } });
const { getRoutePreview } = await import('../src/services/google-maps.js');

let calls = [];
let reply = { routes: [{ distanceMeters: 35200, duration: '4920s' }] };
globalThis.fetch = async (url, init) => {
  calls.push({ url, init });
  return { ok: true, json: async () => reply };
};

const route = await getRoutePreview({
  pickup: { placeId: 'ChIJpickupplace123' },
  dropoff: { placeId: 'ChIJdropoffplace456' },
});
assert.deepEqual(route, { distanceKm: 35.2, durationMinutes: 82, durationText: '1 hr 22 min' });
assert.equal(calls.length, 1);
assert.equal(calls[0].url, 'https://routes.googleapis.com/directions/v2:computeRoutes');
assert.equal(calls[0].init.headers['X-Goog-FieldMask'], 'routes.distanceMeters,routes.duration');
assert.equal(calls[0].init.headers['X-Goog-Api-Key'], 'mock-google-routes-key');
const sent = JSON.parse(calls[0].init.body);
assert.deepEqual(sent.origin, { placeId: 'ChIJpickupplace123' });
assert.deepEqual(sent.destination, { placeId: 'ChIJdropoffplace456' });
assert.equal(sent.routingPreference, 'TRAFFIC_UNAWARE');

calls = [];
reply = { routes: [{ distanceMeters: 1710, duration: '66.5s' }] };
const coordinates = await getRoutePreview({
  pickup: { latitude: 30.3165, longitude: 78.0322 },
  dropoff: { latitude: 30.4598, longitude: 78.0644 },
});
assert.deepEqual(coordinates, { distanceKm: 1.71, durationMinutes: 2, durationText: '2 min' });
assert.equal(calls.length, 1);
assert.deepEqual(JSON.parse(calls[0].init.body).origin, {
  location: { latLng: { latitude: 30.3165, longitude: 78.0322 } },
});

reply = { routes: [] };
await assert.rejects(
  getRoutePreview({ pickup: { placeId: 'abc' }, dropoff: { placeId: 'def' } }),
  (error) => error.status === 422 && error.code === 'ROUTE_UNAVAILABLE',
);

reply = { routes: [{ distanceMeters: 2, duration: 'not-a-duration' }] };
await assert.rejects(
  getRoutePreview({ pickup: { placeId: 'abc' }, dropoff: { placeId: 'def' } }),
  (error) => error.status === 503 && error.code === 'GOOGLE_MAPS_UNAVAILABLE',
);

testEnv.GOOGLE_ROUTES_ENABLED = false;
const prior = calls.length;
await assert.rejects(
  getRoutePreview({ pickup: { placeId: 'abc' }, dropoff: { placeId: 'def' } }),
  (error) => error.status === 503 && error.code === 'GOOGLE_ROUTES_NOT_CONFIGURED',
);
assert.equal(calls.length, prior, 'Disabled routing must never send a Google request');

console.log('PASS: Google Routes preview, field mask, coordinates, provider error, disabled config');
