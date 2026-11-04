# Changed files - shared client database release

Compared with the supplied pricing-aligned backend: 32 modified original files, 21 added implementation/documentation/test files before this inventory and manifest; no original files removed.

Historical migrations 001-007 and the OpenAPI specification are unchanged. New database storage logic is in migration 008, the shared-storage helpers and the modified SQL callers.

## Modified original files

| File |
| --- |
| `.env.example` |
| `README.md` |
| `docs/API_DATABASE_REQUEST_LOGGING.md` |
| `docs/DATABASE_CHANGES.md` |
| `package-lock.json` |
| `package.json` |
| `scripts/check-syntax.js` |
| `scripts/seed-chauffeur-demo-bookings.js` |
| `scripts/selftest-expo-notifications.mjs` |
| `src/db/pool.js` |
| `src/modules/agency-agent.js` |
| `src/modules/bookings.js` |
| `src/modules/chauffeur.js` |
| `src/modules/client.js` |
| `src/modules/communication.js` |
| `src/modules/notifications.js` |
| `src/modules/operations.js` |
| `src/modules/payments.js` |
| `src/scripts/migrate.js` |
| `src/scripts/prune-api-audit.js` |
| `src/scripts/setup-api-audit.js` |
| `src/server.js` |
| `src/services/access.js` |
| `src/services/api-audit-log.js` |
| `src/services/booking-change-service.js` |
| `src/services/booking-service.js` |
| `src/services/booking-view.js` |
| `src/services/notification-testing.js` |
| `src/services/notification-worker.js` |
| `src/services/notifications.js` |
| `src/services/payment-holds.js` |
| `src/services/tracking.js` |

## Added files

| File |
| --- |
| `START_HERE_SHARED_DATABASE.md` |
| `docs/SHARED_DATABASE_CONSOLIDATION.md` |
| `docs/SHARED_DATABASE_PROVENANCE.json` |
| `docs/VALIDATION_SHARED_DATABASE.md` |
| `docs/validation/audit-selftest.txt` |
| `docs/validation/consolidation-tests.txt` |
| `docs/validation/notifications-selftest.txt` |
| `docs/validation/sql-static-check.txt` |
| `docs/validation/syntax-check.txt` |
| `docs/validation/vitest-not-run.txt` |
| `migrations/008_shared_client_storage.js` |
| `scripts/test-shared-database.mjs` |
| `src/db/json-contract.js` |
| `src/db/shared-schema.js` |
| `src/scripts/shared-storage.js` |
| `src/services/shared-audit-storage.js` |
| `src/services/shared-storage.js` |
| `tests/consolidation-contract.node.mjs` |
| `tests/fixtures/api-contract-baseline.json` |
| `tests/fixtures/client-schema-2026-11-03.sql` |
| `tests/shared-storage.unit.node.mjs` |

`CHANGED_FILES.md` and `PATCH_MANIFEST.json` are generated inventory files in addition to the entries above.

Full execution boundaries and test results are in `docs/VALIDATION_SHARED_DATABASE.md`.
