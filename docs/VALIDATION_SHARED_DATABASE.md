# Validation record - shared client database release

Date: 4 November 2026. Runtime used for offline checks: Node.js 22.16.0.

## Completed checks

| Check | Result | Meaning |
| --- | --- | --- |
| `npm run syntax:check` | PASS: 106 JavaScript files; 96 OpenAPI operations | Source, scripts, migration and test files parse; documented method/path coverage matches routes. |
| `npm run consolidation:selftest` | PASS: 35 tests | Native writers and SQL parameter counts, JSON normalization, message privacy, model discriminator, deterministic IDs, alias/type guards, startup guards and static contract preservation. |
| `npm run audit:selftest` | PASS: 12 tests | Existing redaction, queue, disconnect, secret-handling and failure-isolation behavior. |
| `npm run notifications:selftest` | PASS | Mock inbox/outbox atomicity, excluded recipients, push job tickets and invalid-device receipt handling. The mocked `DeviceNotRegistered` warning is expected. |
| Literal SQL bind-count inspection | PASS: 356 call sites; zero mismatches | Static SQL literals with literal parameter arrays had matching placeholders. Dynamic SQL and actual SQL execution are not covered by this check. |
| Migration INSERT/SELECT column-count inspection | PASS: 9 static statements | Column counts match; actual database SQL execution remains untested. |
| Original contract snapshot | PASS | 96 method/path pairs; response-call and request-validator expressions; unchanged OpenAPI/auth/error/pagination/app-mount/constants hashes. |
| Original migrations 001-007 | PASS | Byte-identical to the uploaded ZIP. |
| Dependency comparison | PASS | Dependency versions/ranges and lock resolutions unchanged; only package/root version changes to 2.4.0. |
| Source schema inspection | 165 tables; zero INSERT data statements | Table definitions available; no production row migration could be validated from this dump. |

The offline contract snapshot is `tests/fixtures/api-contract-baseline.json`, captured from the original supplied ZIP. It protects declarations and response construction, not every database-derived value/type at runtime. SELECT-star compatibility views also have an ordered-column regression test against the old table definitions.

## Not completed in this environment

| Check | Status / reason |
| --- | --- |
| Dependency installation | `npm ci` could not complete because registry access was unavailable; offline retry failed on uncached packages. No dependency workaround or fake package was shipped. |
| Original `npm test` / Vitest suite | Not run; required dependencies unavailable. |
| Original pricing self-tests | Blocked at imports (`decimal.js` / `mysql2` unavailable), not classified as passed or as a demonstrated pricing regression. |
| MySQL/MariaDB DDL/data integration | Not run; no DB server or production data supplied. |
| New `consolidation:integration` script | Syntax-checked only; needs installed mysql2/dotenv and a disposable database server. |
| Existing mobile frontend / PHP back-office | Not run; their source/runtime was not supplied here. |
| Real Stripe, push delivery and telecom | Not run; provider/network/credential integration remains a staging check. |
| Formatting / lint | Not certified; required dev dependencies unavailable. |

No changes were executed against the client's production database or server. No production credentials were bundled. No frontend code was changed. No claim of production acceptance or zero regression is made.

## Required acceptance before production

Run the supplied disposable DB test, the original suite, and the shared-database staging matrix in `START_HERE_SHARED_DATABASE.md`. Pay particular attention to identifier collisions, old booking IDs, native-only reservations, payment/reporting totals, private messages, notification morph names, two-driver rows and PHP/Node concurrent updates.

The SQL fixture is for a newly created disposable database only. The original supplied dump is structure-only and must not be mistaken for a full rollback backup.
