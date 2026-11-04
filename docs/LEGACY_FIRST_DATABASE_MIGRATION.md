# Drive Luxury — legacy-first mobile schema (November 3, 2026)

## Scope and release status

This release refactors the uploaded Node/Express backend against the client's uploaded `o56gps_reza_drive_luxury.sql` export (MariaDB 10.6). It **does not alter the provided production SQL export**, nor directly connect to the client's live database. The project ZIP is a **staging candidate**, not a proven production deployment: dependency installation, live migrations, API integration tests, and website/PHP flows must pass on a fresh staging clone.

The existing mobile HTTP endpoints, public route definitions, OpenAPI JSON, response object fields, and frontend booking journeys are retained. The database backing of those endpoints changes; do not migrate until staging regression tests succeed.

## Database inventory

- Existing website tables: **165** as exported, unchanged in name, PK definition, and original column definitions.
- New app-owned physical tables: **29** (down from **35**). Includes the six agreed foundation tables and the specialized workflow tables needed to avoid storing gateway/approval/GPS/push state in unrelated website records.
- Six former app shadow tables become **read-only SQL views** backed by original tables: `app_service_catalog`, `app_reservation_meta`, `app_reservation_leg_meta`, `app_driver_assignments`, `app_messages`, `app_notifications`. They preserve existing SELECT-query aliases; code now writes to the original tables.
- Additive legacy columns: **30**, and additional indexes, in **five** original tables. No original keys or existing column types are dropped/modified/renamed.

### Original tables extended, not replaced

| Original table | New columns | Purpose |
|---|---|---|
| `reservations` | `service_code`, `source_channel`, `created_by_user_id`, `created_by_agent_id`, `lifecycle_status`, `currency_code`, `quote_snapshot_id` | Mobile booking context with original `id`, numeric status, customer and agency unchanged |
| `reservation_details` | `sequence_no`, `vehicle_class_id`, `passenger_count`, `luggage_count`, `pickup_details`, `dropoff_details`, `flight_number`, `app_leg_status` | Mobile leg details; existing pickup/dropoff and trip-status fields preserved |
| `reservation_drivers` | `app_assignment_status`, `scheduled_start_at`, `scheduled_end_at`, `acknowledged_at`, `declined_at`, `decline_reason`, `started_at`, `completed_at`, `assigned_by_user_id` | Chauffeur mobile workflow on the original assignment ID |
| `reservation_messages` | `message_type`, `document_id` | Chat messages stored in the website table rather than a new shadow message table |
| `notifications` | `app_mobile_id`, `app_type`, `app_title`, `app_body` | Mobile notifications in the original UUID-keyed notification table; `app_mobile_id` is a new unique auto-increment **secondary** key, not a replacement of `notifications.id` |

### Six foundational app tables kept

`app_booking_drafts`, `app_quote_snapshots`, `app_api_request_logs`, `app_password_reset_tokens`, `app_refresh_tokens`, `app_user_devices`.

### Specialized app tables retained deliberately

`app_schema_migrations`, `app_account_invitations`, `app_agent_customer_assignments`, `app_driver_locations`, `app_driver_expenses`, `app_booking_change_requests`, `app_booking_cancellation_requests`, `app_payment_webhook_events`, `app_idempotency_keys`, `app_user_oauth_accounts`, `app_push_delivery_jobs`, `app_push_delivery_tickets`, `app_masked_calls`, `app_telnyx_call_routes`, `app_telnyx_webhook_events`, `app_booking_status_events`, `app_documents`, `app_incidents`, `app_payment_transactions`, `app_conversations`, `app_conversation_participants`, `app_vip_requests`, `app_concierge_requests`.

These are not additional authoritative reservation/customer/driver/payment-ledger master tables. `app_payment_transactions` remains the **Stripe gateway transaction** record; `reservation_payments` remains the **legacy financial payment ledger**. `app_conversations`/participants preserve membership and realtime conversation IDs, while the messages themselves now live in `reservation_messages`. `app_documents` retains private-file ownership, expiry and storage metadata, because a simple mapping to one legacy file table would lose access controls.

## Changes to code

- `src/services/booking-service.js`: populate extra fields on existing `reservations`/`reservation_details` rows; keep one confirmed booking and leg record.
- `src/modules/operations.js`: assign a chauffeur once in `reservation_drivers`; use that legacy ID as mobile `assignmentId`; cancel/replace legacy rows in the same transaction.
- `src/modules/chauffeur.js` and `src/services/legacy-trip-status.js`: update the legacy assignment and `reservation_details.app_leg_status`; record mobile status transitions in `reservation_driver_statuses`; map to existing `reservation_statuses` where a matching slug/name exists; no invented legacy status IDs.
- `src/modules/communication.js`: insert chat into `reservation_messages`; compatibility view reads existing reservation messages.
- `src/services/notifications.js`, `src/modules/notifications.js`: persist the inbox in original `notifications`, retain numeric mobile notification IDs using the new secondary key, and queue Expo jobs transactionally.
- `src/scripts/migrate.js`: preflight both checksum conflicts and old app shadow tables **before** applying the new 000 legacy ALTER migration.
- `src/scripts/setup-api-audit.js`: recognize MariaDB's JSON-as-LONGTEXT schema representation.
- Original `src/app.js`, all route registrations, and `docs/openapi.json` were left unchanged.

## Deployment procedure — NOT on the live website database first

1. Back up the client's live database using a consistent snapshot, and restore it to a **separate staging database**. Ensure original website rows and indexes are present. Keep production and staging credentials separate.
2. Confirm staging has **no previously applied old app migrations or app shadow BASE TABLES** named `app_reservation_meta`, `app_reservation_leg_meta`, `app_driver_assignments`, `app_messages`, `app_notifications` or `app_service_catalog`. This ZIP is a **fresh mobile-schema installation candidate**. It cannot automatically upgrade an environment where the previous `001_release_1_mobile_foundation.sql` was already applied: data migration, FK remapping and checksum history require a separate staged conversion. The new migrate preflight intentionally refuses that case, **before any legacy table ALTER**.
3. Ensure the database account has `ALTER`, `CREATE`, `CREATE VIEW`, `SELECT`, `INSERT`, `UPDATE`, plus FK/index privileges on the staging database. The website remains online only during planned schema operations; review lock impact for large legacy tables.
4. Configure staging `.env` to the **correct client database name**, not the fallback `drive_luxury`. Do not commit secrets or embed them in a ZIP.
5. On staging, from `backend/`: `npm ci`, `npm run verify:schema`, `npm run db:preflight`, `npm run legacy-first:selftest`, then (only on an isolated staging DB) `npm run migrate` and `npm run verify:legacy-first`.
6. Run the existing `npm run syntax:check`, `npm test`, Stripe/push tests and a **real HTTP API regression suite** using a staging application and representative staging rows. Test the website PHP application on the same staging database in parallel.
7. Resolve all failed tests, obtain a migration/rollback window, and only then deploy to production. MariaDB DDL causes implicit commits; `ROLLBACK` cannot reliably undo applied `ALTER TABLE` or `CREATE VIEW`. **Restoring a verified backup is the disaster-recovery path.**

### API regression checklist

- Client/agent/chauffeur login, role and token refresh, existing users, and profile updates.
- `/catalog/services`, countries/cities/vehicle classes, time-window availability, and latest website prices.
- Draft → details → quote → checkout; checkout Idempotency-Key; same reservation details from both mobile and website.
- Stripe success/failure/webhook replay/refund, old and app payment reconciliation; vehicle hold expiration.
- Website-originated bookings visible in client/agent mobile lists, with legacy-status fallbacks.
- Operations assign/reassign/cancel chauffeur; old and new assignments; driver acknowledgment, trip status and GPS feed; website visibility of statuses.
- Chat across website and mobile, including document attachments and read/unread counts; notifications and Expo push job receipts.
- Airport VIP/concierge approval, booking change/cancellation approval, and commission/invoice integration.
- No altered JSON keys, response codes, route paths or external API request fields compared with the frontend expectations.

## Known limitations / decisions still to verify

- **Not live-tested.** The provided production export is schema-only, so real service IDs, prices, user role distributions, statuses, and website notification morph types are unknown. The migration has not been executed against a real MariaDB server in this environment. MariaDB 10.6-specific DDL and views must be tested on staging.
- The view for `app_service_catalog` uses the existing reservation service-type mapping 1/2/3. It references website `services.id` 8/7/10 for optional descriptions/icons, matching the previous catalog assumptions; validate against live website data.
- The view for `app_driver_assignments` uses the legacy pickup driver, otherwise the dropoff driver. Legacy chauffeur assignments receive scheduled-time fallbacks; verify all historical bookings and driver transition rules before exposing old assignments to the mobile app.
- `app_notifications` exposes original website notifications with a common `App\\Models\\User` morph; confirm PHP's actual `notifiable_type` values before enabling push or running notification read-all. Legacy website notification JSON formats may need additional display mapping. Do not mark other notifiable models' records read.
- Chat messages are in `reservation_messages`, but a conversation must exist for the mobile conversation list to expose website messages; legacy attachment/file-serving access needs staging verification for private document posts. No direct website file-serving behavior was modified.
- Payment and agency commission reconciliation must be tested with the website's actual workflows. Existing `agency_commissions` is read by the backend, but mobile checkout does not create that commission itself. `INVOICE_ADAPTER` remains disabled until explicitly configured.
- Masked calling remains the **existing Telnyx/mock integration**; this database refactor does not implement or silently switch to Twilio. Provider migration requires a separate tested change.
- No stored card numbers, CVV/CVC, or other sensitive payment card details should be written into legacy card-storage tables by the mobile app. Stripe should own sensitive card data.

## Verification evidence in this package

- `node scripts/check-syntax.js` passed for all JavaScript files.
- `node scripts/selftest-legacy-first.mjs` passed: 29 new base tables, six read compatibility views, legacy-first writes and migration safety assertions.
- A programmatic comparison against the 165-table uploaded SQL export found no pre-existing table/column collisions or unsigned integer FK type mismatches in the proposed schema.
- The OpenAPI document and `src/app.js` are byte-for-byte unchanged from the uploaded ZIP; response-call sequences in edited route modules were checked for unchanged method shapes.
- A full `npm ci` could not complete in this isolated runtime because required registry packages were not available in the local cache and network install timed out. Therefore Vitest/integration tests were **not run** and the ZIP should **not** be described as fully verified for production until staging passes.


### Extra safety check for missing legacy website tables (2026-11-04)

`npm run db:preflight` checks the selected `DB_HOST`/`DB_NAME` and confirms that
all legacy base tables required by this release exist, including the website-owned
`reservation_messages`, `notifications`, `reservation_driver_statuses`, and
`reservation_statuses`. It is read-only. The migration runner performs the same
preflight automatically before any DDL. If this check fails, **do not** run
migration or create substitute `app_` copies of those website tables: use an
isolated staging clone of the complete original database instead.

`npm run verify:legacy-first` is exclusively a **post-migration** check and will
report missing mobile views/columns before the migrations have been applied.
