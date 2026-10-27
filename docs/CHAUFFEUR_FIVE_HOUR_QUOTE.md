# Chauffeur quote for a customer-selected number of hours

## Frontend (React Native Expo)

A customer may select **5 hours** in the chauffeur booking form. Keep the selected value numeric (`requestedHours: 5`) and submit it in the **complete** booking-details payload. A login JWT is required on the booking endpoints.

1. `POST /api/v1/bookings/drafts` with `{ "serviceCode": "CHAUFFEUR" }` → `id`.
2. `PUT /api/v1/bookings/drafts/{draftId}/details` including `vehicleClassId`, `passenger`, `legs`, and `options`.
3. `POST /api/v1/bookings/drafts/{draftId}/quote` with the JWT → the price and breakdown.
4. Display **the server's** `total` and `legs[0].billableHours`, not a price calculated on the phone.

Example booking-details request (locations/IDs are examples and **must be replaced** with catalog-resolved values):

```json
{
  "vehicleClassId": 12,
  "insuranceType": "NONE",
  "passenger": {
    "fullName": "Example Customer",
    "phone": "+919876543210",
    "count": 2,
    "luggageCount": 1
  },
  "legs": [{
    "startAt": "2026-11-05T10:00:00.000Z",
    "requestedHours": 5,
    "isHourly": true,
    "pickup": {
      "address": "Selected pickup address",
      "countryId": 3,
      "cityId": 25,
      "latitude": 47.3769,
      "longitude": 8.5417
    },
    "dropoff": {
      "address": "Selected dropoff address",
      "countryId": 3,
      "cityId": 25,
      "latitude": 47.38,
      "longitude": 8.55
    },
    "stops": []
  }],
  "options": []
}
```

The backend **derives** `endAt = 2026-11-05T15:00:00.000Z`. `isHourly` is also normalized to `true` when `requestedHours` is provided. Supplying a shorter end time is normalized up; one longer than the selected package is rejected.

## Price calculation

The quote uses the **selected five hours**, not the driving time in `POST /catalog/route-preview`:

- It selects the matching active **country / season / chauffeur duration band / vehicle-class** rate from MySQL.
- An exact five-hour duration band is preferred if configured. Otherwise the nearest configured duration band is prorated: `band_amount / band_hours * 5`.
- The five-hour included-distance allowance is `(class_free_km / 8) * 5`, and configured extra kilometre charges, optional extras and taxes are added as applicable.
- The quote contains `legs[0].billableHours: 5`, `legs[0].billableUnits: 5`, and the effective `startAt` and `endAt`, plus a breakdown in `legs[0].lines`.
- The quote is stored for 30 minutes and checkout uses its snapshot, so do not recompute payment price on the frontend.

**Illustrative amount only:** 4-hour rate 240 → (240 ÷ 4) × 5 = 300 before extras and tax. The real amount comes from your client's configured MySQL rate rows, not this example.

A quote can still fail with `RATE_UNAVAILABLE`, `VEHICLE_UNAVAILABLE`, or `ROUTE_DISTANCE_REQUIRED` if the required inventory, pricing, or verified Google Routes data is missing. The new quote metadata does not relax those validations.

## Verification

Run `npm ci`, then:

```bash
npm test -- tests/chauffeur-hours.test.js tests/chauffeur-five-hour-quote.test.js
npm run syntax:check
```

The integration regression covers an exact five-hour price, prorating a four-hour rate to five hours, scaling the included kilometres for five hours, and reporting a missing rate instead of inventing a price.

No new API or database migration is required for selected chauffeur hours.
