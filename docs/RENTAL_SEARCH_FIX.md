# Rent-a-car search correction — 2.6.2

The previous catalog used `MIN(amount)` across all seasons and durations, so its rental candidates and price order could differ from Laravel `FrontEnd/ReservationController::selectCar`. The website additionally checks the requested pickup season and nearest rental-day band, then shows only a positive base fare.

For `GET /api/v1/catalog/vehicle-classes?serviceCode=CAR_RENTAL`, send the same `countryId`, `cityId`, `startAt` and `endAt` used for the website search. Dates are the existing ISO timestamps and must identify the same instants. `cityId` identifies the pickup city; it selects the preferred representative car and its displayed capacity. Dates control fleet occupancy, season and duration pricing. A request without dates remains the original broad indicative catalog for compatibility.

The dated rental adapter now selects the first active pickup-date season (season 0 only if no season covers pickup), the closest active positive-duration rental band, and the first active country rate with global country 0 fallback. A configured zero country rate takes precedence over a positive global rate and hides that class, matching Laravel. Missing current-season rates are not replaced with historical rates. Results are sorted by the resulting base amount and class ID; `startingPrice` is the base for the full requested rental duration. Taxes, options and pickup/collection charges are calculated in the existing draft quote, so `startingPriceIndicative` remains true.

The existing JSON fields remain `id`, `title`, `description`, `image`, `passengerCapacity`, `startingPrice`, `currency`, and `startingPriceIndicative`. Rental quotes now reject inactive rate rows by using the same active-rate filter. The shared physical availability policy and existing chauffeur, transfer, agency, payment and chat flows are retained.

Deploy the complete `mobile-backend` folder; `/health` reports `2.6.2`. This patch adds no Laravel changes beyond the shared-policy files already included in 2.6.1, and no database migrations are required. Both deployments must use the same database fleet/rates, shared policy and search inputs for live parity.

Read-only comparison with actual class IDs observed on the website:

```bash
npm run availability:diagnose -- --country-id COUNTRY_ID --city-id CITY_ID \
  --service-code CAR_RENTAL --start-at PICKUP_ISO --end-at RETURN_ISO \
  --website-class-ids CLASS_ID,CLASS_ID
```

The default diagnostic lists physical candidates before the website's positive-rate display filter. Rental candidates removed for missing/nonpositive current rates are expected. `observedWebsiteComparison` compares the real website class IDs you supply against mobile results. The included tests use synthetic data in a disposable import of the exact schema; they do not establish the live production vehicle count.
