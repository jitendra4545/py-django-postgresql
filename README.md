# Drive Luxury Backend — Release 1

Production-oriented Express 5 / MySQL API for:

- Client + Agency Agent mobile application
- Chauffeur mobile application
- Existing back-office integration

It is based on the supplied backend's technology choices but replaces its rental-inspection Agent interpretation with the correct Agency Agent model.

## Included

- Client registration, login, refresh rotation, logout and password reset
- Invitation-only Agency Agent and Chauffeur onboarding
- Five-service catalog: Chauffeur, Transfer, Car Rental, Airport VIP, Concierge
- Class-first, multi-leg booking drafts, date-aware vehicle availability, percentage-tax pricing and quote snapshots
- Legacy-compatible reservation/detail/itinerary/cost/payment writes
- Agency roster, per-client bookings, alerts and commission visibility
- Stripe PaymentIntents, signature-verified webhooks, refunds and mock mode for development
- Expo push notifications for the two mobile applications
- Back-office confirmation, physical vehicle allocation and chauffeur assignment
- Assignment-level state machine, acknowledgement, GPS, expenses and incidents
- Client tracking, notifications, chat, private documents and masked-call abstraction
- Approved booking changes are applied/repriced by this backend; cancellations use Stripe refunds
- Agency commission records are generated and recalculated by this backend
- Existing fleet blocks, reservation calendars, vehicle replacement history and activity logs are reused instead of duplicated
- Swagger UI and OpenAPI 3.0 JSON

Rental inspections and all AI/OCR/predictive features are deferred. See [docs/RELEASE_1_FLOW.md](docs/RELEASE_1_FLOW.md).

## Requirements

- Node.js 20+
- MySQL 8+
- Existing `drive_luxury` schema matching the supplied September 2026 dump

## Setup

```bash
cp .env.example .env
npm install
npm run verify:schema
npm run migrate
npm test
npm run dev
```

Swagger UI: `http://localhost:3000/docs`

OpenAPI JSON: `http://localhost:4000/openapi.json`

## Deployment order

1. Restore/snapshot the target database in staging.
2. Configure Stripe, Expo, DB TLS and private S3 credentials.
3. Run `npm run verify:schema`.
4. Review and apply `migrations/001_release_1_mobile_foundation.sql`.
5. Validate rate-selection rules with finance (`tax_surecharges.amount` is confirmed as percentage).
6. Run integration tests against a staging clone.
7. Deploy API, then mobile clients.

## Security decisions

- Access tokens re-check current user status and role on every request.
- Agent and Chauffeur accounts cannot self-register.
- Private files are never exposed as a public static directory.
- Checkout is idempotent.
- Stripe webhooks use Stripe SDK signature verification and event IDs are replay-protected.
- Device IDs and push tokens have a single owner.
- Confirmed bookings use reviewed change/cancellation requests.
- Physical vehicles are allocated by operations, not selected by clients.
- Client/Agent catalog results contain only vehicle classes backed by `status=1` available vehicles; statuses 0 and 2–7 are internal and never exposed as choices.

## Documentation

- [Release 1 flow](docs/RELEASE_1_FLOW.md)
- [Database changes](docs/DATABASE_CHANGES.md)
- [OpenAPI contract](docs/openapi.json)
- [Validation report](docs/VALIDATION_REPORT.md)

## Important integration notes

- `PAYMENT_PROVIDER=mock` is for local development only. Use `PAYMENT_PROVIDER=stripe` for staging and production.
- `.env.example` contains placeholders only. Never commit Stripe secret or webhook-signing keys.
- Mobile apps must register an Expo push token in the existing login device payload.
- The masked-call implementation is an adapter placeholder returning a development bridge number. Connect the selected telecom provider before production.
- Email/SMS delivery is intentionally provider-neutral. Invitation/reset tokens are persisted securely; connect the company's notification provider to send them.
- Existing historical reservations are not automatically visible because they lack `app_reservation_meta`. Plan a reviewed backfill if this is required.
- Operations should call `GET /api/v1/operations/vehicles/available` with the class and service time window before assigning a physical vehicle. The assignment endpoint performs the same conflict checks again.
