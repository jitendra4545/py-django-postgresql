# Drive Luxury — Legacy-first backend: final staging test handover (2026-11-04)

## Purpose, safety, and honest status

This ZIP is a **staging-test candidate**, not a production-certified release. It is based on `drive-luxury-backend-legacy-first-2026-11-03.zip` and the uploaded production-schema SQL export (MariaDB 10.6). The export contains table definitions rather than representative business records; we have **not** run real SQL migration, end-to-end API, Stripe, website or frontend tests against a staging MariaDB instance.

Do **not** apply migrations to the client's live database first. Restore a consistent production backup into an isolated staging database. Do not replace the original website database with the SQL migration files in this ZIP.

## What database tables are used?

**Authoritative existing website tables** (no original columns/keys removed or changed by the mobile migration):

| Data domain | Original tables reused | Source of truth |
| --- | --- | --- |
| Identity and roles | `users`, `roles`, `model_has_roles`, `customers`, `agents`, `agencies`, `drivers` | Original identities; mobile token/session state is separate |
| Locations | `countries`, `cities` | Operational country/city IDs; not the website-locator tables |
| Catalog and inventory | `services`, `vehicles`, `vehicle_classes`, `vehicle_cities`, `vehicle_service_types`, `vehicle_blocks`, `vehicle_reserved_dates` | Real fleet and availability; `website_vehicles` is presentation content |
| Pricing | `vehicle_class_price_rates`, `vehicle_class_city_wise_base_rates`, `transfer_city_wise_prices`, `rental_options`, `rental_option_classes`, `rental_seasons`, `rental_durations`, `tax_surecharges` | Website-compatible rules; validate actual populated rate rows |
| Confirmed bookings | `reservations`, `reservation_details`, `reservation_itineraries`, `reservation_vehicles`, `reservation_drivers` | One reservation, leg, vehicle and chauffeur assignment per business event |
| Booking amounts and discounts | `reservation_costs`, `reservation_optional_costs`, `reservation_taxes`, `reservation_insurances`, `reservation_discounts`, `discount_coupons` | Legacy booking charges |
| Payment and commission ledger | `reservation_payments`, `agency_commissions`, `agency_payments` | Legacy financial/accounting records; Stripe gateway transactions separate |
| Trip statuses | `reservation_statuses`, `reservation_driver_statuses`, `reservation_details.trip_status_id` | Shared status catalog and visible trip updates |
| Chat and documents | `reservation_messages`, `reservation_message_attachments`, `reservation_message_recipients`, `reservation_files`, `customer_files`, `driver_files`, `media_files` | Shared legacy business messages/files where supported; mobile document metadata separate |
| Notifications | `notifications` | UUID website notifications with a new additive numeric mobile identifier |
| Invoicing and refunds | `reservation_invoices`, `reservation_invoice_details`, `custom_invoices`, `credit_notes`, `refund_vouchers` | Website financial documents; invoice adapter needs configuration |
| Operational auditing | `activity_logs`, `route_access_logs`, `error_logs` | Website audit context; API diagnostic logs remain separate |

**Six foundation tables retained unchanged in concept**: `app_booking_drafts`, `app_quote_snapshots`, `app_api_request_logs`, `app_password_reset_tokens`, `app_refresh_tokens`, `app_user_devices`.

**23 other specialized app tables retained** (these hold unique technical/workflow state, not duplicate customer/reservation masters):

`app_schema_migrations`, `app_account_invitations`, `app_agent_customer_assignments`, `app_booking_status_events`, `app_concierge_requests`, `app_conversation_participants`, `app_conversations`, `app_documents`, `app_driver_expenses`, `app_driver_locations`, `app_idempotency_keys`, `app_incidents`, `app_masked_calls`, `app_payment_transactions`, `app_payment_webhook_events`, `app_push_delivery_jobs`, `app_push_delivery_tickets`, `app_telnyx_call_routes`, `app_telnyx_webhook_events`, `app_user_oauth_accounts`, `app_vip_requests`, `app_booking_change_requests`, `app_booking_cancellation_requests`.

**Six app compatibility VIEWS instead of duplicate physical tables**: `app_service_catalog`, `app_reservation_meta`, `app_reservation_leg_meta`, `app_driver_assignments`, `app_messages`, `app_notifications`.

**Five original tables receive only additive mobile columns and indexes** under migration 000: `reservations` (+7 columns), `reservation_details` (+8), `reservation_drivers` (+9), `reservation_messages` (+2), `notifications` (+4) = **30 new columns**. Original names, original values, and original primary-key definitions remain. The `notifications.app_mobile_id` addition is a secondary unique AUTO_INCREMENT key; `notifications.id` stays its original CHAR(36) primary key.

## What was fixed in THIS final ZIP?

1. Added forward-only **`migrations/008_correct_legacy_status_views.sql`**. The original 000..007 files/checksums are preserved. A rejected mobile reservation retains API status `REJECTED`, even if the legacy numeric reservation status is 3. An app chauffeur assignment that is `DECLINED`, `NO_SHOW`, or `COMPLETED` is no longer incorrectly shown as `CANCELLED` solely because of legacy `reservation_drivers.status=2`.
2. Added `src/common/utc-sql-datetime.js` and updated `src/modules/operations.js`, `src/modules/chauffeur.js`, and `src/modules/bookings.js` to normalize explicitly offset ISO timestamps into UTC for SQL DATETIME columns. This fixes timezone drift in chauffeur availability/assignment, status events, GPS points, expenses, Airport VIP, and concierge requests. Existing `Z` timestamps continue to work.
3. Allowed explicit valid ISO offsets through the existing Zod datetime fields in these modules (`.datetime({offset:true})`). Request keys and response objects were **not** renamed.
4. Added `npm run compat:selftest` with seven dependency-free compatibility regression checks. Source route registration (`src/app.js`) and `docs/openapi.json` are **byte-for-byte unchanged** from the supplied legacy-first ZIP (96 OpenAPI operations).

No original table/key definition was modified in this follow-up migration. `CREATE OR REPLACE VIEW` only changes the two app views shown in item 1. It does not overwrite website rows or columns.

## Supported upgrade paths (very important)

- **New staging copy containing ONLY the original website schema:** run migrations 000..008 in order via `npm run migrate` only after `npm run db:preflight` has confirmed the complete website schema and `.env` points to staging.
- **Staging with the earlier legacy-first 000..007 migrations already applied successfully:** unchanged checksums let `npm run migrate` apply **only migration 008**, provided the previous files match exactly.
- **Staging or production with the older pricing-aligned / pre-legacy-first `app_reservation_meta`, `app_messages`, `app_driver_assignments`, etc. as physical BASE TABLES:** **STOP**. The migration intentionally refuses to run. It needs a separate preserving/backfill migration and reviewed conversion; do not DROP or overwrite those existing tables.
- **Partially applied old migrations:** STOP, inspect the actual objects and `app_schema_migrations` state; MariaDB DDL has implicit commits. Do not retry blindly.

## Staging commands (Windows PowerShell, inside the extracted `backend` folder)

```powershell
Copy-Item .env.example .env
# Edit .env with staging-only DB_HOST, DB_NAME, DB_USER, DB_PASSWORD,
# JWT_ACCESS_SECRET and JWT_REFRESH_SECRET; configure sandbox services.
npm ci
npm run syntax:check
npm run legacy-first:selftest
npm run compat:selftest
npm run verify:schema
npm run db:preflight  # read-only: confirms complete website schema and selected DB
npm run migrate
npm run verify:legacy-first
npm test
npm start
# Separate PowerShell window:
Invoke-RestMethod http://localhost:3000/health
```

Expect `/health` to return JSON `{"status":"ok","version":"2.3.0"}`; this is a process smoke test, **not** proof that database-backed APIs work. Execute actual authenticated API calls afterward with your existing frontend or Postman collection. For `POST /api/v1/bookings/drafts/:id/checkout` include the `Idempotency-Key` header as documented. Never use production Stripe keys for staging payment tests.

## Required integration tests before production approval

| Test area | What must pass |
| --- | --- |
| Shared identity | Existing website client / agent / chauffeur login, role matching, profile, token refresh, password reset |
| Catalog | Service IDs, availability by country/city, only permitted available vehicles, options, pricing using actual website rate records |
| Booking | Mobile draft → details → quote → checkout → website reservation appears; website-originated booking appears with expected status in mobile lists |
| Chauffeur | Available/assign/decline/acknowledge/complete/reassign, no stale `reservation_drivers`, overlap detection, trip status history, GPS and timezone correctness |
| Payments | Stripe sandbox success/failure/webhook retry/refund, legacy `reservation_payments` reconciliation, vehicle hold release |
| Client and agent | Upcoming/completed/live and history pagination, agency visibility and commission generation ownership |
| Chat/notifications | Website/mobile messages, conversation creation for website bookings, unread/read, Expo push queue & receipts, correct website notification morph type |
| Supporting | Document access and attachment permissions, VIP/concierge, cancellation/change workflow, invoice adapter |
| API compatibility | Actual JSON response snapshots (paths, status codes, types, names, nullability, nested fields) compared against the integrated frontend expectations |

## Remaining production dependencies and limitations

- **Full npm/Vitest and HTTP integration tests not run in this environment.** Dependencies were not installable from npm registry (`EAI_AGAIN`), and there is no configured MariaDB staging server or valid payment credentials in this isolated session. Only static checks and dependency-free regression tests passed.
- **Cannot guarantee no effect on website or frontend without staging data.** Confirm actual legacy statuses, agent commission workflow, currency and service IDs, PHP morph types, vehicle price values, payment gateway settlement, and website booking changes.
- `INVOICE_ADAPTER` defaults to `disabled`; invoice endpoints require explicit staging configuration.
- Masked calling in the supplied project remains **Telnyx/mock**, not Twilio. This ZIP does not falsely claim a working Twilio implementation.
- The old website's `reservation_messages` are visible to mobile chat only after an app conversation has been created for the reservation; cross-platform messaging is not fully auto-backfilled by this release.
- Runtime MySQL date/time-zone assumptions should be tested against the actual website server timezone. This patch normalizes incoming explicit offsets to UTC for the new app-owned DATETIME fields.
- Deploy to production only after a staging migration, a verified backup/rollback plan, and bidirectional website/mobile API regression pass.


## November 4 log follow-up: migration safety and test-runner fixes

The user-provided logs showed `verify:legacy-first` run against a database missing
`reservation_messages`, `notifications`, `reservation_driver_statuses`, and
`reservation_statuses`, along with the six app views and additive columns.
The four original tables **are present** in the supplied 165-table SQL export;
this usually indicates a different/incomplete database, not that those tables
should be created by mobile migrations. The uploaded export contains no row data,
so it cannot alone support full account/booking/price integration tests.

**Correct order:** verify `.env` staging host/name, run `npm run verify:schema`
and `npm run db:preflight` (both read-only), then `npm run migrate`
(schema-changing), and only afterward `npm run verify:legacy-first`.
`npm start` alone only confirms that the HTTP process starts; it does not prove
SQL schema compatibility or successful API queries.

Fixes included in this package:
- Vitest now ignores the Node built-in test file; it is still run via
  `npm run compat:selftest`. No API or response changes.
- The additive-only SQL test strips SQL comments before matching forbidden DDL;
  the migration file content/checksum remains unchanged.
- The new read-only `npm run db:preflight` prints the actual connected database,
  server and any missing website-owned tables without printing passwords.
- `npm run migrate` now checks for those required website tables **before** it
  creates migration-tracking tables or applies any DDL. It refuses incomplete DBs.
- No migration SQL files, route registrations, or OpenAPI response schemas were
  changed in this follow-up patch.

For a schema missing any original website table, restore a **complete** website
snapshot into a *new* staging database (do not overwrite a database with app
rows). The supplied SQL export is schema-only; obtain a data-bearing staging
snapshot for real API integration tests. Do not import the export into production.
