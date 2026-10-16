# Drive Luxury Backend — Release 1

Production-oriented Express 5 / MySQL API for:

- Client + Agency Agent mobile application
- Chauffeur mobile application
- Existing back-office integration

It is based on the supplied backend's technology choices but replaces its rental-inspection Agent interpretation with the correct Agency Agent model.

## Included

- Client registration, password login, verified Google login, refresh rotation and logout
- SMTP password-reset delivery with single-use 30-minute tokens
- Read/update profile APIs for Client, Agency Agent and Chauffeur roles
- Invitation-only Agency Agent and Chauffeur onboarding
- Five-service catalog: Chauffeur, Transfer, Car Rental, Airport VIP, Concierge
- Active country/city lookup, GPS-name-to-database-ID resolution and service-filtered country availability
- Class-first, multi-leg booking drafts, country/city/date-aware vehicle availability, percentage-tax pricing and quote snapshots
- Legacy-compatible reservation/detail/itinerary/cost/payment writes
- Agency roster, per-client bookings, alerts and commission visibility
- Stripe PaymentIntents, signature-verified webhooks, refunds and mock mode for development
- Expo push notifications for the two mobile applications
- Back-office confirmation, physical vehicle allocation and chauffeur assignment
- Date-filtered available Chauffeur discovery for operations
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

OpenAPI JSON: `http://localhost:3000/openapi.json`

## Deployment order

1. Restore/snapshot the target database in staging.
2. Configure Google OAuth client IDs, Infomaniak SMTP, Stripe, Expo, DB TLS and private storage credentials.
3. Run `npm run verify:schema`.
4. Review and apply both SQL migrations through `npm run migrate`.
5. Validate rate-selection rules with finance (`tax_surecharges.amount` is confirmed as percentage).
6. Run integration tests against a staging clone.
7. Deploy API, then mobile clients.

## Security decisions

- Access tokens re-check current user status and role on every request.
- Google ID tokens are signature-, issuer-, expiry- and audience-verified by Google's official library.
- A Google identity can link to only one local user; new Google accounts may create Client profiles only.
- Password-reset tokens are hashed at rest, expire after 30 minutes and revoke active refresh sessions after use.
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
- [Frontend API integration flow](docs/API_INTEGRATION_FLOW.md)
- [Frontend screen-to-API guide](docs/FRONTEND_SCREEN_API_GUIDE.md)
- [Location and availability API flow](docs/LOCATION_AVAILABILITY_API_FLOW.md)
- [Animated frontend API flow](docs/FRONTEND_API_FLOW_ANIMATED.html)
- [Complete all-81 API frontend flow](docs/ALL_76_API_FRONTEND_FLOW.md)
- [Animated all-81 API flow](docs/ALL_76_API_FLOW_ANIMATED.html)
- [Database changes](docs/DATABASE_CHANGES.md)
- [OpenAPI contract](docs/openapi.json)
- [Validation report](docs/VALIDATION_REPORT.md)
- [Google login, password recovery and profile integration](docs/AUTH_AND_PROFILE_APIS.md)

## React API console

The [`api-console`](api-console/README.md) Vite React application provides
separate Client/Agent, Chauffeur and Operations workspaces plus a runner for all
81 documented APIs.

## Important integration notes

- `PAYMENT_PROVIDER=mock` is for local development only. Use `PAYMENT_PROVIDER=stripe` for staging and production.
- `.env.example` contains placeholders only. Never commit Stripe secret or webhook-signing keys.
- Mobile apps must register an Expo push token in the existing login device payload.
- The masked-call implementation is an adapter placeholder returning a development bridge number. Connect the selected telecom provider before production.
- Password-reset email is delivered through authenticated SMTP. Invitation email delivery remains a separate follow-up integration.
- Agent and Chauffeur Google login works only for an existing active invited account with the same verified email; Google login never self-registers those roles.
- Existing historical reservations are not automatically visible because they lack `app_reservation_meta`. Plan a reviewed backfill if this is required.
- Operations should call `GET /api/v1/operations/vehicles/available` with the class, country, optional city and service time window before assigning a physical vehicle. The assignment endpoint performs the same location and conflict checks again.
