# Frontend screen-to-API integration guide

This document describes which Release 1 API each Client, Agency Agent, and
Chauffeur screen should call. All paths use the `/api/v1` prefix.

## 1. Shared integration rules

### Authentication

Send the access token on every protected request:

```http
Authorization: Bearer <accessToken>
```

Use `POST /auth/refresh` when the API returns `401` because the access token
expired. If refresh also fails, clear the local session and return to Login.

For Google login, obtain a Google **ID token** with the Android, iOS or Web SDK
and send it to `POST /auth/google`. If a new Client receives
`GOOGLE_REGISTRATION_REQUIRED`, collect the missing phone number and repeat the
same request. Agent and Chauffeur Google login is available only for an existing
active invited account with the same verified email.

The role returned by Login controls application navigation:

| Role | Name           | Frontend area               |
| ---: | -------------- | --------------------------- |
|    3 | `CHAUFFEUR`    | Chauffeur application       |
|    4 | `AGENCY_AGENT` | Agent area of the main app  |
|    5 | `CLIENT`       | Client area of the main app |

### Pagination

Paginated endpoints accept `page` and `perPage`. `perPage` is limited to 100.

```json
{
  "items": [],
  "meta": {
    "page": 1,
    "perPage": 20,
    "total": 0,
    "pages": 0
  }
}
```

### Error response

```json
{
  "error": {
    "code": "VEHICLE_UNAVAILABLE",
    "message": "No available vehicle remains for booking leg 1"
  }
}
```

Display `message` to the user when appropriate, but use `code` for application
logic. Do not make UI decisions by comparing English messages.

### Date and time

Send ISO 8601 date-time strings. Store and transmit UTC values and format them
in the user's local timezone for display.

```text
2026-10-20T10:00:00.000Z
```

## 2. Booking status grouping in the frontend

The API stores detailed lifecycle statuses. The frontend can group them into
four user-friendly tabs.

| Frontend group  | Backend statuses                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| Payment/Pending | `PAYMENT_PENDING`, `PENDING_CONFIRMATION`, `CHANGE_PAYMENT_PENDING`                                              |
| Upcoming        | `CONFIRMED`, `ASSIGNED`, `CHANGE_REQUESTED`, `CANCELLATION_REQUESTED`, `CANCELLATION_APPROVED`                   |
| Live            | `PREPARING`, `ON_THE_WAY`, `ARRIVED`, `WAITING`, `PASSENGER_ONBOARD`, `IN_SERVICE`, `AT_STOP`, `DROPOFF_REACHED` |
| Finished        | `COMPLETED`, `CANCELLED`, `REJECTED`                                                                             |

`GET /bookings` accepts one exact `status` filter at a time. For an Upcoming tab
covering several statuses, load the paginated booking list and group by status
and service date in the app. `GET /client/dashboard` already supplies the first
five upcoming and recent items for the Client home screen.

## 3. Client application

### Recommended Client navigation

```text
Home | Book | My bookings | Messages | Profile
```

### Client screen/API matrix

| Screen or component    | API                                                         | When to call                             | Main use                                               |
| ---------------------- | ----------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------ |
| Splash/session restore | `GET /auth/me`                                              | App launch after reading stored token    | Confirm session and Client role                        |
| Registration           | `POST /auth/client/register`                                | Submit registration                      | Create Client account and session                      |
| Login                  | `POST /auth/login`                                          | Submit login                             | Authenticate and register Expo device token            |
| Google login           | `POST /auth/google`                                         | Google button / first-time Client signup | Verify Google identity, link account and issue session |
| Home dashboard         | `GET /client/dashboard`                                     | Opening or refreshing Home               | Active, upcoming and recent bookings                   |
| Service cards          | `GET /catalog/services`                                     | Home/Book screen                         | Display five enabled services                          |
| Country picker         | `GET /catalog/countries?serviceCode=...`                    | After selecting an instant service       | Return valid database country IDs                      |
| GPS name-to-ID mapping | `GET /catalog/location/resolve?countryCode=...&city=...`    | After frontend reverse geocoding         | Map detected names to existing database IDs            |
| City picker            | `GET /catalog/cities?countryId=...&search=...`              | After selecting country                  | Return active cities and coordinates                   |
| Vehicle class results  | `GET /catalog/vehicle-classes?...&countryId=...&cityId=...` | After location, date/time and passengers | Display classes backed by local available vehicles     |
| Booking options        | `GET /catalog/options?serviceCode=...`                      | Vehicle/options step                     | Display configured extras                              |
| Draft creation         | `POST /bookings/drafts`                                     | Starting instant booking                 | Create server-side draft                               |
| Resume draft           | `GET /bookings/drafts/{draftId}`                            | Returning to an unfinished flow          | Restore entered details                                |
| Save booking form      | `PUT /bookings/drafts/{draftId}/details`                    | Continue from passenger/trip form        | Save passenger, legs, class and options                |
| Price review           | `POST /bookings/drafts/{draftId}/quote`                     | Opening final review                     | Recheck availability and calculate total               |
| Checkout               | `POST /bookings/drafts/{draftId}/checkout`                  | User confirms payment                    | Create reservation and Stripe PaymentIntent            |
| Payment status         | `GET /payments/{paymentId}`                                 | After Stripe result or app resume        | Read backend-confirmed payment state                   |
| Retry payment setup    | `POST /payments/{paymentId}/retry`                          | Intent creation failed                   | Create another PaymentIntent for same payment          |
| Booking overview       | `GET /bookings?page=...`                                    | My bookings / All                        | Paginated accessible bookings                          |
| Completed bookings     | `GET /bookings?status=COMPLETED`                            | Completed tab                            | Paginated completed bookings                           |
| Cancelled bookings     | `GET /bookings?status=CANCELLED`                            | Cancelled tab                            | Paginated cancelled bookings                           |
| Full booking detail    | `GET /bookings/{reservationId}`                             | User taps a booking                      | Header, legs, costs, events, assignments and payments  |
| Live map/timeline      | `GET /client/bookings/{reservationId}/tracking`             | Live booking screen                      | Chauffeur, latest GPS location and timeline            |
| Receipt                | `GET /client/bookings/{reservationId}/receipt`              | Completed booking                        | Structured costs and payments                          |
| Change request         | `POST /bookings/{reservationId}/change-requests`            | Modify booking                           | Submit validated changes for approval                  |
| Cancellation request   | `POST /bookings/{reservationId}/cancellation-requests`      | Cancel booking                           | Submit cancellation/refund request                     |
| VIP request            | `POST /bookings/vip-requests`                               | Airport VIP form                         | Submit manual request                                  |
| VIP history            | `GET /bookings/manual-requests/vip`                         | VIP requests screen                      | List accessible VIP requests                           |
| Concierge request      | `POST /bookings/concierge-requests`                         | Concierge form                           | Submit manual request                                  |
| Concierge history      | `GET /bookings/manual-requests/concierge`                   | Concierge requests screen                | List accessible Concierge requests                     |
| Profile details        | `GET /client/profile`                                       | Profile screen                           | Load contact/address/language information              |
| Edit profile           | `PATCH /client/profile`                                     | Save profile                             | Update supported profile fields                        |
| Notifications          | `GET /notifications`                                        | Notification inbox                       | Paginated in-app alerts                                |
| Mark notification read | `POST /notifications/{id}/read`                             | Open one alert                           | Mark one item read                                     |
| Mark all read          | `POST /notifications/read-all`                              | Inbox action                             | Mark all alerts read                                   |
| Start booking chat     | `POST /communication/bookings/{reservationId}/conversation` | Open Chat from booking                   | Create or synchronize participants                     |
| Read messages          | `GET /communication/conversations/{id}/messages`            | Chat screen                              | Paginated messages                                     |
| Send message           | `POST /communication/conversations/{id}/messages`           | Chat composer                            | Send text or uploaded document                         |
| Masked call            | `POST /communication/bookings/{reservationId}/masked-call`  | Call action                              | Obtain temporary call bridge                           |
| Upload document        | `POST /documents`                                           | Attach file                              | Upload private JPEG, PNG, WebP or PDF                  |
| Download document      | `GET /documents/{id}/download`                              | Open attachment                          | Authorized file download                               |
| Password reset         | `POST /auth/password/forgot`, `/password/reset`             | Forgot-password flow                     | Reset password                                         |
| Logout                 | `POST /auth/logout`                                         | Sign out                                 | Revoke refresh token and unregister device             |

### Client home dashboard

Call:

```http
GET /api/v1/client/dashboard
```

Response shape:

```json
{
  "activeBooking": {
    "id": 5001,
    "reservationNo": "DL-20261020-AB12CD34",
    "serviceCode": "CHAUFFEUR",
    "status": "ON_THE_WAY"
  },
  "upcomingBookings": [
    {
      "id": 5002,
      "reservationNo": "DL-20261021-EF56GH78",
      "serviceCode": "TRANSFER",
      "status": "CONFIRMED",
      "serviceDate": "2026-10-21"
    }
  ],
  "recentBookings": [
    {
      "id": 4990,
      "reservationNo": "DL-20261001-IJ90KL12",
      "serviceCode": "CHAUFFEUR",
      "status": "COMPLETED"
    }
  ]
}
```

Important behavior:

- `activeBooking` is the newest booking in a live ride state, or `null`.
- `upcomingBookings` returns at most five non-terminal bookings whose first leg
  is today or later.
- `recentBookings` returns at most five `COMPLETED` or `CANCELLED` bookings.
- A tap on any card opens `GET /bookings/{reservationId}`.
- The active card should also offer Live Tracking.

### Client My Bookings screens

Use `GET /bookings?page=1&perPage=20` as the canonical paginated list.

Suggested tabs:

- **Upcoming:** load `/bookings`, then group non-terminal, non-live future items.
- **Live:** show `activeBooking` from `/client/dashboard`; use the tracking API
  after opening it.
- **Completed:** `/bookings?status=COMPLETED`.
- **Cancelled:** `/bookings?status=CANCELLED`; optionally also request
  `status=REJECTED` as a separate filter.

### Full Client booking detail

Call:

```http
GET /api/v1/bookings/{reservationId}
```

The response contains:

- Booking number, service, lifecycle status and source channel
- Reservation legs with pickup/drop-off, dates, times, class and passenger data
- Cost lines and total tax
- Append-only status timeline
- Chauffeur assignments and their statuses
- Stripe/backend payment records

Use this endpoint for the normal detail page. Use the Client tracking endpoint
only when live GPS is needed.

### Client live tracking screen

Call:

```http
GET /api/v1/client/bookings/{reservationId}/tracking
```

Response:

```json
{
  "assignment": {
    "id": 850,
    "status": "ON_THE_WAY",
    "chauffeurName": "Driver Name",
    "chauffeurPhoto": "uploads/..."
  },
  "location": {
    "latitude": 46.2044,
    "longitude": 6.1432,
    "heading": 180,
    "speed": 40,
    "accuracy": 10,
    "recordedAt": "2026-10-20T09:50:00.000Z"
  },
  "timeline": []
}
```

Poll this endpoint while the live screen is open if a Socket.IO update is not
available. Stop frequent polling when the booking reaches a terminal status.

### Client profile

Load:

```http
GET /api/v1/client/profile
```

Available fields:

```text
id, fullName, email, phone, countryId, city, state, zipCode,
addressOne, addressTwo, photo, language
```

Update:

```http
PATCH /api/v1/client/profile
```

Supported editable fields:

```text
fullName, phone, countryId, city, state, zipCode,
addressOne, addressTwo, language
```

Email and profile photo are read-only in Release 1. There is currently no
profile-photo update endpoint.

## 4. Agency Agent application area

### Recommended Agent navigation

```text
Dashboard | Clients | Bookings | Commissions | Notifications | Account
```

### Agent screen/API matrix

| Screen or component     | API                                        | Purpose                                                                  |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| Session/account summary | `GET /auth/me`                             | User, role, Agent ID, Agency ID and Agent type                           |
| Google login            | `POST /auth/google`                        | Login to an existing active invited Agent account                        |
| Profile details         | `GET /agent/profile`                       | Load Agent contact, agency, type and language                            |
| Edit profile            | `PATCH /agent/profile`                     | Update name, phone, address and language                                 |
| Dashboard               | `GET /agent/dashboard`                     | Client count, active booking count, unread alerts and commission summary |
| Client roster           | `GET /agent/clients?page=...&search=...`   | Only explicitly assigned clients                                         |
| Create client           | `POST /agent/clients`                      | Create and automatically assign a Client                                 |
| Client contact card     | `GET /agent/clients/{customerId}`          | Contact and stored preferences                                           |
| Client booking history  | `GET /agent/clients/{customerId}/bookings` | Current, upcoming and past bookings for one managed Client               |
| All managed bookings    | `GET /bookings?page=...`                   | Paginated bookings across assigned Clients                               |
| Booking details         | `GET /bookings/{reservationId}`            | Legs, costs, status events, assignment and payment                       |
| New booking             | Catalog plus `/bookings/drafts/...`        | Same booking process as Client, with `customerId`                        |
| Change/cancel           | Booking change/cancellation request APIs   | Submit request for a managed Client                                      |
| Manual services         | VIP/Concierge APIs with `customerId`       | Submit and list manual requests                                          |
| Commissions             | `GET /agent/commissions`                   | Agency commission entries                                                |
| Notifications           | `/notifications` APIs                      | Assigned-client status alerts                                            |
| Chat/call/documents     | Shared communication/document APIs         | Communicate on accessible bookings                                       |
| Logout/password         | Shared Auth APIs                           | Account security                                                         |

### Agent booking creation difference

An Agent must select an assigned Client first:

```json
{
  "serviceCode": "TRANSFER",
  "customerId": 150
}
```

Send this body to `POST /bookings/drafts`. All subsequent draft, details,
quotation, checkout, payment and booking-detail APIs are the same as the Client
flow. The backend rejects a `customerId` that is not assigned to the Agent.

### Agent tracking limitation

Agents can see status history and Chauffeur assignment through
`GET /bookings/{reservationId}`. The live GPS endpoint under `/client/...` is
Client-only, so Agents do not receive the latest GPS coordinate through a REST
endpoint in the current release.

## 5. Chauffeur application

### Recommended Chauffeur navigation

```text
Today | Upcoming | History | Notifications | Documents | Account
```

### Chauffeur screen/API matrix

| Screen or component      | API                                                      | Purpose                                                    |
| ------------------------ | -------------------------------------------------------- | ---------------------------------------------------------- |
| Invitation activation    | `POST /auth/invitations/accept`                          | Create password for invited account                        |
| Login                    | `POST /auth/login`                                       | Authenticate and register Expo token                       |
| Google login             | `POST /auth/google`                                      | Login to an existing active invited Chauffeur account      |
| Account/session          | `GET /auth/me`                                           | User identity and Driver ID                                |
| Profile details          | `GET /chauffeur/profile`                                 | Load personal, location and language fields                |
| Edit profile             | `PATCH /chauffeur/profile`                               | Update non-compliance profile fields                       |
| Today/upcoming dashboard | `GET /chauffeur/dashboard`                               | Today's and next assignments plus summary                  |
| Assignment detail        | `GET /chauffeur/assignments/{assignmentId}`              | Service, passenger and itinerary information               |
| Accept assignment        | `POST /chauffeur/assignments/{assignmentId}/acknowledge` | Accept offered work                                        |
| Decline assignment       | `POST /chauffeur/assignments/{assignmentId}/decline`     | Decline with reason                                        |
| Ride status              | `POST /chauffeur/assignments/{assignmentId}/status`      | Advance through controlled state machine                   |
| GPS upload               | `POST /chauffeur/assignments/{assignmentId}/location`    | Share location during active assignment                    |
| Expense submission       | `POST /chauffeur/assignments/{assignmentId}/expenses`    | Fuel, toll, parking, maintenance or other expense          |
| Incident report          | `POST /chauffeur/assignments/{assignmentId}/incidents`   | Operational/safety issue with optional evidence            |
| Ride history             | `GET /chauffeur/history?page=...`                        | Completed, no-show and cancelled assignments with earnings |
| Document list            | `GET /chauffeur/documents`                               | Chauffeur-owned private documents                          |
| Upload/download          | Shared `/documents` APIs                                 | Receipts and evidence files                                |
| Notifications            | Shared `/notifications` APIs                             | New assignment/change/cancellation alerts                  |
| Chat/call                | Shared `/communication` APIs                             | Contact Client or Support on assigned booking              |
| Password/logout          | Shared Auth APIs                                         | Account security                                           |

### Chauffeur dashboard

Call:

```http
GET /api/v1/chauffeur/dashboard
```

Response sections:

- `today`: non-declined/non-cancelled assignments scheduled today
- `upcoming`: next ten future assignments
- `summary.completedToday`
- `summary.remainingToday`

Refresh this screen after receiving a push notification and when the app returns
to the foreground.

### Assignment state machine

```text
OFFERED
  ├─ ACKNOWLEDGED → PREPARING → ON_THE_WAY → ARRIVED
  │                                      ├─ WAITING
  │                                      └─ PASSENGER_ONBOARD
  │                                           → IN_SERVICE
  │                                           ↔ AT_STOP
  │                                           → DROPOFF_REACHED
  │                                           → COMPLETED
  └─ DECLINED
```

`NO_SHOW` is allowed after `ARRIVED` or `WAITING`. Operations can cancel a
non-terminal assignment. Only show buttons valid for the current status.

### Chauffeur location behavior

- Do not send GPS while the assignment is `OFFERED`.
- Start only after acknowledgement and user/location permission.
- Send `latitude`, `longitude`, `recordedAt`, and optional heading/speed/accuracy.
- Stop on `COMPLETED`, `NO_SHOW`, `DECLINED`, or `CANCELLED`.
- The backend rejects timestamps more than five minutes in the future or more
  than 24 hours old.

### Chauffeur profile rules

Use `GET /chauffeur/profile` to load identity, contact, location and language
fields and `PATCH /chauffeur/profile` to save the supported fields. Driver
licence, passport and professional-licence fields remain controlled by
Operations/private-document workflows. `GET /chauffeur/documents` provides the
private document list.

## 6. Shared communication and notification flow

### Conversation

1. Call `POST /communication/bookings/{reservationId}/conversation`.
2. Save the returned conversation `id`.
3. Load `GET /communication/conversations/{id}/messages`.
4. Send text with `POST /communication/conversations/{id}/messages`.
5. For a document message, upload to `/documents` first and send the returned
   `documentId`.

Only authorized booking participants can access the conversation.

### Expo notifications

1. Ask for notification permission.
2. Obtain the Expo push token.
3. Include it in the Login `device` object.
4. On notification tap, read the notification `data` and navigate to the
   referenced booking, payment, assignment, request, or incident.
5. Refresh the relevant REST screen; push content is an alert, not the final
   source of truth.

## 7. APIs not intended for mobile roles

`/operations/*` APIs require Admin or Staff. Client, Agent, and Chauffeur apps
must not call them.

Operations uses these endpoints to:

- Invite Agents and Chauffeurs
- Assign existing Clients to Agents
- Review pending bookings
- Confirm/reject bookings
- Find and assign available physical vehicles
- Find and assign non-overlapping Chauffeurs
- Approve changes and cancellations
- Review expenses and incidents
- Update Airport VIP and Concierge requests

## 8. Current Release 1 limitations

The following are not currently available as mobile APIs:

- Client profile-photo update
- Agent REST access to the Client live GPS coordinate
- Backend address autocomplete/geocoding; use Google Maps/Places or another
  configured map provider in the frontend
- In-app instant quotation/payment for Airport VIP and Concierge
- Production masked calling until a telecom provider replaces the mock adapter
- Rental contracts, pickup/return inspections, and damage-capture workflows
- Deferred AI, OCR, predictive and voice features

These limitations should be represented in the UI rather than calling an
undocumented endpoint.

## 9. Frontend implementation order

1. Authentication, secure token storage and token refresh
2. Role-based navigation
3. Client dashboard, booking lists, detail and profile
4. Service/country/city/vehicle-class catalog
5. Draft, quote, Stripe checkout and payment status
6. Operations confirmation/assignment testing
7. Client live tracking, notifications and communication
8. Agent client roster and booking-on-behalf flow
9. Chauffeur assignment dashboard, state machine and GPS
10. Documents, expenses, incidents, receipts and edge-case testing

The OpenAPI contract remains available at `/openapi.json`, with Swagger UI at
`/docs`.
