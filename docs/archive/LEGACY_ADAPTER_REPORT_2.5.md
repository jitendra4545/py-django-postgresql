# Legacy integration report — 12 November 2026

## 2.5.0 extension

The requested follow-up adds seven operations without changing existing endpoint response schemas or any database object. `MOBILE_SCREEN_INTEGRATION.md` explains native rental-option/class links, the three service cost displays, deletion and chat wiring. New source adapters read the same native pricing data; class insurance choices remain distinct from rental option rows. Account deletion follows native soft deletion and revokes account access. Conversation membership now derives from current native assignments and agent scope instead of trusting old participant rows.

The original analysis and remaining limits below still apply. The active OpenAPI documentation merges a separate `mobile-enhancements-openapi.json`; the original `openapi.json` remains byte-for-byte unchanged.

## Scope and evidence

Implementation is based on the attached `release-v4(1).zip`, `driveluxury-v2(1).zip`, and `Dump20261112(1).zip`. The dump contains schema definitions, not business data. The Laravel archive supplies controllers, models, routes and website assets, but no `resources/views` templates or separate complete frontend application. Assertions about website selection and payments below refer to the supplied executable PHP, not a live browser comparison.

No new tables, columns, views, indexes, foreign keys or triggers are installed. The existing `app_*` session/draft/quote/payment-attempt/identity tables are already in the supplied dump and remain auxiliary storage. Native reservation tables are the booking and financial source. Historical schema-changing deployment tools were removed; migration entry points are disabled and schema verification is read-only.

## Endpoint and table mapping

All paths below are relative to `/api/v1`. All existing endpoint declarations, response keys and published OpenAPI bytes are retained. Values change where required to reflect current legacy data.

| Endpoint / flow | Existing tables and mapping |
| --- | --- |
| `GET /catalog/services` | `services` → existing catalog item keys; editorial service IDs remain separate from reservation service types 1/2/3 |
| `GET /catalog/countries`, `/cities`, `/location/resolve` | `countries`, `cities`, class-country and inventory mappings; city aliases retained |
| `GET /catalog/vehicle-classes` | `vehicle_classes`, `vehicle_class_countries`, `vehicles`, `vehicle_service_types`, `vehicle_cities`, `vehicle_reserved_dates`; `vehicle_dimensions` only supplies display capacity |
| `GET /catalog/options` | `rental_options` + `rental_option_classes` → `id`, `title`, `description`, `basedOn`, `rateType`, `amount`, `taxable` |
| Existing draft quote | `rental_seasons`, `rental_durations`, `vehicle_class_price_rates`, `vehicle_class_city_wise_base_rates`, `transfer_city_wise_prices`, `tax_surecharges`, class insurance fields, option pivots and `discount_coupons` |
| Existing draft checkout | `reservations`, `reservation_details`, `reservation_costs`, `reservation_taxes`, `reservation_optional_costs`, `reservation_insurances`, `reservation_vehicles`, `vehicle_reserved_dates`, `reservation_flight_numbers`, `reservation_discount_coupons`, `agency_commissions`; existing `app_booking_drafts`/`app_quote_snapshots` hold mobile draft state only |
| `GET /bookings`, `/bookings/:id`, `/client/dashboard`, client receipt | Current native parent status/currency/service, active details/costs, `reservation_payments`; no historical/retired detail included in active totals |
| Booking assignments / tracking | `reservation_drivers`, `reservation_details`, `reservation_statuses`, `reservation_driver_statuses`, `drivers`, `activity_logs`; existing `app_mobile_assignment_ids` retains independent stable pickup/dropoff public IDs |
| `GET /payments/:id`, `POST /payments/:id/retry`, existing webhook | Existing `app_payment_transactions` and `app_payment_webhook_events` retain gateway identity/idempotency; successful funds are recorded in `reservation_payments` for the admin panel |
| Notifications | Native `notifications` morph records → existing inbox JSON keys and existing push-delivery tables |
| Messages | `reservation_messages`, recipients and attachments → existing conversation/message JSON; `app_conversations` and participants retain conversation identity |
| Documents | `file_managers`, `media_files`, reservation/customer/driver files → existing document response keys |
| VIP / concierge requests | Native `contacts` and its existing metadata columns → existing manual-request responses; review updates write `contacts` directly |

The existing expense/document foreign keys in the dump are preserved. A document identity is also recorded in the already-existing `app_documents` table because driver expenses reference that table. When separate pickup/dropoff public IDs need an FK target, an inactive identity row in `reservation_drivers` provides it; it does not add an active chauffeur assignment. No new storage object or constraint is needed.

## Additional customer charges and payment

`Reservation/ReservationInfoController::storeReservationExtraService()` creates a native detail with `is_extra_service=1` and a matching cost with `total_amount=base_rate`, `total_tax=0`. Admin rental options are native `reservation_optional_costs` feeding the detail's `reservation_costs.optional_cost/total_amount`. The adapter trusts the resulting billable cost row and never adds the option sum a second time.

No 24-hour eligibility requirement was found in this path. It is payable after 24 hours, after 48 hours, or immediately after the admin adds it. The separate 24-hour pickup reminder in the PHP routes is unrelated.

The amount due is:

`max(0, SUM(active costs on active, non-deleted details) - SUM(active, non-deleted reservation payments excluding custom-invoice payments))`

| Original fare | Payments already recorded | New admin charge | Next mobile payment |
| ---: | ---: | ---: | ---: |
| 100 | 100 | 30 | 30 |
| 100 | 0 | 30 | 130 |
| 100 | 40 | 30 | 90 |
| 100 | 130 | 30 | 0 |

The existing booking `costs` array includes the additional cost using its existing keys. A fee-only detail is not presented as another journey leg. Existing `paymentId`, `paymentState`, `paymentOption`, `canRetryPayment` and `payments` fields expose the action. Completed journeys stay `COMPLETED`, including while the additional amount is due, and appear in the existing `UNPAID` list. The frontend can use its existing payment retry/PaymentSheet flow. Because the response contract has no expense-title field, no new per-expense explanation UI is added.

Untouched deferred attempts update to the latest balance. For an initialized unpaid intent, retry first confirms cancellation of the old payable intent, then creates an attempt for the new balance with a distinct durable idempotency key, retaining the public payment ID and retired provider reference history. Processing, captured, successful or ambiguous provider attempts are not replaced automatically. Duplicate success webhooks do not create duplicate native payments. A stale cancellation webhook cannot cancel a replacement attempt.

Native staff bank/card/cash payments immediately reduce the balance on the next fetch. A full staff payment disables another mobile collection. Internal `other_cost`, provider/driver costs and driver reimbursement submissions never become customer charges automatically.

### Legacy payment gaps that cannot safely be guessed

`FrontEnd/PaymentController::checkout()` submits the full cost total, rather than subtracting previous receipts. Its `success()` sets the paid flag but does not itself write a `reservation_payments` row. Some other submission paths do write a receipt. The mobile adapter deliberately uses outstanding funds rather than copying the full-total re-charge behavior.

If `payment_status=20` says paid but no usable native receipt exists, the exact original amount/time of settlement cannot be recovered from this schema-only dump. The adapter blocks automatic rebilling with an internal reconciliation reason. Staff must reconcile the real gateway receipt and record the actual payment in the existing native payment ledger. No guessed original payment or invented paid timestamp is inserted. The PHP gateway behavior is unchanged by this Node-only release.

Refunded, currency-inconsistent and otherwise ambiguous settlements continue to require explicit reconciliation. This protects customer funds and retains the existing error envelope.

## Vehicle availability and add-ons

The live public website route is `FrontEnd/ReservationController::selectCar()`, reached from the frontend reservation route in `routes/web.php`. It returns one representative vehicle per class, preferring `vehicle_original_cities.locality` equal to pickup, then using `nearestVehicles` from the same country. It does not limit fallback candidates to the pickup city.

The Node public search now shares those inventory predicates with quote/checkout selection:

- active, non-deleted vehicle and class;
- online-bookable physical vehicle;
- matching legacy class-country, vehicle-country text and service-type mappings;
- exclusion by inclusive dates in `vehicle_reserved_dates`;
- city preference followed by country-wide fallback, with deterministic oldest-ID selection.

The old public query additionally required commissioning dates, numeric dimensions/capacity, class online flags and extra operational blocking sources. Those filters were absent from the supplied public PHP query and could suppress classes. They no longer remove public website candidates. Capacity is still returned under the same display key. The operational vehicle endpoint retains the original stricter query.

`FrontEnd/ReservationController::rentalOptions()` filters by `show_on_frontend` and the selected class pivot; it does not require the option's `rent_type` to match the reservation. The same eligibility now drives both the mobile options list and pricing validation. This also follows PHP's lack of a `status` predicate in that public option selection; `show_on_frontend` is the public visibility control. No options or categories are hardcoded, and no new category response field is added.

### Exact count limit

The PHP page further hides classes whose **computed base fare is <= 50**, after calculating route/season/duration pricing. The existing mobile class catalog accepts country, optional pickup city, passenger count and dates; it does not receive transfer distance or drop-off city. Consequently its existing indicative catalog cannot reproduce that route-specific fare display gate for every request without additional search context from the frontend. It returns the matching inventory candidates; draft quotes use full route pricing.

The supplied dump has no actual vehicle or rate rows, so the reported live difference of 6–7 versus 2–4 cannot be measured here. A synthetic exact-schema fixture verifies eight expected candidates against an independently translated PHP inventory query. Run the included read-only diagnostic on the real database and same website search to compare candidate IDs. No arbitrary count cap or fabricated vehicles are used to force a number.

Unconfigured rates still cause a clear quote error rather than selling a fallback one-unit fare. Cross-application simultaneous allocation also cannot be made atomic solely by changing Node if Laravel does not take the same inventory locks; Node checkouts lock their physical candidates and write the shared reserved-date ledger. No database lock triggers are installed.

## Pricing and tax policy

The mobile pricing policy is explicitly base-fee-only:

`VAT = currencyRound(max(0, baseFee - applicableDiscount) * summedTaxRate / 100)`

`total = wholeMoneyRound(baseFee + options + chauffeurKmExtra + oneWayCharge + insurance - discount + VAT)`

Options, insurance, delivery/collection charges and chauffeur distance extras are excluded from the taxable base, even if a historical option is marked taxable. Fee-only additional services retain the admin's stored zero tax. CHF VAT uses the existing nearest-0.05 convention; final ordinary booking totals retain whole-money rounding. Currency and every tax/quote response key are unchanged. Existing private quote-policy markers reject stale pre-policy snapshots at checkout.

The supplied PHP is internally inconsistent: `ReservationDetailsPriceSyncService::vatFor()` includes add-ons in taxable components. This release follows the user's explicit base-only requirement for mobile-generated quotes and repricing. It does not rewrite admin-entered native totals on a GET. The unchanged Laravel admin may still produce VAT using its own formula; enforcing base-only policy there requires a separate Laravel change.

Additional alignment includes first matching active rental season, nearest duration band (no hardcoded chauffeur band override), PHP-compatible first country/global rental rate selection, transfer city-pair precedence, transfer country/season distance tiers and class distance fallback, textual city alias lookup, existing hourly/daily option units, insurance/delivery rules, discount snapshots and staff commission overrides. Fee-only expense services do not generate new normal-journey commissions.

## Admin synchronization

Native parent numeric status overrides stale optional lifecycle metadata. Native currency and service type derive mobile currency/service keys even for website-only bookings with NULL mobile metadata. Active native trip selectors map to existing leg/booking statuses; clearing a staff trip selector also clears stale mobile progress. Current active vehicle rows determine the class. Driver reconciliation retires removed roles, preserves stable public IDs for unchanged roles, creates replacement identities for changed roles and preserves independent pickup/dropoff state. Retired history does not inflate prices or upcoming dates.

Notification/document/message/manual-request readers are SQL adapters over native stores, rather than dependent on replacing physical `app_*` tables with views. This fixes native writes followed by reads from an unrelated empty mobile table in the original release.

## Deployment acceptance still required

Use real database and gateway configuration, verify actual search candidate IDs and computed fares on the client's data, exercise a test-mode signed Stripe payment/refund on MySQL 8.4, and reconcile any historical paid flags lacking receipts. These cannot be validated from a schema-only dump and no live provider credentials. The separate website UI and PayEngine callback were not modified. See `VALIDATION.md` for executed checks.
