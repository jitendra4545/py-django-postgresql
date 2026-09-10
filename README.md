# Drive Luxury Mobile Backend

Node.js + Express + JavaScript integration API for the **Client App**, **Chauffeur App**, and **Rental Agent App**, connected to the existing Drive Luxury MySQL database used by the website/back-office.

## What is implemented

- Existing `users` / `customers` / `drivers` / `agents` authentication mapping
- Legacy Laravel bcrypt `$2y$` password compatibility
- Self-registration for Client, Chauffeur/Driver, and Rental Agent apps
- Shared email/password login for all roles
- Optional Google customer login
- JWT access + rotating refresh tokens + logout
- Role-based and record-level authorization
- Client dashboard/profile
- Four-step booking flow:
  1. Service
  2. Details
  3. Fleet/options/insurance
  4. Quote/payment/confirmation
- Existing fleet availability checks using `vehicles`, `vehicle_service_types`, `vehicle_reserved_dates`, and `vehicle_blocks`
- Compatibility pricing adapter using legacy rate/option/insurance/tax tables
- Transactional reservation creation into existing reservation tables
- Booking history/detail/modification/cancellation
- Payment provider abstraction with a runnable **mock provider**
- Legacy payment record synchronization without writing raw card/CVV data
- Back-office testing/integration APIs for confirmation, chauffeur assignment, rental-agent assignment, and schedule changes
- Chauffeur dashboard, assigned rides, ride state machine, GPS, checkpoints, expenses, history, documents
- Rental Agent contracts, pickup/return inspections, required four-side media, mileage/fuel, checklist, damages, signatures, delivery/return completion
- Legacy inspection/damage/signature synchronization
- In-app conversations/messages
- Masked-calling abstraction with a runnable **mock provider**
- Persistent notifications, Socket.IO events, optional FCM push
- Local or S3 media storage
- Idempotency for checkout and expense submission
- Swagger endpoint index at `/docs`
- Postman collection for the complete test flow

## Important architecture rule

The existing Drive Luxury / Nextcorp database remains the system of record. This project does **not** create a parallel customer/reservation/vehicle system. New tables are additive and only cover mobile-specific capabilities that do not exist cleanly in the legacy schema.

## Source-driven TBC items

The supplied client specification leaves these vendor/business rules open. This code intentionally isolates them behind adapters/configuration instead of inventing a production decision:

- certified production payment provider and capture/preauthorization/deposit/refund rules
- maps/geocoding/ETA provider and GPS update frequency
- masked-call provider and communication retention rules
- exact cancellation/no-show/modification fees
- exact self-drive eligibility/station/extension/deposit rules
- final chauffeur earnings calculation
- final inspection checklist taxonomy

For API testing, payment and masked calling use mock providers. Replace the adapter implementation once the client chooses the providers.

---

## 1. Requirements

- Node.js 20+
- MySQL 8+
- Redis 7+ (recommended; Socket/notification API works without Redis in this package, but Redis is included for the production architecture)
- Existing `drive_luxury` database imported from the supplied SQL dump

## 2. Install

```bash
cp .env.example .env
npm install
```

Update `.env` with your existing MySQL credentials.

Start Redis:

```bash
docker compose up -d redis
```

## 3. Import the existing database

Example:

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS drive_luxury CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p drive_luxury < /path/to/drive_luxury_2026-09-02.sql
```

Do **not** replace the legacy tables with the migration in this project.

## 4. Add mobile tables

```bash
npm run migrate
```

Migration file:

```text
migrations/001_mobile_tables.sql
```

The migration is additive and uses `CREATE TABLE IF NOT EXISTS`.

## 5. Create local test users (optional)

```bash
npm run seed:test-users
```

Defaults from `.env.example`:

```text
Admin:   admin.mobile@drive-luxury.local / Admin123!
Driver:  driver.mobile@drive-luxury.local / Driver123!
Agent:   agent.mobile@drive-luxury.local / Agent123!
```

Change these before using any shared environment.

The seed command is optional for Driver and Agent now because both can self-register through their app-specific registration endpoints. A seeded Admin is still convenient for exercising the package's `/backoffice/*` test/integration endpoints locally.

Self-registration is app-specific. The endpoint chooses the role; the request body does not accept an arbitrary role:

```text
POST /api/v1/auth/client/register      -> users.role = 5 + customers row
POST /api/v1/auth/chauffeur/register  -> users.role = 3 + drivers row
POST /api/v1/auth/driver/register     -> alias of chauffeur registration
POST /api/v1/auth/agent/register      -> users.role = 4 + agents row
```

`POST /api/v1/auth/register` remains as a backward-compatible CUSTOMER-only alias. All roles use `POST /api/v1/auth/login` for login.

Legacy schema note: `drivers.country_id` is required, so chauffeur registration accepts `countryId` and falls back to `DEFAULT_COUNTRY_ID`. `agents.agency_id` is required in the existing database, so agent self-registration requires a valid `agencyId`.

## 6. Run

```bash
npm run dev
```

API:

```text
http://localhost:4000/api/v1
```

Health:

```text
GET http://localhost:4000/health
```

Swagger endpoint index:

```text
http://localhost:4000/docs
```

---

# App-specific self-registration

The three mobile apps self-register through separate endpoints. This prevents a caller from choosing an arbitrary role in the request body while still allowing self-registration from each dedicated app.

## Client / Customer

```http
POST /api/v1/auth/client/register
Content-Type: application/json
```

```json
{
  "fullName": "Mobile Client",
  "email": "client@example.com",
  "phone": "+10000000001",
  "password": "Client123!",
  "deviceId": "client-device"
}
```

Creates a legacy `users` row with role `5` and a linked `customers` row.

## Chauffeur / Driver

```http
POST /api/v1/auth/chauffeur/register
Content-Type: application/json
```

```json
{
  "fullName": "Mobile Chauffeur",
  "email": "chauffeur@example.com",
  "phone": "+10000000002",
  "password": "Driver123!",
  "countryId": 1,
  "licenseNumber": "DL-12345",
  "licenseExpiryDate": "2028-12-31",
  "city": "Dubai",
  "address": "Test address",
  "deviceId": "chauffeur-device"
}
```

Creates a legacy `users` row with role `3` and a linked `drivers` row. `countryId` is optional in the API; when omitted, `DEFAULT_COUNTRY_ID` is used. The country must exist in the legacy `countries` table. `POST /api/v1/auth/driver/register` is an alias.

## Rental Agent

```http
POST /api/v1/auth/agent/register
Content-Type: application/json
```

```json
{
  "fullName": "Mobile Agent",
  "email": "agent@example.com",
  "phone": "+10000000003",
  "password": "Agent123!",
  "agencyId": 1,
  "agentType": 2,
  "address": "Test address",
  "deviceId": "agent-device"
}
```

Creates a legacy `users` row with role `4` and a linked `agents` row. `agencyId` is required because the existing `agents.agency_id` column is non-nullable; the agency must already exist in the legacy `agencies` table.

## Shared login

All three apps use the same login endpoint:

```http
POST /api/v1/auth/login
```

The response returns `role` and `roleId`. Backend route middleware still enforces Client vs Chauffeur vs Agent access, so frontend routing is not the security boundary.

# Complete test order

## Client — chauffeur flow

1. `POST /auth/client/register`
2. `POST /notifications/devices`
3. `GET /client/dashboard`
4. `POST /bookings/drafts` with `CHAUFFEUR`
5. `PATCH /bookings/drafts/:id/details`
6. `GET /catalog/vehicles/available`
7. `GET /catalog/options`
8. `PATCH /bookings/drafts/:id/options`
9. `POST /bookings/drafts/:id/quote`
10. `POST /bookings/drafts/:id/checkout` with an `Idempotency-Key`
11. `POST /payments/:paymentId/confirm`
12. Admin: `POST /backoffice/bookings/:id/decision` -> `CONFIRM`
13. Admin: `POST /backoffice/bookings/:id/assign-chauffeur`
14. Driver: `GET /chauffeur/dashboard`
15. Driver: `POST /chauffeur/rides/:id/start`
16. Driver: `POST /chauffeur/rides/:id/location`
17. Driver checkpoints in order:
    - `ARRIVED`
    - `CUSTOMER_COLLECTED`
    - `IN_SERVICE`
    - `DROP_OFF_REACHED`
    - `COMPLETED`
18. Client: `GET /client/bookings/:id/tracking`
19. Client: `GET /bookings/:id/receipt`

## Client — rental flow

1. Create a new draft with `CAR_RENTAL`
2. Set details including pickup and return dates
3. Query `serviceTypeId=2` availability
4. Set vehicle/add-ons/insurance
5. Quote
6. Checkout
7. Confirm payment
8. Admin confirms booking
9. Admin assigns rental agent
10. Agent starts `PICKUP` inspection
11. Upload `FRONT`, `REAR`, `LEFT`, `RIGHT` media
12. Set mileage/fuel readings
13. Submit checklist containing:
    - `CLEAN_INSIDE`
    - `CLEAN_OUTSIDE`
    - `GPS_CHECK`
    - `DOCUMENTS`
    - `FUEL_VERIFICATION`
14. Record damage if applicable
15. Save customer signature
16. Complete pickup inspection -> rental becomes `IN_PROGRESS`
17. Start `RETURN` inspection
18. Repeat four-side media/readings/checklist
19. Add new/changed damage evidence if applicable
20. Save return signature
21. Complete return inspection -> rental becomes `COMPLETED`

---

# Four-step client booking payload examples

## Step 1

```http
POST /api/v1/bookings/drafts
Authorization: Bearer <client-token>
Content-Type: application/json
```

```json
{
  "category": "CHAUFFEUR",
  "variant": "TRANSFER"
}
```

`variant=TRANSFER` maps to legacy reservation `service_type=3`; normal chauffeur maps to `1`; self-drive rental maps to `2`. These mappings are configurable in `.env`.

## Step 2

```json
{
  "pickupLocation": "JFK International Airport, Terminal 4",
  "dropoffLocation": "The Plaza Hotel, Fifth Avenue, NYC",
  "pickupDate": "2026-10-24",
  "pickupTime": "10:30:00",
  "dropoffDate": "2026-10-24",
  "dropoffTime": "12:00:00",
  "pickupCountryId": 1,
  "dropoffCountryId": 1,
  "approximateDistance": 25,
  "passengers": 2,
  "flightNumber": "BA178",
  "passengerContact": {
    "name": "Test Passenger",
    "phone": "+10000000000",
    "email": "passenger@example.com"
  },
  "notes": "Meet at arrivals"
}
```

The client UI specification does not require the user to enter a chauffeur drop-off time, but the legacy `reservation_details` table requires one. If the app omits it, the compatibility layer uses the pickup date/time as the legacy placeholder. Replace this with ETA/provider logic when the mapping provider is confirmed.

## Step 3

```json
{
  "vehicleId": 123,
  "optionIds": [1, 2],
  "insurance": "FULL",
  "discountAmount": 0
}
```

## Step 4

```http
POST /api/v1/bookings/drafts/<draft-id>/checkout
Idempotency-Key: 83bda71b-b6ee-44e0-8b1f-f4e0769c50e4
```

```json
{
  "paymentMethodType": "mock"
}
```

Then confirm the returned payment:

```http
POST /api/v1/payments/<payment-id>/confirm
```

---

# Security and compatibility notes

- Password verification normalizes existing Laravel `$2y$` bcrypt hashes for Node bcrypt verification.
- New mobile passwords are persisted in a Laravel-compatible bcrypt form.
- Raw payment card number and CVV are **not** written to the legacy `reservation_payment_with_cards` table.
- Chauffeurs can read only reservations assigned through `reservation_drivers`.
- Rental agents can read only contracts assigned through `rental_agent_assignments`.
- GPS publishing is rejected outside an active chauffeur ride state.
- Inspection completion is server-validated; the mobile client cannot bypass required media/checklist/signature rules.
- Booking checkout rechecks vehicle availability inside a transaction and locks the selected vehicle row before reservation creation.
- Server timestamps own operational state transitions.

# Production hardening checklist

Before production launch:

- choose and implement the certified payment-provider adapter
- choose masked calling/chat retention policy
- configure production FCM credentials
- configure S3/object-storage bucket and CDN URLs
- connect the actual geocoding/maps provider
- finalize exact pricing/cancellation/deposit/no-show logic with Drive Luxury
- finalize GDPR deletion/export workflow
- run load tests for GPS traffic and Socket.IO concurrency
- place API behind Nginx/API gateway with TLS
- use secret manager instead of plain `.env` in production
- configure DB replicas/backups and query monitoring
- add provider webhook signature verification
- add centralized metrics/tracing/Sentry if required by deployment architecture

# Folder structure

```text
src/
  common/          auth, errors, idempotency, uploads, logging
  config/          environment validation
  db/              MySQL pool and transaction helpers
  integrations/    payment, calling, push, storage adapters
  modules/         auth/client/bookings/chauffeur/agent/chat/etc.
  realtime/        Socket.IO
  scripts/         migration and local test users
migrations/        additive mobile tables
postman/           complete API test collection
docs/              flow and implementation notes
tests/             state/architecture tests
```

## Required developer tooling included

This package explicitly includes and configures the requested tooling:

- **Winston** — application/error logging
- **Morgan** — HTTP request logging wired into Winston
- **Husky** — pre-commit checks
- **Prettier** — formatting and `format:check`

Pre-commit executes formatting check, ESLint, and Vitest.
