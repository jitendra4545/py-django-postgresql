# Local client database setup

Use Node.js 22.12 or later (Node 24 tested). Extract this folder and open PowerShell or Terminal in it. Import a backup of the client database into a separate local MySQL database first. Keep the imported database backed up: MySQL DDL commits immediately and an upgrade failure can leave some changes applied. The upgrade can be rerun after correcting the reported problem.

```powershell
npm ci
Copy-Item .env.example .env
```

On macOS or Linux use `cp .env.example .env`. Edit DB_HOST, DB_PORT, DB_USER, DB_PASSWORD and DB_NAME in `.env` to point to your local imported database. Use DB_SSL=false for a normal local database. Keep your existing provider configuration when testing real Google, Stripe, Telnyx, email or Expo services; no real credentials are included.

Run these commands in order:

```powershell
npm run db:client:plan
npm run db:client:upgrade
npm run db:client:verify
npm run start:checked
```

`plan` reads the configured database and prints pending changes without applying them. `upgrade` directly adds missing tables, fields and indexes, installs compatibility views and metadata triggers, and backfills assignment IDs. It checks named index definitions and existing column types. A mismatch stops the upgrade for review rather than converting a client column automatically. The command `npm run migrate` now runs this same client upgrade; historical migrations 001–010 remain reference files and are not replayed.

The database account running the upgrade needs SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, CREATE VIEW and TRIGGER rights. RENAME is used only when a duplicate mobile store must be archived; original client tables and primary keys retain their names. Verify a backup before migrating a database that also contains historical app tables.

No manual list of ALTER statements is required when using the upgrade command. Exact definitions are in `db/client-schema.json`, `db/client-target-tables.sql` and `db/SCHEMA_CHANGES.md`. The SQL file lists target table definitions for review; use the runner for the complete upgrade, views, triggers and data backfill.

# What changes

The target reuses 57 original client tables and has 26 active additional base tables. If only the two required ID tables from the previously reported three tables exist, 24 active tables are created. The old expense allocator is left in place if present and receives no new writes. The runner adds all 51 previously reported columns if missing plus 20 further client columns, and adds 15 fields to the assignment allocator. If the reported 51 columns are already present, the remaining column count is 35, plus 18 indexes on existing tables. This implementation retains service_code, currency_code, created_by_user_id and flight_number as compatibility fields, and synchronizes them with native records rather than removing them.

Five app names are SQL views over native client tables: app_notifications, app_messages, app_documents, app_vip_requests and app_concierge_requests. They do not store another copy. Writes use native notifications, reservation_messages and recipients/attachments, file_managers/media_files and ownership links, contacts, and password_resets. Four metadata triggers synchronize service, currency, creator and trip status metadata. Ten concurrency triggers maintain the new derived app_vehicle_booking_locks table and reject conflicting current/future native vehicle allocations. Missing native trip and detailed driver statuses are seeded separately without changing existing IDs. LEGACY_USER_MODEL defaults to App\User, matching the supplied PHP source.

The supported starting point is the supplied native client schema plus the reported additions. Empty old mobile tables with compatibility-view names are preserved as *_client_archive. If any such table contains data, the runner stops before changing the schema and names the table; those rows need a separate reviewed migration to preserve ownership, IDs and financial links. It does not silently copy them into a populated client ledger. Historical app_password_reset_tokens requests require a new reset through the same endpoint; existing account passwords and the native password broker remain intact. Existing native mobile assignment IDs and driver expense fields are backfilled without changing their public IDs.

# Testing the apps

1. Register or use a native customer account. Create a booking, then check native reservations, reservation_details, costs, reservation_vehicles and vehicle_reserved_dates.
2. Sign in as an agent. Create a customer and book for that customer. Verify users, customers, agency and agent membership, and the native reservation.
3. In the client admin assign pickup and drop-off drivers, including two different drivers on one reservation_drivers row. Refresh each chauffeur dashboard. The reconciliation worker runs every five seconds; chauffeur reads also reconcile that driver's rows.
4. Acknowledge, start and complete a ride. Verify native trip_status_id and reservation_driver_statuses, customer booking status and the other outstanding driver role. Completing one role must not prematurely complete the entire booking.
5. Reassign or remove a native driver. The old public assignment remains in history and is cancelled; the new driver receives a new ID and a notification job.
6. Test PAY_LATER and PAY_NOW failure/retry and successful payment on the same booking. PAYMENT_PROVIDER=mock is local-only. For real payments use your test Stripe keys and webhook delivery.
7. Test chat/read receipts, private uploads, notifications, VIP/concierge inquiries and chauffeur expenses and approval.

Quote generation still requires the client's vehicle, city and pricing rows and working Google route configuration. If Routes is disabled, real route requests return the existing configuration error. For local-only distance testing ALLOW_UNVERIFIED_DISTANCE=true permits supplied distances; it is forbidden in production. Expo delivery requires a registered device, credentials where applicable, EXPO_PUSH_WORKER_ENABLED=true and network access. A queued job alone is not proof of delivery.

The supplied automated database integration test inserts fixtures. Run it only against a disposable empty imported schema with CLIENT_DB_TEST_DISPOSABLE=true; do not run it against your populated client copy. Normal app testing uses the four setup commands above.

# Deployment and current limits

This package was tested against disposable imports of the supplied schema. It was not connected to your local database or the client's live admin. Stop PHP and Node writers for the upgrade: it rebuilds derived current/future claims and recreates its owned triggers. Existing conflicting future allocations stop the upgrade for operations review. Test the original admin's response to a rejected overlapping allocation and its local-time conventions before production. The admin panel may need UI work to review newer approval/expense workflows and private file access. No new mobile route or response format is required by these changes.

The client DBA should approve the cumulative implementation change manifest, including five views and 14 triggers, before applying it to the hosted client database. Do not deploy the database changes alone with a different backend release. See docs/PRODUCTION_RELEASE_GUIDE.md for the precise release delta and production acceptance steps.
