# Drive Luxury 2.4.0 - shared client database deployment

This backend-only update is based on `drive-luxury-backend-pricing-aligned-2026-11-03(3).zip` and the supplied `o56gps_reza_drive_luxury(3).sql` schema. The client SQL contains 165 table definitions and no inserted production rows. It is **not a usable production data backup**.

## What changed

Eight overlapping app stores are no longer used by runtime readers/writers. Their data moves to existing client tables through migration `008_shared_client_storage.js`. Seven read-only `dl_mobile_*` views preserve the backend's existing query aliases. The other 27 app tables retain their distinct workflow/infrastructure responsibilities.

All 96 route method/path pairs, original request validators, response-call expressions, auth/error/pagination definitions, and OpenAPI file were checked against the uploaded ZIP. Public assignment, message, notification and manual-request IDs are mapped rather than renumbered. There are no frontend files or requested frontend contract changes in this package. These checks do not substitute for running the actual frontend against a migrated database clone.

## Release validation status

Passed here: 106 JavaScript syntax checks; 96-operation OpenAPI coverage; 35 new unit/static-contract tests; 12 audit/redaction tests; the notification inbox/outbox/receipt mock self-test; a static check of 356 literal SQL parameter bindings.

**Not run here:** real MySQL/MariaDB migration or HTTP integration tests, the original Vitest/pricing suites, live Stripe/Expo/telecom calls, the PHP website, or the integrated mobile frontend. Dependencies could not be installed in this execution environment, and no database server/production rows were available. This is an implementation package for staging verification, not a production acceptance certificate.

## Required first: a database clone and a recoverable backup

Have the client's database operator create a full backup/snapshot, including rows, indexes, constraints and any existing triggers/views. Prove that it can be restored to a separate database. Test on that restored clone first. Never import the supplied schema dump or `tests/fixtures/client-schema-2026-11-03.sql` into the client's live database.

For the actual cutover, put **both** the PHP website/back-office and Node backend/workers into a write-maintenance window. Disable scheduled writers as well. A named migration lock prevents another copy of this migration from running, but cannot stop unrelated PHP writes. DDL is not rolled back by a normal SQL transaction; interruption may leave a partially applied, resumable migration.

Keep the existing deployment environment, including API prefix, secrets, payment/provider settings, upload storage and public URL. Do not replace a real `.env` with `.env.example`.

## Configure the one new migration setting

Confirm the exact notification User model morph name in the client's PHP application, then set this backend environment variable:

```dotenv
# EXAMPLE ONLY: use the actual PHP User model/morph name.
LEGACY_NOTIFICATION_NOTIFIABLE_TYPE=App\Models\User
```

The migration can infer a single existing `...\User` discriminator, but the schema-only dump cannot prove its value. `App\User`, `App\Models\User`, or a configured morph alias are different values. Guessing could associate notifications with the wrong entity. The approved value is persisted in existing `app_settings` and used by notification writes and reads.

## Commands from the backend folder

Install the unchanged dependency set and run the offline checks:

```bash
npm ci
npm run syntax:check
npm run consolidation:selftest
npm run audit:selftest
npm run notifications:selftest
```

Against the **staging clone**, with both writers stopped:

```bash
npm run verify:schema
npm run migrate -- --foundation-only
npm run db:consolidation:plan
```

The foundation command only applies missing migrations 001-007. Previously applied migrations must retain their original checksums. Do not edit old migration files, overwrite stored checksums, or ignore migration errors. Stop on any plan blocker; resolve the actual row/schema conflict before proceeding. Review warnings about notification model, dual pickup/dropoff drivers and PHP locking.

After the plan has no blockers and the backup/maintenance requirements are satisfied:

```bash
npm run migrate -- --allow-shared-schema
npm run db:consolidation:verify
npm test
npm run pricing:selftest
npm run pricing:integration-selftest
npm start
```

The server deliberately refuses to start if the 008 marker/checksum, required columns/indexes/views, numeric notification allocator or remapped foreign keys are missing. Do not bypass that guard.

Repeat the verified deployment sequence against production only after the staging matrix below passes. The new backend must not be started against an unmigrated DB. The old backend must not resume writing after cutover.

## Database integration test supplied with the package

On a **disposable database server**, set the following in its test environment, then run the test. The test uses `TEST_DB_*`, not the application `DB_NAME`; it creates a unique `dl_consolidation_test_*` database and drops only the database created by that invocation. Its DB account needs CREATE/DROP DATABASE privileges on that disposable server. No real external provider calls are made.

```dotenv
ALLOW_DISPOSABLE_DB_TEST=true
TEST_DB_HOST=127.0.0.1
TEST_DB_PORT=3306
TEST_DB_USER=root
TEST_DB_PASSWORD=your_disposable_test_password
# Optional verified TLS:
# TEST_DB_SSL_CA_PATH=/path/to/test-server-ca.pem
```

```bash
npm run consolidation:integration
```

The runner covers migration/retry, alias collisions, website-only bookings, JSON serialization, native chat recipient privacy, numeric notifications with UUID storage, shared request IDs, child foreign keys, client-side state edits and scoped audit retention. It has been syntax-checked, but **has not been executed against a server in this environment**.

## Staging acceptance matrix

| Area | Check with the existing applications |
| --- | --- |
| Login and profiles | Existing client, agent and chauffeur accounts; tokens, profiles and permissions remain valid. |
| Catalog and prices | Country/city availability; chauffeur hours; transfer city-pair prices; car-rental insurance/options/taxes. |
| Booking | Draft, details, quote, checkout; original response keys/types; existing mobile booking IDs; a website-created booking. |
| Payments | Provider confirmation/failure; duplicate webhook; payment hold expiry; accounting row written once; change/cancellation/refund. |
| Assignment | Assign, decline, reassign, overlap with a PHP-created assignment, both pickup/dropoff driver duties, GPS and trip completion. |
| Communication | Existing message IDs/read receipts; native staff-only message not visible to a client; document access; notification counts and push jobs. |
| Manual services | Airport VIP and concierge submission, list, operations decision, and appearance in the existing contacts table. |
| PHP website | Existing forms, reports, payment totals, reservation/driver displays, attachment storage mapping and status labels. |
| Time zones | Confirm the PHP stored calendar times and DB session time zone match the backend's existing UTC API convention; no automatic time-zone conversion is included. |
| Concurrent writes | PHP writers must use compatible locks/checks; this ZIP cannot change PHP code that was not supplied. |

Website bookings may lack a mobile quote/draft, vehicle class, detailed passenger data or ISO currency mapping. Inspect those cases on the clone. Automatic repricing without the original mobile pricing snapshot is blocked with `LEGACY_BOOKING_REVIEW_REQUIRED`; resolve such a booking through the existing operations workflow instead of inventing a price. Native-only accounting payments are not turned into synthetic Stripe transactions.

## Old tables and rollback

Migration 008 retains the eight old app tables as inactive migration snapshots. The updated runtime does not use them as its data source and does not dual-write them. They therefore become stale after cutover. This retention is deliberate; it is not an instruction to continue using both stores.

Optional rename-only archive preview, after acceptance:

```bash
npm run db:consolidation:archive
```

An operator who has taken a fresh backup and stopped both writers may execute the rename:

```bash
npm run db:consolidation:archive -- --execute --maintenance-confirmed
```

This renames only the eight retired app tables to `archive_<old_name>_008`. It drops no table and deletes no data. No original client table is renamed. Physical removal is intentionally not automated.

There is no automatic down migration. Before writers reopen, the recovery path is the full pre-cutover snapshot plus its matching old backend. After new writes occur, restoring old tables or starting the old backend can lose those writes: perform a reviewed reconciliation/restore instead. Do not treat the inactive tables as an up-to-date rollback database.

See `docs/SHARED_DATABASE_CONSOLIDATION.md`, `docs/VALIDATION_SHARED_DATABASE.md` and `CHANGED_FILES.md` for details.
