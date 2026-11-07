# Drive Luxury — one-pass catalog, reservation and checkout schema recovery

**Baseline:** `drive-luxury-backend-js-migration-010-schema-fixed.zip` (the last full backend package supplied in this conversation). This release adds read-only preflight, staging-only repair SQL, tests and a safe startup command. **Existing endpoint URLs, request bodies, `response.json(...)` code and status mappings are untouched.**

## Why the 500s kept changing

1. The website's original SQL dump (generated 2026-11-03) contains `services`, `reservations`, `reservation_details`, `reservation_drivers`, `activity_logs`, `reservation_driver_statuses` and `reservation_other_costs`.
2. The merged Node backend expects additional mobile columns and ID allocators from migrations **008**, **009** and **010**. The dump does **not** include those additions.
3. Your logs show at least three missing objects at different points: `reservation_details.mobile_leg_status` (009), `app_mobile_status_event_ids` (010) and `activity_logs.mobile_event_id` (010). One-off column repairs hide later dependencies.
4. `GET /api/v1/catalog/services` now reads the website's `services` table, but website `services.id` is not necessarily the same as legacy `reservations.service_type`.
5. `POST /api/v1/bookings/drafts/:draftId/quote` succeeded; the subsequent checkout failed when writing the first booking timeline event. A successful quote **does not** prove the checkout schema is ready.

## Key storage mappings

| Mobile feature | Authoritative destination | Old source (retained for rollback) |
| --- | --- | --- |
| Services catalog | `services` | `app_service_catalog` (not queried at runtime) |
| Booking header | `reservations` | `app_reservation_meta` |
| Legs and passenger/baggage | `reservation_details` | `app_reservation_leg_meta` |
| Chauffeur assignments | `reservation_drivers` | `app_driver_assignments` |
| Booking history | `activity_logs` | `app_booking_status_events` |
| Chauffeur event mirror | `reservation_driver_statuses` | `app_booking_status_events` |
| Internal chauffeur expense | `reservation_other_costs` (`amount=0`, true cost in `mobile_expense_amount`) | `app_driver_expenses` |
| Incidents (not necessarily vehicle damage) | `reservation_service_incidents` | `app_incidents` |

Original PHP `reservations.status` stays numeric and separate from `lifecycle_status`. Original `reservation_drivers.pick_up_driver_id` and `drop_off_driver_id` remain intact. No frontend JSON changes were made.

## Safe staging procedure (follow in this order)

**1 — Stop both booking-writing applications / workers** that use the target staging database, including the Node API. Take a verified full database backup and test restore. Do **not** repair live production first. MariaDB DDL implicitly commits and is not fully roll-backable.

**2 — Confirm the actual database.** In MySQL Workbench select the staging schema. Run:

```sql
SELECT DATABASE();
```

Confirm it is the exact `DB_NAME` used in your backend `.env`. The repair script intentionally contains **no** `USE` command.

**3 — Perform a read-only baseline scan.** Open `scripts/sql/VERIFY_008_010_READONLY.sql` in MySQL Workbench and execute it. Its first result contains the selected schema; subsequent results list missing fields/index names. It does **not** alter data.

**4 — Inspect migration state** (only if the ledger table exists):

```sql
SELECT filename, checksum, applied_at
FROM app_schema_migrations
WHERE filename LIKE '008_%'
   OR filename LIKE '009_%'
   OR filename LIKE '010_%'
ORDER BY filename;
```

* A row in the ledger does not prove every DDL operation completed; schema comparison is authoritative.
* Do not change stored checksums, delete migration rows, or run `npm run migrate` blindly against a partially imported client database. Older 001-007 migrations may be unrecorded while their tables already exist.
* Do not overwrite an already-applied numbered migration file: its checksum may be part of a release history.

**5 — Repair the staging schema.** Review and execute `scripts/sql/REPAIR_008_010_STAGING.sql`. It:

- Verifies its base legacy/mobile tables exist; stops on a missing prerequisite.
- Adds **only missing** mobile columns and named indexes in the client tables used by migrations 008–010.
- Creates missing ID allocators (`app_mobile_assignment_ids`, `app_mobile_status_event_ids`, `app_mobile_expense_ids`) with `AUTO_INCREMENT` and primary keys.
- Creates/repairs the general `reservation_service_incidents` table and its relationships.
- Seeds allocator IDs from existing archived and normalized records to avoid public-ID collisions.
- Optionally backfills legacy mobile headers, legs, status events, driver-status mirrors, driver expenses and incidents **when the source tables exist** and the assignment migration is complete.
- Refuses to backfill history if original mobile assignments remain unmapped; finish migration 009's assignment reconciliation in staging first.
- Never drops or renames website fields, never overwrites PHP pickup/dropoff drivers, and never silently treats driver outlays as customer charges.

**6 — Run read-only preflight through the backend `.env`:**

```powershell
npm install
npm run db:consolidation-check
npm run db:consolidation-check -- --deep
npm run db:consolidation-check -- --all-api
```

This checks required table/column names, unique/non-unique index definitions, allocator column types and `AUTO_INCREMENT`, the incident foreign keys and optionally old-to-new historical row counts. The deep check reports any historical records not yet backfilled. The optional `--all-api` mode checks presence of every `app_*` table referenced by the broader backend (including optional masked-calling and push integrations). It does not by itself prove every endpoint works. The default mode also checks the checkout foundation tables `app_booking_drafts`, `app_quote_snapshots`, `app_payment_transactions` and `app_idempotency_keys`.

A **PASS** requires zero structural errors and (when using `--deep`) zero unresolved history counts. An informational line that an archived source table still exists is expected.

**7 — Run static checks, then start only if preflight passes:**

```powershell
npm run reservation:storage-check
npm run reservation:relations-check
npm run reservation:workflow-check
npm run db:consolidation-selftest
npm run verify:schema
npm run start:checked
```

`start:checked` runs the real DB preflight BEFORE `npm start`, so an incomplete schema is reported immediately rather than surfacing as another hidden 500 during checkout. `npm start` remains available and its behavior is unchanged.

**8 — Verify frontend/API behavior in staging** using a fresh test booking and Stripe TEST or mock payment setup:

1. `GET /api/v1/catalog/services` returns `items` with unchanged `code,title,description,iconUrl,bookingMode,legacyServiceId` keys.
2. Create/save/quote a draft; record the newly returned quote snapshot ID and expiration.
3. Checkout with `POST /api/v1/bookings/drafts/:id/checkout`, `{}` and an `Idempotency-Key` header. Expected `201`; inspect its `bookingId` and `payment.id`.
4. Confirm the new row is in `reservations` with `lifecycle_status='PAYMENT_PENDING'`, numeric legacy status still present, and details in `reservation_details`.
5. Check at least one `activity_logs` row where `feature_name='mobile_booking_status'` and `mobile_event_status='PAYMENT_PENDING'`.
6. Verify `GET /api/v1/bookings/:bookingId` and your existing frontend binding; all keys and types should match previous working responses.
7. In staging, exercise chauffeur pickup/dropoff assignment, status/tracking, expense submission, incident review, payment/cancellation, and PHP website booking operations.

**9 — Only after testing** promote the verified DB changes and matching backend to production during a scheduled maintenance window. Do not delete archived `app_*` tables yet.

## Checking draft 269 / quote 167 without duplicating reservations

```sql
SELECT d.id,d.status,d.reservation_id,d.quote_snapshot_id,d.revision,
       q.valid_until,q.draft_revision,NOW() AS database_now
FROM app_booking_drafts d
LEFT JOIN app_quote_snapshots q ON q.id=d.quote_snapshot_id AND q.draft_id=d.id
WHERE d.id=269;
```

* If `reservation_id` is not `NULL`, inspect that booking. Do not create another.
* If the quote is expired, generate a **fresh** quote before checking out.
* A `409` caused by an in-progress checkout idempotency key is not a schema error; inspect the previous result first. The original middleware reserves in-progress keys for five minutes.
* The log lines for payment IDs 108–111 describe repeated expired-hold cleanup attempts, not necessarily new payments.

## What has and has not been verified

* Complete ZIP structural integrity and JavaScript syntax can be verified offline.
* SQL source scans can flag unaccounted insert/update columns, but cannot validate real row-level constraints or query plans.
* All preflight and self-tests use either static source or simulated information_schema metadata unless executed against **your own configured staging DB**.
* **No live database was connected in the preparation of this package. No full Stripe, PHP-website, or authenticated mobile end-to-end transaction was executed.** The package cannot be declared production-ready until the staging steps above pass.

## Contents and explicit non-changes

New:
- `scripts/lib/consolidation-schema-spec.mjs`
- `scripts/lib/consolidation-schema-check.mjs`
- `scripts/check-consolidation-schema.mjs`
- `scripts/selftest-consolidation-schema.mjs`
- `scripts/sql/REPAIR_008_010_STAGING.sql`
- `scripts/sql/VERIFY_008_010_READONLY.sql`
- `docs/COMPLETE_CATALOG_RESERVATION_SCHEMA_REPAIR.md`

Modified:
- `package.json`: adds `db:consolidation-check`, `db:consolidation-selftest`, `start:checked` scripts only.

Unchanged: ALL pre-existing `src` runtime files, existing migrations 001–010, routes, request validation, `response.json` response expressions, UI, pricing and Stripe logic.
