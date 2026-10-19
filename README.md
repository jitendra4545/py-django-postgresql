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
- Class-first, multi-leg booking drafts, country/city/date-aware physical-vehicle availability, legacy seasonal/duration/distance pricing and quote snapshots
- Google Places New autocomplete/details and optional Google Routes verified distance for distance-sensitive pricing
- Legacy-compatible reservation/detail/itinerary/cost/payment writes
- Agency roster, per-client bookings, alerts and commission visibility
- Stripe PaymentIntents, signature-verified webhooks, refunds and mock mode for development
- Expo push notifications for the two mobile applications
- Stripe-confirmed automatic booking confirmation, physical-vehicle allocation at checkout and back-office chauffeur assignment
- Date-filtered available Chauffeur discovery for operations
- Assignment-level state machine, acknowledgement, GPS, expenses and incidents
- Shared Client/Agent tracking with throttled GPS updates, stale-location state and Socket.IO recovery
- Secure booking chat, unread counts, read receipts and in-app/Expo new-message notifications
- DigitalOcean Spaces public/private storage separation with signed private downloads
- Production-safe disabled masked calling plus a pluggable telecom-provider boundary
- Agent/Chauffeur invitation email templates and resend workflow
- Authorization-gated invoice API adapter prepared for the existing invoice table
- Approved booking changes are applied/repriced by this backend; cancellations use Stripe refunds
- Agency commissions remain owned by the existing website/Operations system; this API reads them without recalculation
- Existing fleet blocks, reservation calendars, vehicle replacement history and activity logs are reused instead of duplicated
- Swagger UI and OpenAPI 3.0 JSON

Rental inspections and all AI/OCR/predictive features are deferred. See [docs/RELEASE_1_FLOW.md](docs/RELEASE_1_FLOW.md).

## Requirements

- Node.js 20+
- MySQL 8+
- Existing `drive_luxury` schema. The supplied SQL export is incomplete for the fleet/rate tables, so verify against a staging clone before production.

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

Browser password-reset page: `http://localhost:3000/reset-password?token=...`

## Deployment order

1. Restore/snapshot the target database in staging.
2. Configure Google OAuth client IDs, Infomaniak SMTP, Stripe, Expo, DB TLS and private storage credentials.
3. Run `npm run verify:schema`.
4. Review and apply all SQL migrations through `npm run migrate`.
5. Compare seasonal, duration, transfer, pickup/collection, option and tax quotes against PHP production examples.
6. Run integration tests against a staging clone.
7. Deploy API, then mobile clients.

## Security decisions

- Access tokens re-check current user status and role on every request.
- Google ID tokens are signature-, issuer-, expiry- and audience-verified by Google's official library.
- A Google identity can link to only one local user; new Google accounts may create Client profiles only.
- Password-reset tokens are hashed at rest, expire after 30 minutes and revoke active refresh sessions after use.
- Agent and Chauffeur accounts cannot self-register.
- Private files are never exposed as a public static directory.
- Chat attachments must belong to the sender, match the booking, and remain unexpired.
- Public CDN media and private booking documents use different object prefixes and ACL paths.
- Checkout is idempotent.
- Stripe webhooks use Stripe SDK signature verification and event IDs are replay-protected.
- Device IDs and push tokens have a single owner.
- Confirmed bookings use reviewed change/cancellation requests.
- The API privately selects an eligible physical vehicle at quote time and locks/holds it at checkout; clients see only classes.
- Client/Agent catalog results contain only vehicle classes backed by `status=1` available vehicles; statuses 0 and 2–7 are internal and never exposed as choices.

## Documentation

- [Release 1 flow](docs/RELEASE_1_FLOW.md)
- [Frontend API integration flow](docs/API_INTEGRATION_FLOW.md)
- [Frontend screen-to-API guide](docs/FRONTEND_SCREEN_API_GUIDE.md)
- [Location and availability API flow](docs/LOCATION_AVAILABILITY_API_FLOW.md)
- [Animated frontend API flow](docs/FRONTEND_API_FLOW_ANIMATED.html)
- [Complete frontend API flow](docs/ALL_76_API_FRONTEND_FLOW.md)
- [Animated frontend API flow](docs/ALL_76_API_FLOW_ANIMATED.html)
- [Database changes](docs/DATABASE_CHANGES.md)
- [DigitalOcean deployment](docs/DIGITALOCEAN_DEPLOYMENT.md)
- [Production communication, tracking and storage integration](docs/PRODUCTION_INTEGRATIONS.md)
- [OpenAPI contract](docs/openapi.json)
- [Validation report](docs/VALIDATION_REPORT.md)
- [Google login, password recovery and profile integration](docs/AUTH_AND_PROFILE_APIS.md)

## Important integration notes

- `PAYMENT_PROVIDER=mock` is for local development only. Use `PAYMENT_PROVIDER=stripe` for staging and production.
- `.env.example` contains placeholders only. Never commit Stripe secret or webhook-signing keys.
- Mobile apps must register an Expo push token in the existing login device payload.
- Masked calling defaults to disabled and returns an explicit `503` until a telecom adapter is registered. Mock calling is blocked in production.
- Password-reset and account-invitation emails use authenticated SMTP. Invitation resend expires every older unused token before creating a new seven-day token.
- DigitalOcean App Platform deployment trusts exactly one proxy hop so `express-rate-limit` can identify clients from forwarded IP headers.
- Invoice access reads existing `reservation_invoices` and `reservation_invoice_details` when `INVOICE_ADAPTER=legacy`; Operations still owns invoice creation.
- Agent and Chauffeur Google login works only for an existing active invited account with the same verified email; Google login never self-registers those roles.
- Existing historical reservations are not automatically visible because they lack `app_reservation_meta`. Plan a reviewed backfill if this is required.
- `GOOGLE_PLACES_API_KEY` enables address autocomplete. Distance-based production quotes also require an authorized Routes API key and `GOOGLE_ROUTES_ENABLED=true`; no submitted kilometres are trusted in production.
- Unpaid checkout holds expire after the quotation window; signed Stripe payment-success events confirm legacy `reservations.status=1` and `payment_status=20` automatically.
- See [Legacy compatibility and staging checklist](docs/LEGACY_PARITY_STAGING.md) before pointing this release at the shared website database.
