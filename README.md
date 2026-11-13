# Drive Luxury 2.6.2

Current shared policies, native table mapping, additional expenses and remaining integration: [docs/LEGACY_ADAPTER_REPORT.md](docs/LEGACY_ADAPTER_REPORT.md). Workbench test-agent setup: [docs/AGENT_TESTING_WORKBENCH.md](docs/AGENT_TESTING_WORKBENCH.md). Validation: [docs/VALIDATION.md](docs/VALIDATION.md). The combined bundle also includes changed Laravel source; apply its change list to the existing complete website.

# Drive Luxury legacy adapter backend — 2.6.2

This is the complete updated Node.js API based on the supplied release-v4 archive. Bookings, billable prices, payments, vehicle allocations and chauffeur assignments use the client's existing native records. Existing mobile endpoint paths and JSON response keys are retained.

## Deploy

1. Use Node.js 24 LTS, or a Node version satisfying package.json.
2. Copy `.env.example` to `.env` and configure the existing database connection and your deployment credentials. Keep the same JWT secrets as your current deployment if existing sessions should continue.
3. Run `npm ci --omit=dev`.
4. Run `npm run db:client:verify`. This only reads `information_schema`; it never repairs or alters the database.
5. Run `npm start`, or build and run the included Dockerfile. The server verifies the existing schema before accepting requests.

**Do not run schema migrations.** No migrations, schema installers, compatibility views or trigger installers are required or included. The old `npm run migrate` entry point deliberately exits without changing the database. The application database executor rejects DDL.

The database must match the supplied `Dump20261112` schema. That dump already contains mobile session/draft/payment-attempt tables and mobile metadata columns; this release reuses them. It does not create replacements. If production lacks an existing required object, verification reports the difference and stops; the code does not invent storage.

For production set `NODE_ENV=production`, `PAYMENT_PROVIDER=stripe`, real matching Stripe secret/publishable/webhook keys, your Google client IDs and Maps keys, and SMTP configuration. Production explicitly rejects mock payments and unverified route distances. Retain your existing private file storage configuration. `.do/app.yaml.example` includes deployment placeholders. No client credentials are bundled.

Register the existing Stripe webhook URL `https://YOUR_API/api/v1/payments/webhook` using the correct signing secret. Route access and booking ownership checks remain in place. The provider remains Stripe for the mobile contract; Laravel's PayEngine implementation is analyzed, not substituted into the mobile API.

## New in 2.6.2

- Dated `CAR_RENTAL` catalog results follow Laravel's pickup season, nearest rental-day duration band, active country/global rate precedence and positive-base-fare display rule. Historical minimum rates no longer determine the rental list or its order.
- Rental capacity comes from the same eligible pickup-city-preferred vehicle used by checkout. Rental quotes exclude inactive price rows.
- Chauffeur and transfer catalog behavior, the agency fixes from 2.6.1, existing response keys and shared physical availability policy are retained. See [docs/RENTAL_SEARCH_FIX.md](docs/RENTAL_SEARCH_FIX.md) for request requirements and acceptance testing.

## Included from 2.6.1

- A newly seeded Workbench agency now includes an assigned test client, so the agent can immediately create a client booking draft.
- The agent dashboard counts all current reservations belonging to the authenticated agency, matching the website's agency reservation scope.
- Dashboard and commission-list values read active native `agency_commissions` rows on active reservation details. Commission remains `(base_rate - discount) × agencies.commission / 100`, with website whole-money rounding.

- Client, chauffeur and agent self deletion with password or linked Google reauthentication; ADMIN deletion by profile ID. Native soft deletion revokes sessions, push and chat access while retaining booking/receipt history.
- Website-style hourly, daily and transfer cost details through additional draft/booking payment-breakdown endpoints.
- A class-specific booking-options endpoint exposes class-mapped extras and separate native insurance choices.
- Booking chat reconciles late/returning/removed chauffeurs and assigned agents, accepts `text` inputs alongside `body`, fixes read boundaries, and validates live socket membership before delivery.

Existing endpoint response shapes and the original OpenAPI file remain unchanged. Seven requested operations are documented in a separate OpenAPI add-on. No schema changes or migrations are required.

See [docs/MOBILE_SCREEN_INTEGRATION.md](docs/MOBILE_SCREEN_INTEGRATION.md) for exact screen-to-API wiring, screenshots and rental table mappings. This ZIP contains the backend; the actual React Native app source was not attached, so app screens and buttons were not edited.

## Main changes

- Additional customer charges use active `reservation_details`/`reservation_costs` rows, including fee-only extra-service rows. Completed rides remain completed while the outstanding balance is payable through the existing payment retry API.
- Outstanding amount is active billable total minus active, non-deleted reservation payments, excluding unrelated custom-invoice payments. Unpaid fares and extras merge into one amount. Driver reimbursements and provider/operating costs are never silently billed to the customer.
- Class-mapped public rental options follow Laravel's class pivot instead of an additional service-type filter. Quote math applies tax only to the discounted base fee, preserving CHF VAT and whole-total rounding.
- Public inventory uses the website's country coverage, service mapping and inclusive reserved-date ledger, preferring the pickup city and then falling back to the country. Operational availability keeps its separate stricter query.
- Native numeric parent status, native trip selectors, active legs, prices, current vehicle and driver rows override stale optional mobile metadata. Database views and metadata triggers are replaced with SQL projections and application reconciliation.
- Season, duration and rate selection follow the supplied PHP lookup order, and textual city aliases can resolve static transfer rates.

Read [docs/LEGACY_ADAPTER_REPORT.md](docs/LEGACY_ADAPTER_REPORT.md) for exact table mappings, payment examples, source-code references, parity limits and findings.

## Verification

```bash
npm ci
npm run build
```

The build runs syntax checking, the unchanged original route/OpenAPI contract gate, additive operation coverage, lint, and unit tests. Test-only JWT values are confined to Vitest configuration.

For integration tests, import the supplied dump into an **empty disposable database**, configure that database in the environment, then run:

```bash
NODE_ENV=test PAYMENT_PROVIDER=mock ALLOW_UNVERIFIED_DISTANCE=true \
CLIENT_DB_TEST_DISPOSABLE=true npm run test:legacy-adapters
```

For the new account/chat/payment display tests on the same disposable database, also run:

```bash
NODE_ENV=test PAYMENT_PROVIDER=mock ALLOW_UNVERIFIED_DISTANCE=true \
CLIENT_DB_TEST_DISPOSABLE=true npm run test:mobile-enhancements
```

These commands insert synthetic fixtures into existing tables. Never run fixture tests on production or a populated client database. It does not install schema objects. Integration tests check all original columns, indexes, foreign keys and the absence of newly installed triggers.

The included validation report states exactly what was executed. Integration validation used MariaDB 11.8 with the client's MySQL 8.4 schema imported unchanged; live MySQL 8.4, live provider credentials, actual client data and the separate website UI still need deployment acceptance testing.

For a read-only inventory comparison on your populated database:

```bash
npm run availability:diagnose -- --country-id 1 --service-code CHAUFFEUR \
  --start-at 2027-01-10T10:00:00Z --end-at 2027-01-10T12:00:00Z
```

Use the same country, city and dates as the website. This compares candidate IDs; the website's final route-dependent fare display gate is explained in the report.
