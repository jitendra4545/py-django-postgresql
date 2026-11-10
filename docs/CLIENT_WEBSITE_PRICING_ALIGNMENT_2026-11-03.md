# Drive Luxury: pricing alignment with client booking-site screenshots

Historical comparison: the client subsequently confirmed BASE_FEE_ONLY_V1 on 10 November. The active calculation taxes the base fee only and excludes extras, collection, excess distance and insurance. See CLIENT_WEBSITE_TAX_ALIGNMENT.md; earlier screenshot arithmetic below is retained as historical evidence and is superseded for the current implementation.

Basis: latest supplied `backend(2).zip`, inspected on 2026-11-03. This change is limited to **source pricing arithmetic and quote metadata**. The sample prices below are *illustrative configured DB values taken from screenshots*, not proof that the Aiven/Infomaniak database currently holds the same rates. No live database, Google Routes, Stripe, or client PHP site was used during this review.

## Three reference screenshots (CHF, VAT 8.1%)

| Flow | Screenshot calculation | New quote line calculation | Whole-CHF checkout |
| --- | --- | --- | ---: |
| Car Rental | 1 day at CHF 400 + pickup/collection CHF 12, tax CHF 33.35 | `412 × 8.1% = 33.372` → tax rounded to CHF 33.35 | **445** |
| Chauffeur | 13 hours at CHF 85/hour, tax CHF 89.50 | `1,105 × 8.1% = 89.505` → tax rounded to CHF 89.50 | **1,195** |
| Transfer | Fixed/distance-calculated base CHF 1,126, tax CHF 91.20 | `1,126 × 8.1% = 91.206` → tax rounded to CHF 91.20 | **1,217** |

The site appears to display tax rounded to CHF 0.05, while displaying payable totals in whole francs. This implementation retains whole-currency checkout amounts and exposes `lines.roundingAdjustment` so `netCost + totalTax + roundingAdjustment = total`. Example for Rental: `412 + 33.35 - 0.35 = 445`. Non-CHF tax rounding is unchanged from the preexisting backend (whole units) pending verified website examples.

## Changes made

- `src/services/pricing-core.js`: CHF VAT lines and `totalTax` rounded to CHF 0.05; checkout `total` remains whole CHF. Adds `roundingAdjustment` to quote `lines`.
- `src/services/legacy-pricing-rules.js`: adds `optionBillingDays()`; `CHAUFFEUR` 13 billed hours = 1 option day, 25 hours = 2 option days; `CAR_RENTAL` uses its rental-day billing and `TRANSFER` uses one option day.
- `src/services/pricing.js`: supplies actual option days to the price breakdown while keeping base-rate hours/days unchanged; multiplies selected rental insurance per billable rental day; when half insurance has **a zero configured price AND a coverage description**, omission of `insuranceType` selects included `HALF` coverage. `insuranceType: 'NONE'` explicitly sent by an existing client is still honored. Adds `insuranceIncluded`, `insuranceUnitAmount`, `insuranceBillingDays` and chauffeur `includedDistanceKm`, `freeKmPerHour`, `extraCostPerKm` metadata.
- `src/modules/bookings.js` and `src/services/booking-service.js`: missing `insuranceType` is no longer forced to `NONE`; an explicitly submitted `couponCode` fails at quote time with `422 COUPON_PRICING_UNAVAILABLE` rather than silently giving no discount.
- `src/services/booking-change-service.js`: approved changes use the same insurance default handling as new bookings.
- `tests/client-website-pricing.test.js`, `tests/legacy-pricing-parity.test.js`, and `scripts/selftest-pricing-parity.mjs`: regression coverage for screenshots and per-day options/insurance.

Existing rate-source selection, duration-band calculations, reservation persistence, payment/provider integration, and all documented HTTP routes are unchanged. **No database migration** is required by this patch.

## API usage and compatibility

- `PUT /api/v1/bookings/drafts/{draftId}/details` still accepts `insuranceType: 'NONE' | 'HALF' | 'FULL'`. Omitting it enables the included-half default **only when the legacy DB explicitly indicates a zero-cost half policy with a description**. A frontend sending `NONE` will continue to have `NONE`.
- Optional `couponCode` is acknowledged as input but **not implemented as a discount**. Providing one causes `422 COUPON_PRICING_UNAVAILABLE` during quotation. Do not show a coupon as applied in the frontend.
- `POST /api/v1/bookings/drafts/{draftId}/quote` keeps `legs[].billableUnits` and `legs[].billableHours` (for Chauffeur). `legs[].durationDays` now correctly means **option billing days** for Chauffeur rather than hours. For all services it is the number of days used to calculate per-day extras.
- `legs[].lines.taxes[].amount` and `legs[].lines.totalTax` may contain two decimals for CHF. `legs[].lines.total` and top-level `total` remain whole currency units for existing Stripe/booking logic. Frontend should show CHF tax lines with two decimals and total with two decimal places if matching website style (`445.00 CHF`).
- The quote snapshot includes `lines.roundingAdjustment`; checkout continues to use `lines.total` (whole CHF), not the unrounded sum of tax lines.

## Not implemented without client-supplied policy/data

1. **Coupon discounts:** screenshot has an Apply box, but this backend has no reviewed coupon validation table/API or discount formula. Need legacy PHP coupon implementation, scope (class/service/date/customer), stacking and tax treatment before enabling payment discounts.
2. **Transfer waiting time:** screenshot advertises “30 min free, 75 CHF/additional hour”. This is *post-trip contingent time*, not a known upfront surcharge. No verified config source, billable trigger or refund/authorization procedure exists in this ZIP; no charge is fabricated in quotes.
3. **Pickup/collection surcharge:** existing distance-based `vehicle_classes.one_way_drop_off_charge` and delivery-return logic remain; verify the configured class/vehicle/routing data yields the screenshot's CHF 12 for the actual addresses.
4. **Chauffeur included distance:** existing legacy DB field is interpreted as included kilometres **per eight hours**. Thus an input value of 160 represents 20 km/hour. Verify `vehicle_classes.car_with_driver_free_km` is configured this way for the screenshot class; don't assume its raw value is 20.
5. **Live pricing parity:** match class IDs, `vehicle_class_price_rates`, `tax_surecharges`, `rental_options`, `vehicle_classes`, real route kilometres, country, season, dates and active vehicle. Zurich/Geneva-to-Delhi screenshots cannot be treated as bookable verified road itineraries just from image labels.
6. **Legacy MySQL column precision:** verify `reservation_costs.total_tax` and `base_tax` column types can store CHF 0.05 tax line values, or plan approved schema/rounding reconciliation before production rollout.

## Safe deployment/test sequence

1. Rotate any credentials exposed in shared ZIPs/messages; the delivered ZIP intentionally excludes private `.env`, installed `node_modules`, `.git`, and local files. Use `npm ci` on Windows/Infomaniak with existing `package-lock.json` and configure your private `.env` separately.
2. In a copied/staging database, inspect `SHOW COLUMNS FROM reservation_costs;` and `SHOW COLUMNS FROM app_quote_snapshots;` and confirm required tables/price rows exist.
3. Run `npm run pricing:selftest` for independent screenshot calculations, then `npm test` and `npm run syntax:check` on your development machine after `npm ci`.
4. Requote any **unpaid** old drafts after deploying. **Do not modify already confirmed bookings, apply unknown migrations to production, or reprice prior transactions.**
5. Compare three matched real PHP website quotes to the mobile quote API (same class, route, season, discounts/extras); have the client's finance/operations team approve tax/rounding before production payment tests.
