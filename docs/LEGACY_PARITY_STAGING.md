# Legacy PHP / mobile backend alignment — staging checklist

This package uses the supplied PHP `app` source and the September 2026 database export as a reference. The export stops before the fleet and rate table DDL/data. No live connection or Stripe/Google call was available in this review. Do not deploy it against the production website database until the checks below pass on a clone.

## Booking and pricing

| Rule                           | Mobile backend implementation                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Legacy service type            | Chauffeur/car with driver `1`, car rental `2`, transfer `3`; migration `004` corrects app catalog mapping.                                                                                 |
| Offered class and vehicle      | Class rental type/service/country, vehicle service type, `status=1`, online booking, location mapping, date blocks, reserved-date ledger and active allocation. Only classes are public.   |
| Season                         | Active `rental_seasons` covering pickup date, otherwise season `0`. Missing configured rate fails instead of inventing a price.                                                            |
| Duration                       | Closest active band in `rental_durations`; rental day grace at 26 hours and minimum chauffeur hours; rate prorated by band span.                                                           |
| Transfer                       | Fixed city pair, else country+season distance tiers with minimum, else class minimum/per-km rows.                                                                                          |
| One-way rental                 | Direct route charge above 2 km; when both ends are outside a vehicle's original cities, collection/delivery routes and driver-distance surcharge are added.                                |
| Extras and tax                 | Class-eligible legacy `rental_options`, quantity/day basis, country/service percentage `tax_surecharges`, CHF 0.05 tax rounding.                                                           |
| Reservation writes             | Shared reservation/detail, costs, taxes, options, insurance, physical vehicle and per-day ledger, plus mobile `app_*` records.                                                             |
| Stripe                         | Current quote and idempotent checkout; EUR/CHF intent; signed success confirms legacy `status=1`, `payment_status=20`; expired unpaid holds release inventory after provider cancellation. |
| Agent commissions and invoices | Read-only legacy data; the website/Operations creates and reconciles them.                                                                                                                 |

## Set up

1. Rotate any credentials shared in chat. Put new credentials into encrypted environment variables, never `.env.example` or a ZIP. Add `GOOGLE_PLACES_API_KEY` for autocomplete. For production route-priced bookings, enable Routes API on a server key and set `GOOGLE_ROUTES_API_KEY` and `GOOGLE_ROUTES_ENABLED=true`. A Places-only key is not proof that Routes is enabled. Keep `ALLOW_UNVERIFIED_DISTANCE=false` in production.
2. Restore a current production database backup to isolated staging. Run `npm ci`, `npm run verify:schema`, `npm run migrate`, `npm run build`, `npm run lint`, and `npm run format:check`. Review migration `004` before applying it to the shared database.
3. In staging, compare PHP and mobile quotes for: a one-hour/two-hour chauffeur request; one-, three-, and seven-day rental; each active summer/winter date and season `0`; cross-city fixed transfer and 15/30/50 km boundaries; Swiss and non-Swiss tax; options; insurance; one-way/collection surcharge. Confirm an out-of-season rate either exists or rejects cleanly.
4. Create two overlapping checkout attempts for the same last available vehicle; only one may hold it. Test fleet maintenance block, sold vehicle, prior website reservation, canceled booking release, hold expiry, approved change, and assignment recheck. Coordinate concurrent PHP checkouts: the website must honor the same reserved-date ledger and lock discipline, or a cross-app race is still possible.
5. Run Stripe test-mode payment success, failure, duplicate webhook, late success after hold expiry, refund and CHF charge. Check legacy `reservations`, `reservation_payments`, `reservation_vehicles`, `vehicle_reserved_dates` and `app_payment_transactions`. Confirm no double payment or resurrected cancellation.
6. Verify frontend uses `/catalog/places/autocomplete`, `/catalog/places/{placeId}`, `/catalog/vehicle-classes`, `/catalog/options?vehicleClassId=...`, `/bookings/drafts/{id}/quote`, and `/checkout` with a new `Idempotency-Key`. Place details must map to a supported database country/city before a booking; `startingPrice` is indicative, quote is authoritative.

## Production boundaries

- No telecom provider was supplied. Masked calling stays explicitly disabled; chat/notifications/GPS are separate.
- Cancellation fees/refund policies are not finalized by the client; do not promise a computed cancellation amount.
- The app extension has no reviewed backfill for historical website reservations. Existing bookings without `app_reservation_meta` will not automatically appear in the mobile lists.
- The PHP website may write reservations concurrently. Without a shared locking protocol, the availability checks in this API alone cannot guarantee cross-application exclusivity.
- Google Places and Routes may need separate API enablement, billing and key restrictions. No real key is embedded in this package.
- The PHP public booking flow applies tax to all selected options in one path; this backend respects `rental_options.taxable`. Compare quotes with real finance-approved examples before treating the two implementations as penny-for-penny identical.
