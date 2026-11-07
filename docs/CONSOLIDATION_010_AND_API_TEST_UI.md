# Drive Luxury: status events, expenses, incidents and API Test UI

Release 2.3.0 (additional migration 010). Changes build on previous service catalog and migrations 008/009.

## Table mapping and compatibility

| Former mobile storage | Updated canonical storage | Why |
| --- | --- | --- |
| `app_booking_status_events` | `activity_logs` (canonical timeline) + `reservation_driver_statuses` (chauffeur-only mirror) | Preserve complete notes, locations, event order and driver status integration. Public event IDs unchanged. |
| `app_driver_expenses` | `reservation_other_costs` | Adds mobile fields such as `mobile_expense_amount`, `mobile_expense_status`, `mobile_expense_id` to original table. Public expense IDs unchanged. |
| `app_incidents` | `reservation_service_incidents` | Generic safety, delay and passenger issues are not physical vehicle damage. A nullable `vehicle_damage_id` can link an incident to a verified `reservation_vehicle_damages` row. |

The existing website columns, numeric reservation statuses, pickup/dropoff driver fields and damage/inspection records are not renamed or removed. All old app tables remain as **read-only rollback sources** after cutover. All mobile APIs keep their original routes, response JSON keys, and historical public identifiers.

**Caution:** The PHP website has not been audited. Even with `amount=0` on mobile expense rows, verify that its cost listings, invoice calculations, activity feeds and chauffeur status pages handle rows with `type='MOBILE_DRIVER_EXPENSE'` and `source='mobile_app'` as intended. Testing against a live website is required before production deployment.

## Migration (STAGING FIRST)

1. Restore a *verified* full production backup into a **separate staging database**. Include all existing mobile tables and data, not just website SQL schema. Keep the application pointed to staging.
2. Ensure migrations `001` through `009` (especially `008` and `009`) were applied and verified. Backfill and foreign-key changes in `009` are required for `010`.
3. Stop **all old mobile API writes** (booking requests, Stripe webhooks, chauffeur updates, jobs). If needed, schedule maintenance. PHP website writes that race the migration should also be paused where possible.
4. Apply `migrations/010_consolidate_status_expenses_and_service_incidents.sql` with MySQL Workbench on **staging**. The migration adds columns, indexes, two ID-only allocators and one service incident table; then it backfills historical mobile events/expenses/incidents. No old table is deleted.
5. Run `scripts/verify-migration-010.sql`. Every *missing*, duplicate, or double-charge count must be **zero**. Also run the verification scripts from previous migrations.
6. Deploy the updated Node.js application to staging **after** migration 010. Keep a consistent migration ledger: the bundled `npm run migrate` processes *all* unrecorded SQL files and cannot be pointed at an imported DB with incomplete migration history without reconciliation. MariaDB `ALTER TABLE` DDL auto-commits; a failed migration may leave some columns created, so check actual schema before retrying.
7. Exercise the APIs and PHP website; compare old and new response payloads for the same bookings, driver statuses and historical events. Verify incident document IDs and exact expense amounts.
8. Only after a successful, documented staging run, plan a production maintenance window with backup, contingency rollback, and verified migration ledger.

**Never** run the migration against production just to resolve an `ENOENT` error from a Node.js self-test. Tests only require SQL files to exist on disk; applying the database migration is a separate operation.

## Test commands (PowerShell or terminal)

Run these from the project root:

```powershell
npm install
npm run syntax:check
npm run reservation:storage-check
npm run reservation:relations-check
npm run reservation:workflow-check
```

The above tests validate source changes, SQL shape, response JSON expressions and in-memory mocked helper behavior. They do not connect to your actual database.

Start two terminal windows:

```powershell
# Terminal 1 (updated backend with .env pointing to STAGING)
npm start
```

```powershell
# Terminal 2 (local UI server + same-origin API proxy)
npm run test-ui
```

Open **http://127.0.0.1:4173** in your browser. The UI server only binds to `127.0.0.1`, forwards traffic **only** to the local API at `127.0.0.1:3000`, and keeps authentication tokens in browser memory (not localStorage). You can change its port using `TEST_UI_PORT` and the backend target port using `TEST_UI_BACKEND_PORT`, but do not publish this test-only tool to the internet.

### UI flow

1. **Overview:** check backend `/health`, log in with a staging account or paste an existing bearer token.
2. **Service catalog:** fetch `GET /api/v1/catalog/services` and optionally countries/vehicle classes. Compare with SQL `SELECT * FROM services`.
3. **Booking journey:** create a draft, submit valid details, quote, optional staging checkout, list bookings, fetch details and timeline. Update the sample JSON's class/country/city IDs before requesting a quote.
4. **Chauffeur app:** use a Chauffeur-role token, load dashboard, fetch assignment, acknowledge, advance statuses, submit expenses or incidents.
5. **Operations desk:** switch to an Admin/Staff token, assign a driver, approve expenses and close incidents. Use returned public IDs from previous steps.
6. **API request lab:** make arbitrary approved local API requests and inspect method, HTTP status, duration and response JSON.

The UI does not bypass authentication, live vehicle availability, the Stripe payment gateway, or the driver's legal status transition sequence. A 401, 403, 409 or 422 can indicate a valid business rule rather than a UI defect. **Checkout can create a real payment intent**: only enable it on staging with test credentials.

### API response contracts intentionally preserved

- Catalog: `{ items: [{ code, title, description, iconUrl, bookingMode, legacyServiceId }] }`
- Booking details: `{ ...booking, legs, costs, events, assignments, payments }`
- Booking tracking: `{ assignment, location, locationIsStale, staleAfterSeconds, serverTime, assignments, timeline }`
- Chauffeur expense creation: `{ id, status: 'SUBMITTED' }`
- Chauffeur incident creation: `{ id, status: 'OPEN' }`
- Operations expense/incident review: `{ id, status }`

Request-only optional addition: `vehicleDamageId` may be provided **only** when incident type is `ACCIDENT` or `VEHICLE_ISSUE`, and only if the referenced damage record belongs to the same reservation leg. All previously valid incident requests remain valid without it.

## Data verification notes

`app_booking_status_events.id`, `app_driver_expenses.id` and `app_incidents.id` are preserved as public IDs. The first two use lightweight ID allocators to avoid conflicts with unrelated website row IDs. `reservation_service_incidents.id` preserves historical incident IDs directly.

Do not delete the former app tables until rollback, counts, timelines and referential integrity have been verified across both mobile and website systems.
