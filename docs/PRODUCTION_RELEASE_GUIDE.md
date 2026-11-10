# Drive Luxury release candidate 10 November 2026

This package implements the original-backend parity corrections in the Node mobile backend. Existing API route declarations, request schemas and response field names are retained. The original PHP application is not modified by this ZIP. Use the matching database upgrade before starting this release.

## What changed

- Catalog options retain the existing GET /catalog/options contract. New selections must be active, visible and valid for the service and vehicle class. Selected extras are saved in native reservation_optional_costs and included in native costs and taxes.
- Extras use quantity times configured amount; based_on=1 also multiplies native duration units (hours for chauffeur, days for rental). The supplied public/Manage Options code charges the configured amount even when rate_type=2. This release follows that policy and retains the flag; a percentage interpretation would need a client business-rule decision.
- VAT uses EUR cents and CHF 0.05 increments. Displayed tax lines sum to aggregate VAT. Coupons reduce the taxable base. Native whole payable rounding remains. Car rental native net_cost includes VAT as the original admin expects; API line fields retain their existing meaning.
- Directional transfer fares prefer the exact direction. Transfer-only native rates remain visible. Chauffeur pricing prefers active duration band 15. Collection fees use vehicle_original_cities rather than service coverage cities.
- Candidate vehicles require status=1, eligible online/service/country coverage, service-entry date and sufficient capacity. Positive luggage requests require a numeric bag-count value; free text/liters need operations review. City coverage ranks candidates rather than excluding all country fallback candidates.
- Native coupons use validity/type/usage limits, snapshot consistency and a row lock at redemption. Fixed discounts allocate once across legs. Private coupon metadata is never returned by the quote API.
- Agency commissions synchronize base less discount while preserving paid money and manual overrides. Unrelated booking changes retain current native extras and agreed unit amounts, preserve the existing absolute discount and update native coupon totals.
- Native admin assignment/status changes reconcile to independent pickup/dropoff tasks, buffered driver availability, inbox records and push jobs. Native chargeable no-show/cancelled outcomes end the task without automatically cancelling/refunding the entire booking.
- Booking reads omit inactive native leg history and refresh native location fields. Changed addresses clear stale coordinates/place IDs. Original native driver and trip status classes remain separate.
- Payment retry checks current native cost, currency and recorded payments. A stale attempt returns the existing error envelope with a reconciliation code. Concurrent confirmations write the native payment once. A signed late success after a native financial edit records actual same-currency money and flags reconciliation without reviving the ride.
- Native notifications use App\User by default. New mobile financial writes mark reservations dirty for Zoho sync; this does not execute Laravel observers.

## Exact cumulative database scope

| Item | This release target |
| --- | --- |
| Original tables reused | 57 of 165 |
| Active additional base tables | 26 |
| New table creations if the reported three ID tables exist | 24 |
| Retained active reported ID tables | app_mobile_assignment_ids, app_mobile_status_event_ids |
| Retired reported table preserved | app_mobile_expense_ids |
| Pending columns if the reported 51 are present | 35: 20 native fields plus 15 assignment-map fields |
| Pending indexes on existing tables | 18: 15 native plus 3 assignment-map indexes |
| Compatibility views | 5 |
| Owned triggers | 14: 4 metadata plus 10 concurrency |

Compared with the previous 9 November implementation, add only one table (app_vehicle_booking_locks), two native indexes and ten concurrency triggers. No further existing-table columns are introduced by this parity patch. Seven lock-table columns and its two secondary keys are included in its CREATE TABLE, not the pending 35-column/18-index totals.

The lock table is a derived current/future occupancy index rebuilt from reservation_vehicles, vehicle_reserved_dates and vehicle_blocks. Native business rows remain authoritative. Triggers serialize competing allocations by locking the physical vehicle and reading current claims. Claims use inclusive dates, matching the existing day-based reservation ledger. Same-reservation legs may share a vehicle. Existing overlapping future reservations stop the upgrade for operations review.

Exact cumulative definitions are in db/client-schema.json, db/client-target-tables.sql, db/SCHEMA_CHANGES.md and the accompanying DBA DOCX. Definitions in the original reported list are reported applied, not verified against the hosted database. The upgrade checks actual types and key definitions before accepting them.

## Local commands

Use Node 24 (22.12+ supported) and a separate MySQL copy of the client database. Configure .env from .env.example with your database and provider settings. No real credentials are included.

```powershell
npm ci
Copy-Item .env.example .env
# Edit .env before continuing
npm run db:client:plan
npm run db:client:upgrade
npm run db:client:verify
npm run build
npm run payment-options:selftest
npm run start:checked
```

On Linux/macOS, use cp .env.example .env. Keep existing configured provider keys when replacing a local backend. PAYMENT_PROVIDER=mock is local-only; production configuration rejects mock payments and unverified route distances.

The plan is read-only. The upgrade requires table DDL, CREATE VIEW, TRIGGER and data privileges. It performs conditional backfill, rebuilds occupancy claims and recreates owned views/triggers. MySQL DDL commits immediately. Stop both PHP and Node writers, take a verified backup and leave writers stopped until upgrade and verification pass. Resolve any reported mismatch or future vehicle conflict, then rerun. Existing client triggers are preserved. Do not replay historical migrations 001–010 or treat the table-only SQL reference as the whole upgrade.

The automated test:client-db command inserts fixtures and requires CLIENT_DB_TEST_DISPOSABLE=true. Run it only on a disposable empty imported schema, never your populated client database. Normal testing uses your copied client data and the existing frontend/API tester.

## Production acceptance

1. DBA reviews the cumulative request, object permissions and future-conflict report. Run the upgrade in maintenance mode on staging and compare native data/backfill counts.
2. Use the actual PHP admin to inspect a customer booking and an agent-created customer/booking. Verify costs, optional costs, coupon rows, commission, flight and vehicle records.
3. Select configured extras through the existing UI, quote and checkout. Verify one-time versus duration-based units, quantities, title, tax and stored amounts. The frontend must already send options; backend work cannot add missing UI controls.
4. Assign distinct pickup/dropoff drivers in the admin, change/remove a driver, acknowledge and complete tasks. Confirm independent task states, native trip selector, notification inbox and actual Expo delivery.
5. Attempt concurrent allocations from PHP and Node for the same vehicle. Confirm one rejects and the PHP admin presents a usable error. Test cancel/reopen and manual blocks.
6. Verify native admin local-time interpretation against UTC API timestamps, especially rental delivery/collection and chauffeur duration.
7. Use Stripe test mode with real signed webhook delivery. Test pay later after assignment/completion, failure/retry, duplicate events, late success after an admin fare edit, manual payment and cancellation/refund accounting. Mock HTTP tests are not a real provider delivery.
8. Verify Google Routes/Places, SMTP, private uploads, Telnyx and Expo on hosting. Test actual worker scheduling and provider network access. Confirm native Zoho/Odoo/email sync expectations; Node does not invoke Laravel observers.

Operator-priced Others remains manual; VIP/concierge are inquiries. Internal chauffeur expenses stay separate from customer billable costs pending accounting approval. The original admin may need screens for mobile-only approval workflows. Native replacement-leg assignment IDs and historical ownership links need acceptance on populated client data. Do not interpret successful schema verification as certification of all production integrations.

## Rollback

Keep the previous backend artifact, a full pre-upgrade database backup and the approved change request. For a failed migration leave writers stopped; diagnose the exact failing object and rerun after correction or restore the full verified database backup together with its matching backend. Do not drop shared columns/tables or roll back only the code while leaving incompatible views and triggers active. Never delete client business rows to clear an occupancy conflict.
