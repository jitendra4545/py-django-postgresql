# Frontend API integration flow

All paths below use the `/api/v1` prefix. Protected requests send
`Authorization: Bearer <accessToken>`.

## Service routing

```mermaid
flowchart TD
    A[Register or log in] --> B[GET catalog/services]
    B --> C{bookingMode}
    C -->|INSTANT| D[Country, city, time and passengers]
    D --> E[GET catalog/vehicle-classes]
    E --> F[Draft, details and quote]
    F --> G[Checkout and Stripe]
    G --> H[Operations confirmation and assignment]
    C -->|MANUAL_REQUEST| I{Service}
    I -->|Airport VIP| J[POST bookings/vip-requests]
    I -->|Concierge| K[POST bookings/concierge-requests]
```

`CHAUFFEUR`, `TRANSFER`, and `CAR_RENTAL` are instant-booking services.
`AIRPORT_VIP` and `CONCIERGE` are manual requests and do not use the vehicle-class
or checkout sequence in Release 1.

## Client instant-booking sequence

```mermaid
sequenceDiagram
    participant C as Client app
    participant API as Backend API
    participant S as Stripe
    participant O as Operations
    participant D as Chauffeur app
    C->>API: GET /catalog/services
    C->>API: GET /catalog/countries?serviceCode=...
    C->>API: GET /catalog/location/resolve?countryCode=...&city=...
    C->>API: GET /catalog/cities?countryId=...
    C->>API: GET /catalog/vehicle-classes?...countryId&cityId&dates
    C->>API: GET /catalog/options?serviceCode=...
    C->>API: POST /bookings/drafts
    C->>API: PUT /bookings/drafts/{id}/details
    C->>API: POST /bookings/drafts/{id}/quote
    C->>API: POST /bookings/drafts/{id}/checkout
    API-->>C: paymentId + clientSecret
    C->>S: Confirm PaymentIntent
    S->>API: Signed payment webhook
    O->>API: Confirm booking
    O->>API: Find and assign vehicle
    O->>API: Find and assign chauffeur
    API-->>D: Assignment push notification
    D->>API: Acknowledge and update ride status
    C->>API: GET /client/bookings/{id}/tracking
```

The client selects a vehicle **class**. Only Operations can see and allocate a
physical vehicle.

The location resolved from the device is only a default. The user may change
it. Availability uses the final selected `countryId` and optional `cityId` and
only considers active (`status=1`), online-bookable vehicles mapped through the
existing `vehicle_cities` table.

## Agency Agent sequence

```mermaid
flowchart TD
    A[Agent accepts invitation and logs in] --> B[GET agent/clients]
    B --> C{Client exists?}
    C -->|No| D[POST agent/clients]
    C -->|Yes| E[Select assigned client]
    D --> E
    E --> F[GET catalog/services]
    F --> G[Country, city, date and available class]
    G --> H[POST bookings/drafts with customerId]
    H --> I[Details, quote, checkout and Stripe]
    I --> J[Track booking for managed client]
    J --> K[GET agent/commissions]
```

The Agent uses the same booking APIs as the Client, but supplies the selected
managed client's `customerId` when creating the draft. The backend verifies the
assignment boundary.

## Chauffeur sequence

```mermaid
flowchart TD
    A[Operations invitation] --> B[POST auth/invitations/accept]
    B --> C[POST auth/login with Expo token]
    C --> D[GET chauffeur/dashboard]
    D --> E[GET chauffeur/assignments/{id}]
    E --> F{Accept?}
    F -->|No| G[POST decline]
    F -->|Yes| H[POST acknowledge]
    H --> I[PREPARING → ON_THE_WAY → ARRIVED]
    I --> J[WAITING → PASSENGER_ONBOARD → IN_SERVICE]
    J --> K[AT_STOP / DROPOFF_REACHED → COMPLETED]
    H --> L[POST location while active]
    I --> M[Optional expense or incident]
```

## Operational discovery APIs

- `GET /operations/vehicles/available` finds physical vehicles without blocks,
  reserved dates, or overlapping allocations.
- `GET /operations/chauffeurs/available` finds active chauffeurs without
  overlapping assignments.
- The corresponding assignment endpoints recheck conflicts transactionally.

## Shared APIs

- `/notifications` provides the in-app inbox; Expo tokens are registered at login.
- `/communication/...` provides booking chat and the masked-call adapter.
- `/documents` uploads private files used by messages, expenses, and incidents.
- `/bookings/{id}/change-requests` and `/cancellation-requests` submit requests
  for Operations approval.
