# Drive Luxury - test log fixes and safe staging sequence (2026-11-04)

## Log interpretation

`npm start` printing "Drive Luxury API listening on port 3000" confirms the Node HTTP
process started. It does NOT prove that database objects, data, or APIs work.

`npm run verify:legacy-first` is a POST-MIGRATION verifier. The user's output
showed four missing ORIGINAL website tables (`reservation_messages`,
`notifications`, `reservation_driver_statuses`, `reservation_statuses`), as well
as missing mobile views/columns. All four original tables exist in the uploaded
`o56gps_reza_drive_luxury.sql` schema. That means the DB used for the logged
command is not a complete copy of that website schema (or it is not the DB the
user thought was selected). No new app migration can safely substitute those
website-owned tables.

Two `npm test` errors were harness problems:

1. A test scanned comments for `CHANGE` and falsely matched the word `changes`.
   The test now ignores SQL comments. Migration 000 was NOT changed: retaining
   its checksum is necessary to protect migration history.
2. Vitest collected a separate `node:test` file as a Vitest test and reported
   no Vitest test suite. `vitest.config.js` now excludes that file. It still
   runs with `npm run compat:selftest`.

The `GOOGLE_ROUTES_NOT_CONFIGURED` output came from an expected passing test.

## Use the correct staging database (PowerShell)

1. Extract the updated ZIP. Enter its `backend` directory.
2. Copy `.env.example` to `.env` if necessary. Set DB_HOST, DB_PORT, DB_NAME,
   DB_USER, DB_PASSWORD, DB_SSL for a separate staging clone, never production.
3. Ensure that staging contains ALL original website tables and representative
   website users/vehicles/prices. The uploaded SQL export contains structure
   only, no `INSERT INTO` statements; a schema-only import cannot test real
   login, pricing, booking or payments.
4. Run these checks first. They do not change the database:

   ```powershell
   npm ci
   npm run syntax:check
   npm run legacy-first:selftest
   npm run compat:selftest
   npm run verify:schema
   npm run db:preflight
   ```

5. ONLY after checking the output says the intended staging database and
   required legacy tables are present, and after taking a backup, execute:

   ```powershell
   npm run migrate
   npm run verify:legacy-first
   npm test
   npm start
   ```

6. Then test actual authenticated API calls (auth, catalog, quote, checkout,
   agent/driver, Stripe, notifications, website-to-mobile booking visibility).

If `db:preflight` fails, **STOP**. Do not run `npm run migrate`, do not create
fake substitute website tables, and do not force a migration on live data.
Inspect your `.env` and compare its DB_NAME with the intended staging clone.
The original export identifies `o56gps_reza_drive_luxury`, while the backend
has a fallback `drive_luxury`; neither should be silently assumed as your
staging database name.

## Original keys and frontend contract

This fix does not modify migration SQL 000-008, any original database key,
`src/app.js`, `docs/openapi.json`, or API response field definitions. It only
changes local test configuration, test comment handling, migration preflight,
project scripts, and documentation.

## Not yet proven

`npm test` still needs to be executed in an environment with installed npm
packages. Real MariaDB migrations and HTTP/Stripe/website/frontend tests must
be executed on staging. MariaDB DDL implicitly commits; a previous partially
applied migration may need manual reconciliation rather than blind retry.
