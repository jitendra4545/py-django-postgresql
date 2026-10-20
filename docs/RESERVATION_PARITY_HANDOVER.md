# Reservation and pricing handover

This document describes the mobile backend after the October 2026 reservation review. The attached Drive Luxury reservation PDF and the supplied PHP code informed this review. The PHP implementation remains the reference for legacy database behavior; Stripe remains the mobile payment provider. Do not configure PayEngine credentials for this service.

## Client/Agent booking sequence

1. Resolve the pickup country and city with `/catalog/places/{placeId}` or `/catalog/location/resolve`. Use IDs from the connected live database.
2. Query `/catalog/vehicle-classes` with the **same** service, country, city, dates and passenger count to be saved in the draft. A class result is backed by an eligible physical vehicle at search time; it is not a booking hold.
3. Create a draft, save passenger and leg details, and request a quote. The quote checks physical availability again, selects one vehicle per leg, and computes a price snapshot valid for 30 minutes.
4. Checkout with a stable `Idempotency-Key`. A transaction creates the legacy `reservations` header, `reservation_details`, costs, a vehicle reservation and reserved dates, and a mobile payment transaction. The reservation is pending payment.
5. Checkout creates a Stripe PaymentIntent. Only the signed `payment_intent.succeeded` webhook confirms the reservation and sets legacy `payment_status=20` (unless the hold has expired or been cancelled). Client and Agent read the backend payment and booking endpoints for confirmed state.
6. Operations owns invoice creation and agency commissions in this project's agreed workflow. The mobile API exposes their records read-only when present. Masked calling remains disabled until a telecom provider is configured.

## Reservation numbers

New checkout reservations use `DL` followed by zero-padded `3614 + reservations.id`, e.g. reservation ID 11850 becomes `DL15464`. This matches the historical PHP `Reservation` model and the September export. A unique temporary number is inserted first, then replaced within the checkout transaction after MySQL allocates the ID. Existing numbers remain unchanged. A legacy collision fails the transaction with `RESERVATION_NUMBER_CONFLICT` rather than silently duplicating a number. Avoid independently allocating numbers from row counts.

## Pricing precedence

| Service         | Rate selection                                                                                                                                                                      | Units and supplements                                                                                                                                                                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chauffeur (`1`) | Active pickup-date season or season `0`, nearest configured duration band, country-specific class rate before country `0`                                                           | Requested hours, distance above free-km allowance, selected extras and percentage taxes                                                                                                                   |
| Rental (`2`)    | Same season/duration/country grid                                                                                                                                                   | Up to 26 hours bills one day; insurance, options, one-way/collection cost, percentage taxes                                                                                                               |
| Transfer (`3`)  | First class-specific `transfer_city_wise_prices` row for either `(pickupCity, dropoffCity)` or reverse; otherwise seasonal country distance tiers; otherwise class base/per-km grid | The PHP transfer fallback is `max(base rate, distance × tier rate)`, with country tier per-km pricing only above 15 km. The PDF's short “base + per KM” phrase does not describe the actual PHP function. |

`transfer_city_wise_prices` is the table name used by the PHP model and this backend. The word `prizes` is a spelling variation, not a separate table in the reviewed code. The saved city IDs must correspond to rows in `cities` on the **live** database; address strings alone do not match city-pair rates.

All new quote component amounts, tax lines, and totals are rounded to whole currency units before storing costs and creating a payment intent, as required by the supplied reservation PDF. Stripe still receives minor units (`whole total × 100`). For example, an amount of 101.4 and 7.7% tax becomes base 101, tax 8, total 109. Re-quote older unconfirmed drafts before checkout; previously stored quotes may have cent-based totals.

## Availability and location checks

The backend requires physical vehicles with `status=1`, `online_booking_status=1`, a matching `vehicle_service_types` row, and a `vehicle_cities` mapping to the pickup country and (if given) exact city. It rejects blocked, reserved-date and overlapping allocated vehicles. The catalog can return a broader set if called without city or dates, so the frontend must pass the same values as the draft. A September export supplied for review contains `countries` and `cities`, but omits fleet and price tables. It cannot establish which current cities are actually served or confirm the current rate rows.

## Confirmed limitations and release gates

- The supplied PDF documents PayEngine and intermediate `FrontPageReservation` promotion for the website. The mobile system deliberately uses Stripe and creates a pending legacy reservation at checkout. Verify the website and mobile flows coexist on the live database.
- The supplied PDF describes automatic commission and invoice generation, confirmation email, PDF contract, Zoho sync, coupon/manual discount, one-click leg clone, and per-field audit. This mobile backend does not claim full parity for those features. Operations-owned invoice and commission creation is the agreed project rule; do not duplicate those writers without explicit coordination.
- Legacy PHP code reviewed for the public transfer calculation uses `MAX(base, km charge)`; the document's prose conflicts with that implementation. Compare real sample orders and get business sign-off before changing the formula.
- Confirm active vehicle mappings and prices in the live database, quote several representative bookings against the PHP system, and test Stripe webhooks plus invoice/commission visibility. The September export does not include the fleet/rate tables needed for that comparison.
- Masked calling needs a telecom provider and credentials; it remains disabled. Transactional email delivery and any external Zoho integration need their own production configuration and acceptance testing.
