# Validation report

Validated on 2026-10-16 with Node.js 24.19.0 in the build workspace.

## Passed checks

- `npm run build`: syntax, OpenAPI coverage, and the full automated test suite passed.
- `npm run lint`: no ESLint errors.
- `npm run format:check`: all project files match Prettier rules.
- `npm test`: **11 files and 35 tests passed**.
- `npm run syntax:check`: **58 JavaScript files** passed Node syntax validation.
- OpenAPI coverage: all **81 implemented HTTP operations** are documented.
- Browser reset page route, static assets, no-store policy, and Render proxy-hop configuration are covered by integration tests.
- `npm audit` and the production-only backend audit: **0 known vulnerabilities**.
- Application import/startup construction passed with valid test environment values.
- Express 5 query validation is covered by a regression test.
- Google payload verification rules, password-reset email generation, and partial profile updates are covered by tests.
- Migration safety tests confirm there is no `ALTER TABLE` or `DROP TABLE`, all created tables use the `app_` prefix, and new money fields use fixed precision.

## Database validation performed

- Every legacy table/column referenced by the implementation was compared against the supplied `drive_luxury_2026-09-02.sql` schema.
- Client, Agent, and Chauffeur profile APIs reuse `customers`, `agents`, `drivers`, and `users`; no duplicate role-profile tables were created.
- Google identity links use the additive `app_user_oauth_accounts` table with unique provider-subject and user-provider constraints.
- Password-reset tokens remain hashed in `app_password_reset_tokens`, expire after 30 minutes, and are consumed transactionally.
- Legacy role values and active/inactive semantics were preserved.
- Legacy service IDs were mapped from the supplied dump: Transfer 7, Chauffeur 8, Car Rental 10.
- Vehicle availability continues to enforce existing country/city mapping, online-booking eligibility, status `1`, blocks, and reservation conflicts.
- Existing `activity_logs` and `reservation_temp_vehicle_histories` are reused; no duplicate audit table is introduced.

## Validation requiring the deployment environment

The following require real staging credentials or external services and were not simulated as successful:

1. Run `npm run verify:schema` against a staging clone of the actual DigitalOcean database.
2. Apply migrations `001` and `002` through `npm run migrate`, then inspect MySQL foreign keys and indexes.
3. Test Google sign-in using real Android, iOS, and Web OAuth client IDs and valid ID tokens.
4. Send password-reset email through the client's Infomaniak SMTP account and verify the production reset URL/deep link.
5. Exercise Client, Agent, and Chauffeur profile reads/updates against representative legacy records.
6. Complete Stripe test-mode PaymentIntent, 3DS, failure, duplicate-webhook, refund, and checkout-idempotency scenarios.
7. Verify Expo push delivery with real iOS and Android devices.
8. Verify private object upload/download using the final DigitalOcean Spaces or S3-compatible credentials and policy.
9. Replace and test the masked-call development adapter with the selected telecom provider before production.

No real key is stored in source control or `.env.example`. Rotate any secret previously shared through ordinary messages before staging or production use.
