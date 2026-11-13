# Drive Luxury shared integration — 2.6.2

This report supersedes the archived 2.5 report. Source: supplied Node v4, Laravel driveluxury-v2, and the exact 12-Nov-2026 schema. No new database objects or columns. No original mobile route or response schema was changed. Additive endpoints are documented separately.

## Agreed policies

Both backends ship an identical `config/booking-policy.json`. Node pricing and availability consume it; Laravel `SharedBookingPolicy` consumes the same contract. Deploy both copies together. Do not change one copy independently.

Tax is `currencyRound(max(0, roundedBaseFee - discount) × summedRate / 100)`. Options, insurance, collection/one-way fees and chauffeur excess-km fees remain in the payable net but are excluded from VAT. Explicit fee-only extra-service rows have zero tax. CHF VAT rounds to 0.05, EUR VAT to 0.01; the final ordinary booking amount rounds to whole currency. Type-4 custom/manual services retain their separate legacy rules. Stored historical paid totals are read as recorded, not silently rewritten. Editing a type 1–3 native/front-draft cost recalculates it under the policy; an old initialized gateway intent must settle or be cancelled before a changed amount is charged.

Examples: 960 base at 8.1% => tax 77.75, total 1038. 470 base + 1503 collection => tax 38.05, total 2011. The second screenshot's 2133 total taxes collection and intentionally changes under the requested policy. Existing 1501/1503 collection differences still require the same verified route and home-city inputs; changing tax does not manufacture a fee.

The common physical eligibility query requires active/online/nondeleted vehicle, matching service and country coverage, commissioning by pickup date, no overlapping maintenance block, no live reserved calendar date, and no overlapping active native vehicle assignment. Retired/cancelled/deleted native parents and legs do not retain stale holds. Timed blocks/assignments use half-open intervals; the date ledger remains conservative/inclusive because it stores whole days. Original pickup locality is a preference, then oldest physical ID; country fallback remains. Missing dimensions do not hide classes. Known insufficient capacity is refused at physical allocation. Both Node checkout and the website's final submission now lock selected physical vehicle rows in ID order and recheck eligibility.

The website's arbitrary base-fare >50 display cutoff was removed; its page still requires a positive configured fare. Dated rent-a-car searches now apply that same price-display phase after physical eligibility: pickup season, nearest rental-day band, active country-specific rate first and global rate fallback, then positive base fare, ascending fare and class ID. Rental capacity comes from the same pickup-city-preferred available vehicle used during checkout. Chauffeur/transfer catalog behavior remains indicative as before. No claim is made that an empty schema dump proves the live site's reported vehicle count. `npm run availability:diagnose -- --country-id ID --service-code CAR_RENTAL --start-at ISO --end-at ISO --website-class-ids ID,ID` compares the actual website IDs you supply; without those IDs it reports only physical candidates and mobile results.

## Exact table-to-endpoint mapping

All paths are below `/api/v1`. `FIELD_MAPPING.csv` records business field sources and transformations; `SCHEMA_COLUMN_INVENTORY.csv` lists every supplied column and explicitly marks unmapped tables.

| Mobile flow | Existing native source |
| --- | --- |
| Catalog/services | services |
| Catalog/vehicle-classes and quoted vehicle | vehicle_classes, vehicle_class_countries, vehicles, vehicle_service_types, vehicle_cities, vehicle_original_cities, vehicle_dimensions, vehicle_reserved_dates, vehicle_blocks, reservation_vehicles |
| Catalog/options and class booking-options | rental_options + rental_option_classes; insurance choices from vehicle_classes.half/full_insurance_* |
| Draft quote and payment cost information | rental_seasons, rental_durations, vehicle_class_price_rates, transfer_city_wise_prices, vehicle_class_city_wise_base_rates, tax_surecharges, discount_coupons |
| GET bookings, booking detail, payment-breakdown | reservations, current reservation_details, reservation_costs, reservation_optional_costs, reservation_taxes, reservation_insurances, reservation_flight_numbers |
| Actual customer balance | active reservation_costs on live details minus approved/nondeleted reservation_payments excluding custom_invoices |
| Chauffeur dashboard/assignments | reservation_drivers + existing app_mobile_assignment_ids for independent pickup/collection IDs; drivers |
| Admin billable additional fee | reservation_details.is_extra_service=1 + reservation_costs; activity_logs records durable charge identity and optional expense linkage |
| Driver reimbursement | app_driver_expenses; it is NOT a customer bill by itself |
| Agent identity and client scope | users.role=4, agents.user_id, agencies.status=1, app_agent_customer_assignments |
| Agent dashboard and commission | reservations.agency_id/status + current reservation_details; agency_commissions + agencies.commission |
| Chat history/recipients | reservation_messages, reservation_message_recipients, reservation_message_attachments; existing app_conversations/participants map booking scope |
| Account deletion | users + customers/drivers/agents soft deletion; auxiliary sessions/devices/invitations and memberships revoked; financial history retained |
| Operations mobile queues | app_booking_change_requests, app_booking_cancellation_requests, app_driver_expenses, reservation_service_incidents, contacts, chofers_requests |

Existing app_* draft/quote/session/provider-attempt/identity tables are already in the supplied schema. They are auxiliary; mobile-created bookings and receipts are written to native tables so website/admin reads can see them.

## Additional expenses: exactly what happens

1. Chauffeur submits `POST /chauffeur/assignments/ID/expenses`. This creates a SUBMITTED reimbursement request. It does not alter booking total.
2. Operations approves reimbursement with `PATCH /operations/expenses/ID`. Approval alone still does not charge the customer.
3. Admin explicitly bills it with new `POST /operations/bookings/RESERVATION_ID/customer-charges`, body `{"title":"Parking","amount":30,"expenseId":123}` and a unique `Idempotency-Key` header. Omit expenseId for a direct admin fee. Only role 1 may call it. Expense must be approved, in the same reservation/currency, and not already billed. The durable audit identity prevents duplicate charging even after an HTTP retry. Ordinary native whole-currency rounding applies.
4. The website's existing extra-service editor creates the same native fee-only detail/cost shape. Those rows are picked up automatically as well. There is no 24-hour eligibility cutoff in the supplied business logic; a later 48-hour charge is tested.
5. User reads `GET /bookings/ID/payment-breakdown`. `summary.total`, `summary.paid`, `summary.amountDue`, named expense sections and `payment.paymentId/canPay` show the current balance. Existing `GET /bookings/ID` still exposes costs and payment action with its original keys, and `GET /bookings?status=UNPAID` includes completed rides owing a later fee.
6. Already paid 100 + new fee 30 => total 130, paid 100, due 30. Initially unpaid 100 + fee 30 => one payment for 130. Use existing `POST /payments/PAYMENT_ID/retry` for Stripe setup. A completed ride remains completed after a top-up. Signed gateway settlement writes the native receipt once.

Laravel PayEngine checkout now reads the same outstanding ledger instead of charging the full historical total. A browser success redirect no longer establishes settlement: an authenticated gateway GET must contain matching successful DEBIT/CAPTURE evidence. A deduplicated receipt is inserted into reservation_payments. Website attempt markers in activity_logs prevent concurrent mobile payment and reuse unresolved website orders; gateway failures are released only after server verification. Old paid flags without receipts block automatic rebilling and need operations reconciliation. No guessed historical receipts are inserted.

Gateway evidence references: Nexi PayEngine API https://developer.nexigroup.com/payengine/en-EU/api/payengine-api-v1/ and payment-state guidance https://developer.nexigroup.com/payengine/en-EU/docs/transaction-state-transitions/ . Verification fixtures cover successful, pending, preauthorization-only, wrong amount/currency, refunded and duplicated transaction payloads. No live gateway debit was performed.

## Admin/operations behavior and remaining integration

Native admin edits to status, current price, assigned vehicle/chauffeur, dates, locations, flight number, options and payments are read on the next authorized API refresh. Native status selectors take precedence over stale mobile status metadata. Chauffeur assignment reconciliation runs every five seconds. REST reads are authoritative; a website edit does not automatically redraw a React Native screen that never refetches.

The agent dashboard follows the website's agency scope: `activeBookings` counts non-completed/non-cancelled native reservations for the authenticated `agency_id`, including bookings made by another agent in the same agency. The `clients` value remains the authenticated agent's explicitly assigned roster. Commission is agency-level, as in the Laravel `AgentController`: each current normal reservation detail uses `roundMoney((base_rate - discount) * agencies.commission / 100)`. Options, insurance, tax and later fee-only expenses do not increase commission. `GET /agent/dashboard` and `GET /agent/commissions` read the current active native commission rows, so Laravel admin payments or commission overrides appear on the next refresh.

Live client/chauffeur chat now accepts the existing input aliases and reconciles current native booking membership before joining or emitting. A new five-second native-message poller relays admin-portal reservation_messages through the existing `message.created` event. It uses bounded process-local lookback, is best effort, and does not promise durable push or offline delivery. On reconnect, fetch messages and merge by ID; long transactions/restarts recover through REST. Multiple replicas can emit duplicate IDs, which clients must merge. Role changes/removal evict stale room access before broadcast.

The supplied Laravel archive lacks resources/views and the second mysql_two front-draft schema. It does not contain screens that review all mobile change/cancellation/expense/incident queues. Node operations-workspace APIs provide these queues, but wiring a Laravel portal UI requires its missing templates; no such UI is claimed complete. Node staff authorization still uses its existing broad role checks rather than a complete mirror of Laravel's granular staff permissions. The new customer-billing and account-delete actions are admin-only.

Still requiring mobile/portal UI work or live acceptance: payment breakdown rendering/buttons, gateway SDK setup and redirects, documents/agreements/signatures/deposit and damage flows, manual-service review screens, push delivery configuration, and account-deletion UI. The source for both mobile apps was not attached. Admin manual allocation routes outside final website checkout must also use the shared lock/recheck protocol before claiming every possible cross-application manual assignment race is prevented. The package includes no schema migration to compensate for this.

## Deploy and test

Use the top-level DEPLOYMENT.md in the combined ZIP. Node needs Node >=22.12, `npm ci`, environment credentials, `npm run db:client:verify`, then `npm run build` and `npm start`. Do not run Laravel or Node migrations against the client schema. Keep the website's existing deployed templates, dependencies and mysql_two database when applying its changed files. No production deployment or live database modification was performed here.
