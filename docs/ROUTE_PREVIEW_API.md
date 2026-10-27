# Route preview: driving kilometres and estimated travel time

This document covers the added **`POST /api/v1/catalog/route-preview`** endpoint for the Client & Agent React Native Expo booking screen. It is **not** a price quote and does **not** select a chauffeur, check inventory or create a booking.

## Frontend sequence

1. Search the pickup and drop-off inputs with `GET /api/v1/catalog/places/autocomplete?input=...`.
2. On selection, call `GET /api/v1/catalog/places/{placeId}` for each location. Store each selected `placeId`, coordinates and (when mapped) `country.id` / `city.id`.
3. Call `POST /api/v1/catalog/route-preview` to display approximate route kilometres and driving duration.
4. Use the pickup's actual `countryId` / `cityId` with `GET /api/v1/catalog/vehicle-classes?...`, as before.
5. For chauffeur bookings, **let the user select booked hours independently** of estimated driving time. Send `requestedHours` and `startAt` on `PUT /api/v1/bookings/drafts/{draftId}/details`, then call `POST /api/v1/bookings/drafts/{draftId}/quote` for the actual payable total.

## Request

```http
POST /api/v1/catalog/route-preview
Content-Type: application/json
```

Preferred request using Google Place IDs returned by Places autocomplete:

```json
{
  "pickup": { "placeId": "ChIJ_PICKUP_PLACE_ID" },
  "dropoff": { "placeId": "ChIJ_DROPOFF_PLACE_ID" }
}
```

You can also send geographic coordinates (numeric, not strings) obtained from Place Details:

```json
{
  "pickup": { "latitude": 30.3165, "longitude": 78.0322 },
  "dropoff": { "latitude": 30.4598, "longitude": 78.0644 }
}
```

Each point must provide `placeId` **or** both `latitude` and `longitude`. If both are supplied, `placeId` takes precedence. No bearer token is required by this catalog route; a per-IP limit of 20 requests/minute applies, in addition to the app-wide limiter.

## Success response (example values only)

```json
{
  "distanceKm": 35.2,
  "durationMinutes": 82,
  "durationText": "1 hr 22 min"
}
```

`distanceKm` is the Google Routes driving distance in kilometres, rounded to three decimal places. `durationMinutes` rounds up partial minutes. The backend uses `DRIVE` and `TRAFFIC_UNAWARE` routing. This is **not** an actual live-traffic ETA, not the customer's selected chauffeur rental hours and not a price.

## Error responses

- `422 VALIDATION_ERROR`: invalid/missing pickup or drop-off location.
- `422 ROUTE_UNAVAILABLE`: Google returned no drivable route between the points.
- `429`: too many route-preview calls.
- `503 GOOGLE_ROUTES_NOT_CONFIGURED`: `GOOGLE_ROUTES_ENABLED` is false.
- `503 GOOGLE_MAPS_NOT_CONFIGURED`: no usable Google Maps key is configured.
- `503 GOOGLE_MAPS_UNAVAILABLE`: Google could not be reached or returned incomplete data.

Do not send arbitrary free-text addresses. Resolve user selections to Google Place IDs or coordinates first. Show a user-friendly error if the route cannot be calculated, and do not fabricate km/duration or use unchecked values for pricing.

## Backend environment

```dotenv
GOOGLE_PLACES_API_KEY=YOUR_SERVER_SIDE_PLACES_KEY
GOOGLE_ROUTES_API_KEY=YOUR_SERVER_SIDE_ROUTES_KEY
GOOGLE_ROUTES_ENABLED=true
```

In Google Cloud, enable **Places API (New)** and **Routes API** for the appropriate key/project with billing and access restrictions. The existing backend can fall back to `GOOGLE_PLACES_API_KEY` for Routes if the latter is blank, but that key must also be authorized for Routes API. Never place the server key in React Native source code.

No database changes or migrations are required for this endpoint. The booking quote still performs its own verified route calculation and pricing rules.

## Testing

```sh
node --experimental-test-module-mocks scripts/check-route-preview.mjs
npm run syntax:check
npm test -- tests/route-preview.test.js
```

The dependency-free script mocks Google responses and does not contact the network or require MySQL. Integration tests require `npm ci` to have succeeded. For live testing, send real Google Place IDs and verify both `200` and an unsupported-route response. Display required Google attribution in the client UI when showing Routes results, in accordance with Google Maps Platform terms.
