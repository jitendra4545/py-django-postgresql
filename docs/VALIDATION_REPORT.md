# Validation report

Validated on 2026-10-06 with Node.js 22 in the build workspace.

## Passed checks

- `npm install --ignore-scripts`
- `npm audit`: **0 known vulnerabilities**
- `npm run lint`: no ESLint errors
- `npm test`: 7 files and 19 tests passed
- `npm run syntax:check`: 50 JavaScript files passed Node syntax validation
- OpenAPI coverage: all **72 implemented HTTP operations** are documented
- `npm run format:check`: all project files match Prettier rules
- Application import/startup construction with valid test environment values
- OpenAPI JSON parsing
- Migration safety tests: no `ALTER TABLE` or `DROP TABLE`; all created tables use the `app_` prefix; new money fields use fixed precision

## Database validation performed

- Every legacy table/column referenced by the implementation was compared against the supplied `drive_luxury_2026-09-02.sql` dump.
- Legacy role values and active/inactive semantics were matched to the supplied schema.
- Legacy service IDs were mapped from the supplied dump: Transfer 7, Chauffeur 8, Car Rental 10.
- Legacy reservation, detail, itinerary, cost, driver, vehicle, and reserved-date column names were checked exactly, including `reservation_detail_id` in `vehicle_reserved_dates`.
- Vehicle availability was checked against the existing `vehicles`, `vehicle_blocks`, `vehicle_reserved_dates`, and `reservation_vehicles` structures. Only status `1` and online-booking-enabled vehicles are eligible.
- Existing `activity_logs` and `reservation_temp_vehicle_histories` structures were checked and reused; the duplicate `app_audit_logs` proposal was removed.

## Validation requiring the deployment environment

The following cannot be truthfully completed against an offline SQL dump and must be done in staging:

1. `npm run verify:schema` against the actual target database.
2. Apply the migration to a recent staging clone and inspect MySQL foreign-key/DDL results.
3. End-to-end booking checkout using representative configured rates, options, taxes, and cities.
4. Finance validation of rate-duration/season configuration. `tax_surecharges.amount` has been confirmed as a percentage.
5. Stripe test-mode PaymentIntent, 3DS, failure, duplicate-webhook and refund scenarios using rotated credentials.
6. Expo push delivery using real iOS and Android Expo push tokens.
7. Private S3 upload/download using the deployment IAM policy.
8. Telecom integration replacing the masked-call development adapter.
9. Email/SMS delivery for invitation and password-reset tokens.

No real key is stored in source control or `.env.example`. Rotate any secret shared through chat before staging or production use.
