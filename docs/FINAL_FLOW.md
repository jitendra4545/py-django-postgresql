# Drive Luxury — Final Backend Flow

## Authentication / self-registration

Three dedicated mobile apps share one backend and one legacy `users` table, but each app has its own self-registration route. The route selects the role; the caller does not submit an arbitrary role value.

- Client: `POST /api/v1/auth/client/register` -> legacy role `5` + `customers` row
- Chauffeur/Driver: `POST /api/v1/auth/chauffeur/register` (or `/driver/register`) -> legacy role `3` + `drivers` row
- Rental Agent: `POST /api/v1/auth/agent/register` -> legacy role `4` + `agents` row
- All roles: `POST /api/v1/auth/login`

The legacy `drivers.country_id` field is required, so driver registration uses the supplied `countryId` or `DEFAULT_COUNTRY_ID`. The legacy `agents.agency_id` field is required, so agent registration requires an existing `agencyId`.

## Client

`Self-register/Login -> Dashboard -> Service -> Details -> Fleet/Options -> Quote -> Payment/Confirmation -> Back-office validation -> Assignment -> Tracking/Communication -> Completion -> Receipt/History`

## Chauffeur

`Self-register/Login -> Dashboard -> Assignment -> Job Details -> Start -> On The Way -> Arrived -> Customer Collected -> In Service -> Drop-off -> Completed -> Expenses/History/Documents`

## Rental Agent

`Self-register/Login -> Assigned Contract -> Pickup Inspection -> Required Media -> Mileage/Fuel -> Checklist -> Damage -> Signature -> Delivery -> Rental In Progress -> Return Inspection -> Damage Comparison -> Return Checklist -> Return Signature -> Completed`

## System of record

The legacy Drive Luxury database remains authoritative. Mobile-specific tables keep detailed events, GPS, refresh tokens, notifications, chat, expenses, payment-provider references, and inspection media/session state. Final operational records are synchronized into the legacy reservation/inspection/payment domains where safe.
