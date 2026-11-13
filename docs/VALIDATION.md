# Validation — backend 2.6.2

- Node build: JavaScript syntax, ESLint and 135 tests across 22 files passed.
- OpenAPI coverage: 105 operations; original route declarations and original OpenAPI contract retained by the contract gate.
- Disposable database imported from all 204 supplied table definitions, unchanged: 46 adapter checks, 32 mobile/chat/deletion checks, 49 shared-policy/payment/agent checks and 13 rental-search checks passed (140 total).
- Rental search fixtures cover season/day-band selection, active price filtering, country/global precedence including zero country prices, weekly rates, 26-hour grace, price ordering, physical occupancy, representative-car capacity, unchanged JSON keys and catalog/quote consistency. Details: docs/validation/rental-search-2.6.2.txt.
- Native admin message was delivered over a real Socket.IO connection; reassigned driver room access and account-deletion disconnection were checked.
- PHP 8.4 syntax passed for all 13 changed PHP files. Standalone PHP and Node calculations match for all three ordinary service modes, CHF/EUR, discounts, extra fees and zero taxable base. Executed PHP emits the same physical eligibility SQL and parameter sequence.
- Gateway payload validation rejects pending, preauthorization-only, wrong amount/currency, refunded and duplicate transaction evidence. No live gateway debit was performed.
- Workbench test-agent SQL ran twice without duplicate user/password reset, authenticated against the real Node login endpoint, exposed its assigned client, created an agent booking draft, and returned the expected active-booking and 10% legacy commission totals.
- Final server startup passed read-only schema verification and an HTTP /health check.
- Table/column definitions remained unchanged during integration checks. Inventory covers 204 tables and 2468 supplied columns; field-mapping CSV identifies actual business adapters and unmapped areas.

Limits: fixtures use a disposable local MariaDB import of the exact MySQL dump, not the client's populated production MySQL server. No live vehicle-count comparison, production deployment, real mobile device run, full Laravel application boot, missing Blade template verification, mysql_two schema import, or live Stripe/PayEngine settlement was performed. Full website integration requires its existing templates, vendor dependencies and second database. Read DEPLOYMENT.md and LEGACY_ADAPTER_REPORT.md before staging rollout.
