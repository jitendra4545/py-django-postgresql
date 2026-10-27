import { URL } from 'node:url';
import { AppError } from '../common/errors.js';
import { env } from '../config/env.js';

const callGoogle = async (url, { key, method = 'GET', body, fieldMask }) => {
  if (!key)
    throw new AppError(
      503,
      'GOOGLE_MAPS_NOT_CONFIGURED',
      'Google Maps credentials are not configured',
    );
  let result;
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': fieldMask,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(8_000),
    });
    result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message || 'Google Maps rejected the request');
  } catch {
    // Never return Google credentials or upstream request headers to clients.
    throw new AppError(
      503,
      'GOOGLE_MAPS_UNAVAILABLE',
      'Location provider is unavailable; please retry',
    );
  }
  return result;
};

export const autocompletePlace = async (input, sessionToken) => {
  const payload = await callGoogle('https://places.googleapis.com/v1/places:autocomplete', {
    key: env.GOOGLE_PLACES_API_KEY,
    method: 'POST',
    body: { input, ...(sessionToken ? { sessionToken } : {}) },
    fieldMask: 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',
  });
  return (payload.suggestions || []).flatMap(({ placePrediction }) =>
    placePrediction?.placeId
      ? [{ placeId: placePrediction.placeId, description: placePrediction.text?.text || '' }]
      : [],
  );
};

export const getPlaceDetails = async (placeId, sessionToken) => {
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  if (sessionToken) url.searchParams.set('sessionToken', sessionToken);
  return callGoogle(url.toString(), {
    key: env.GOOGLE_PLACES_API_KEY,
    fieldMask: 'id,formattedAddress,addressComponents,location',
  });
};

const waypoint = (location) => {
  if (location.placeId) return { placeId: location.placeId };
  if (Number.isFinite(location.latitude) && Number.isFinite(location.longitude)) {
    return { location: { latLng: { latitude: location.latitude, longitude: location.longitude } } };
  }
  return { address: location.address };
};

export const getVerifiedRouteKm = async (leg) => {
  const destination = leg.dropoff || leg.stops?.at(-1);
  const intermediates = leg.dropoff ? leg.stops || [] : (leg.stops || []).slice(0, -1);
  if (!env.GOOGLE_ROUTES_ENABLED) {
    if (
      env.NODE_ENV !== 'production' &&
      env.ALLOW_UNVERIFIED_DISTANCE &&
      Number.isFinite(Number(leg.approximateDistanceKm))
    ) {
      return Number(leg.approximateDistanceKm);
    }
    if (!destination || (leg.pickup?.address === destination.address && !leg.stops?.length))
      return 0;
    return null;
  }
  if (!destination) return 0;
  const payload = await callGoogle('https://routes.googleapis.com/directions/v2:computeRoutes', {
    key: env.GOOGLE_ROUTES_API_KEY || env.GOOGLE_PLACES_API_KEY,
    method: 'POST',
    body: {
      origin: waypoint(leg.pickup),
      destination: waypoint(destination),
      ...(intermediates.length ? { intermediates: intermediates.map(waypoint) } : {}),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
    },
    fieldMask: 'routes.distanceMeters',
  });
  const distance = payload.routes?.[0]?.distanceMeters;
  if (!Number.isFinite(distance)) {
    throw new AppError(422, 'ROUTE_UNAVAILABLE', 'No drivable route was found');
  }
  return Math.round(distance) / 1000;
};


// Pre-booking UX only. Pricing/availability must still be calculated through
// POST /bookings/drafts/:draftId/quote using the verified pricing rules.
export const getRoutePreview = async ({ pickup, dropoff }) => {
  if (!env.GOOGLE_ROUTES_ENABLED) {
    throw new AppError(
      503,
      'GOOGLE_ROUTES_NOT_CONFIGURED',
      'Route preview is unavailable until Google Routes is enabled',
    );
  }

  const payload = await callGoogle('https://routes.googleapis.com/directions/v2:computeRoutes', {
    key: env.GOOGLE_ROUTES_API_KEY || env.GOOGLE_PLACES_API_KEY,
    method: 'POST',
    body: {
      origin: waypoint(pickup),
      destination: waypoint(dropoff),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
    },
    fieldMask: 'routes.distanceMeters,routes.duration',
  });
  const route = payload.routes?.[0];
  if (!route) {
    throw new AppError(422, 'ROUTE_UNAVAILABLE', 'No drivable route was found');
  }

  const distanceMeters = route.distanceMeters;
  const duration = route.duration;
  if (
    !Number.isFinite(distanceMeters) ||
    distanceMeters < 0 ||
    typeof duration !== 'string' ||
    !/^\d+(?:\.\d+)?s$/.test(duration)
  ) {
    throw new AppError(503, 'GOOGLE_MAPS_UNAVAILABLE', 'Route provider returned incomplete data');
  }
  const durationSeconds = Number(duration.slice(0, -1));
  if (!Number.isFinite(durationSeconds)) {
    throw new AppError(503, 'GOOGLE_MAPS_UNAVAILABLE', 'Route provider returned incomplete data');
  }
  const durationMinutes = Math.ceil(durationSeconds / 60);
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  const durationText = [
    ...(hours ? [`${hours} hr${hours === 1 ? '' : 's'}`] : []),
    ...(!hours || minutes ? [`${minutes} min`] : []),
  ].join(' ');

  return {
    distanceKm: Math.round(distanceMeters) / 1000,
    durationMinutes,
    durationText,
  };
};
