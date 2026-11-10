# Client database release verification

Historical verification for the 9 November package. The current 10 November results are in [PRODUCTION_VERIFICATION.md](PRODUCTION_VERIFICATION.md); use the current release guide and cumulative DBA request.

Source: drive-luxury-backend-js-LT.zip and Dump20261109.zip.

- JavaScript syntax: 124 files passed.
- Original route declarations and OpenAPI schema: contract gate passed.
- Documented route coverage: 96 operations passed.
- Existing Vitest suite: 89 tests in 18 files passed.
- Pay Later and booking visibility policy checks: 16 passed.
- Payment HTTP checks with mocked provider calls: 7 passed.
- Database integration: 27 assertions passed against MySQL 8.0.46 using all 165 native client table definitions and a fixture matching the reported 3 ID tables, 51 columns and 11 indexes. Upgrade, schema verification, workflow checks, second upgrade and second verification passed.
- Earlier disposable MariaDB 10.11 integration also passed; the supplied dump reports MySQL 8.4.11. The exact hosted engine and client admin were not accessed.

Database checks covered native admin booking and NULL-sequence leg reads, native driver status history, two distinct driver roles on one native assignment row, repeated reconciliation without duplicate notification jobs, acknowledgement and progress, reassignment/removal, mobile operations assignment, expenses and approval, partial completion, agent customer creation and Pay Later checkout, native flight records, chat/read receipts, private file/media links and chat attachment, VIP inquiry review and native password reset/login.

Checkout integration used a preconstructed valid quote snapshot to test storage and checkout; it did not invoke Google Routes or prove live client pricing configuration. No real Stripe, Expo, Google, SMTP or Telnyx network delivery was tested. Payment HTTP tests used provider mocks. No client local or hosted database was modified. Populated duplicate mobile stores are intentionally rejected for a separate reviewed data migration.
