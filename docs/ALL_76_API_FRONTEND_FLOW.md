# Complete frontend flow for all 81 APIs

This is the implementation order for the Client/Agency Agent app, Chauffeur
app, Operations/back-office integration, and backend-only Stripe processing.
All paths use `/api/v1`. Protected calls send
`Authorization: Bearer <accessToken>`.

The animated companion is `docs/ALL_76_API_FLOW_ANIMATED.html`. Swagger remains
the payload/response contract at `/docs`; this document explains **when** each
API is called, **who** calls it, and **what happens next**.

## A. Shared authentication and account lifecycle (APIs 1–8)

|   # | API                             | Caller and exact call timing                                                                      | Success → next action                                                                                       |
| --: | ------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
|   1 | `POST /auth/client/register`    | Client app: registration form submit. Never used for Agent or Chauffeur.                          | Store tokens/user, then call #5 and open Client Home.                                                       |
|   2 | `POST /auth/login`              | All apps: login submit. Include device information and Expo push token when available.            | Store tokens, inspect returned role, route Client/Agent to the main app and Chauffeur to the Chauffeur app. |
|   3 | `POST /auth/refresh`            | API client/interceptor: once after an access-token-expired `401`, or shortly before known expiry. | Replace both tokens and retry the original request once. If refresh fails, clear the session.               |
|   4 | `POST /auth/logout`             | All apps: explicit Sign Out.                                                                      | Revoke refresh session/unregister device, clear local secrets and show Login.                               |
|   5 | `GET /auth/me`                  | All apps: launch after reading stored tokens and after returning from a long background period.   | Confirm current role/status and construct role-specific navigation.                                         |
|   6 | `POST /auth/password/forgot`    | Login screen: user submits their email.                                                           | Always show a neutral “request accepted” message.                                                           |
|   7 | `POST /auth/password/reset`     | Reset-link/deep-link screen: submit token and new password.                                       | Return to Login; do not automatically reuse an old session.                                                 |
|   8 | `POST /auth/invitations/accept` | Agent/Chauffeur activation screen opened from Operations invitation.                              | Set password, then call #2. Chauffeur and Agent self-registration is not supported.                         |

## B. Catalog, detected location and vehicle selection (APIs 9–14)

|   # | API                                                      | Caller and exact call timing                                                                                          | Success → next action                                                                                       |
| --: | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
|   9 | `GET /catalog/services`                                  | Client/Agent Home or Book screen load. Cache briefly and refresh on pull-to-refresh.                                  | Render service cards and branch into instant booking or manual request.                                     |
|  10 | `GET /catalog/countries?serviceCode=...`                 | After an instant service is selected, or when detected country matching fails/user opens country picker.              | Save selected database `countryId`, clear any old city, then call #11.                                      |
|  11 | `GET /catalog/cities?countryId=...&search=...`           | Country selection and city-search typing with debounce.                                                               | Save the selected `cityId`, city name and coordinates.                                                      |
|  12 | `GET /catalog/location/resolve?countryCode=...&city=...` | After the frontend gets GPS permission and reverse-geocodes coordinates to ISO country code/city.                     | Preselect returned IDs. If no exact city, show #11; user can always override.                               |
|  13 | `GET /catalog/vehicle-classes?...`                       | When service, final country/city, dates/times and passenger count are complete; call again after any of them changes. | Render available classes only. Save selected `vehicleClassId`; never expose physical vehicle/status values. |
|  14 | `GET /catalog/options?serviceCode=...`                   | After vehicle class selection or while opening the Extras step.                                                       | Save option IDs/quantities into booking details.                                                            |

Instant services are `CHAUFFEUR`, `TRANSFER`, and `CAR_RENTAL`. Airport VIP and
Concierge branch to APIs #24 and #25. Location permission is optional; it only
creates a default. Availability uses the final user-selected country/city.

## C. Shared Client/Agent instant-booking lifecycle (APIs 15–23)

|   # | API                                                    | Caller and exact call timing                                                                                             | Success → next action                                                                          |
| --: | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
|  15 | `POST /bookings/drafts`                                | Immediately after the user starts an instant booking. Client sends `serviceCode`; Agent also sends managed `customerId`. | Persist returned `draftId` locally.                                                            |
|  16 | `GET /bookings/drafts/{draftId}`                       | Resume an unfinished booking after app restart/back navigation.                                                          | Rehydrate all form screens from server details.                                                |
|  17 | `PUT /bookings/drafts/{draftId}/details`               | Continue from the completed passenger/trip/class/options form, and again after edits.                                    | Draft becomes ready; proceed to Review.                                                        |
|  18 | `POST /bookings/drafts/{draftId}/quote`                | Review screen load after #17.                                                                                            | Display immutable 30-minute price, taxes/options and expiry. Availability is rechecked.        |
|  19 | `POST /bookings/drafts/{draftId}/checkout`             | Pay/Confirm button. Send a unique `Idempotency-Key`; disable repeat taps.                                                | Receive booking/payment IDs and Stripe `clientSecret`; confirm through Stripe SDK.             |
|  20 | `GET /bookings?page=...&status=...`                    | Client My Bookings or Agent accessible-bookings list, tab changes, pagination and refresh.                               | Group exact backend statuses into Pending, Upcoming, Live and Finished UI groups.              |
|  21 | `GET /bookings/{reservationId}`                        | Tap any booking, return from payment, push deep link, or after an approved change.                                       | Render header, legs, costs, timeline, assignments and payments.                                |
|  22 | `POST /bookings/{reservationId}/change-requests`       | User submits a permitted booking change with reason.                                                                     | Show `CHANGE_REQUESTED`; Operations handles #71 and backend applies/reprices approved changes. |
|  23 | `POST /bookings/{reservationId}/cancellation-requests` | User confirms cancellation and reason.                                                                                   | Show `CANCELLATION_REQUESTED`; Operations handles #72 and any Stripe refund.                   |

### Data persisted by #17 and #19

- Draft: `app_booking_drafts.details` JSON.
- Reservation country/city IDs: `reservation_details`.
- Full address, coordinates and instructions:
  `app_reservation_leg_meta.pickup_details/dropoff_details` JSON.
- Booking status history: append-only `app_booking_status_events`.

## D. Manual Airport VIP and Concierge flows (APIs 24–27)

|   # | API                                       | Caller and exact call timing                                                | Success → next action                                                 |
| --: | ----------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------- |
|  24 | `POST /bookings/vip-requests`             | Client/Agent submits Airport VIP form. Agent includes managed `customerId`. | Show submitted confirmation; no vehicle checkout flow in Release 1.   |
|  25 | `POST /bookings/concierge-requests`       | Client/Agent submits Concierge form.                                        | Show submitted confirmation; Operations continues manually.           |
|  26 | `GET /bookings/manual-requests/vip`       | VIP Request History screen and refresh.                                     | Render status/Operations note; open notification-driven changes here. |
|  27 | `GET /bookings/manual-requests/concierge` | Concierge Request History screen and refresh.                               | Render request status and Operations note.                            |

## E. Client-only screens (APIs 28–32)

|   # | API                                             | Exact screen/event                                        | Success → next action                                                              |
| --: | ----------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
|  28 | `GET /client/dashboard`                         | Client Home open, pull-to-refresh, or foreground refresh. | Render newest live booking, five upcoming and five recent bookings.                |
|  29 | `GET /client/profile`                           | Profile screen open.                                      | Populate editable identity/contact/address/language fields.                        |
|  30 | `PATCH /client/profile`                         | Profile Save. Only send changed supported fields.         | Replace local profile cache with response and show success.                        |
|  31 | `GET /client/bookings/{reservationId}/tracking` | Live booking screen open and periodic foreground refresh. | Display assignment, latest Chauffeur GPS and status timeline.                      |
|  32 | `GET /client/bookings/{reservationId}/receipt`  | Receipt button for paid/completed booking.                | Render cost/payment receipt; use document download only for actual uploaded files. |

## F. Agency Agent screens (APIs 33–38)

|   # | API                                        | Exact screen/event                                            | Success → next action                                                             |
| --: | ------------------------------------------ | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
|  33 | `GET /agent/dashboard`                     | Agent Home open/refresh.                                      | Show roster, bookings, alerts and commission summary.                             |
|  34 | `GET /agent/clients`                       | Clients tab, client picker before booking and search/refresh. | Select a managed client for #15.                                                  |
|  35 | `POST /agent/clients`                      | Agent submits Create Client.                                  | Client is created/assigned; select returned client and begin #9–#19 flow.         |
|  36 | `GET /agent/clients/{customerId}`          | Managed Client profile/card screen.                           | Show contact card and booking actions.                                            |
|  37 | `GET /agent/clients/{customerId}/bookings` | Managed Client → Bookings.                                    | Render only that assigned client's bookings.                                      |
|  38 | `GET /agent/commissions`                   | Commissions screen open, filters/pagination or refresh.       | Display backend-created commission entries; frontend never calculates commission. |

## G. Chauffeur application (APIs 39–48)

|   # | API                                                      | Exact screen/event                                                                                                                 | Success → next action                                           |
| --: | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
|  39 | `GET /chauffeur/dashboard`                               | Chauffeur Home open, foreground, pull-to-refresh or assignment push.                                                               | Render offered, today and upcoming assignments.                 |
|  40 | `GET /chauffeur/assignments/{assignmentId}`              | Tap assignment or push deep link.                                                                                                  | Render passenger/itinerary details and permitted actions.       |
|  41 | `POST /chauffeur/assignments/{assignmentId}/acknowledge` | Accept assignment button.                                                                                                          | Refresh #40; enable service controls at the permitted time.     |
|  42 | `POST /chauffeur/assignments/{assignmentId}/decline`     | Decline confirmation with reason.                                                                                                  | Return to dashboard and refresh #39.                            |
|  43 | `POST /chauffeur/assignments/{assignmentId}/status`      | Each service action: preparing, on the way, arrived, waiting, onboard, in service, at stop/drop-off, completed/no-show as allowed. | Update UI from server response; never skip backend state rules. |
|  44 | `POST /chauffeur/assignments/{assignmentId}/location`    | Throttled background/foreground GPS during active assignment only.                                                                 | Accept `202`; do not block driving UI while waiting.            |
|  45 | `POST /chauffeur/assignments/{assignmentId}/expenses`    | Expense form submit after optional receipt upload #60.                                                                             | Show submitted/review-pending expense.                          |
|  46 | `POST /chauffeur/assignments/{assignmentId}/incidents`   | Incident form submit; urgent safety handling remains separate from API reporting.                                                  | Show submitted incident and notify Operations.                  |
|  47 | `GET /chauffeur/history`                                 | History/Earnings screen, pagination and refresh.                                                                                   | Render completed/cancelled assignments and recorded earnings.   |
|  48 | `GET /chauffeur/documents`                               | Documents screen open/refresh.                                                                                                     | List private Chauffeur documents; open one through #61.         |

## H. Booking communication (APIs 49–52)

|   # | API                                                           | Caller and exact call timing                                      | Success → next action                                                                 |
| --: | ------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
|  49 | `POST /communication/bookings/{reservationId}/conversation`   | Client, Agent, Chauffeur or Operations opens Chat from a booking. | Store returned `conversationId`, then call #50.                                       |
|  50 | `GET /communication/conversations/{conversationId}/messages`  | Chat open, pagination/backfill and reconnect.                     | Render messages; realtime events append newer messages.                               |
|  51 | `POST /communication/conversations/{conversationId}/messages` | Send text or previously uploaded document ID.                     | Replace optimistic message with server record.                                        |
|  52 | `POST /communication/bookings/{reservationId}/masked-call`    | User taps Call and chooses permitted recipient role.              | Launch returned temporary bridge; provider adapter must be configured for production. |

## I. Stripe/backend payment processing (APIs 53–56)

|   # | API                                       | Caller and exact call timing                                                            | Success → next action                                                                    |
| --: | ----------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
|  53 | `GET /payments/{paymentId}`               | Client/Agent after Stripe SDK returns, app resumes, or payment screen refreshes.        | Use backend status as truth; open booking when paid or offer retry when failed.          |
|  54 | `POST /payments/{paymentId}/mock-confirm` | Developer/test UI only when `PAYMENT_PROVIDER=mock`; never ship as production behavior. | Simulate paid state for local integration.                                               |
|  55 | `POST /payments/{paymentId}/retry`        | PaymentIntent creation failed and user taps Retry.                                      | Confirm the newly returned Stripe client secret, then call #53.                          |
|  56 | `POST /payments/webhook`                  | Stripe servers only, not mobile/web frontend.                                           | Backend verifies signature, deduplicates event and updates payment/booking/refund state. |

## J. Notifications (APIs 57–59)

|   # | API                             | Caller and exact call timing                                               | Success → next action                                    |
| --: | ------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------- |
|  57 | `GET /notifications`            | Inbox open, pagination, pull-to-refresh and push deep-link reconciliation. | Render notifications and route using their data payload. |
|  58 | `POST /notifications/{id}/read` | User opens one unread notification.                                        | Update unread count locally.                             |
|  59 | `POST /notifications/read-all`  | Mark All Read action.                                                      | Clear local unread indicators after success.             |

## K. Private documents (APIs 60–61)

|   # | API                            | Caller and exact call timing                                            | Success → next action                                             |
| --: | ------------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
|  60 | `POST /documents`              | Attachment/receipt/document picker confirmation using multipart upload. | Use returned document ID in message, expense or incident request. |
|  61 | `GET /documents/{id}/download` | Authorized user taps a private document.                                | Stream/open bytes securely; do not construct public storage URLs. |

## L. Operations/back-office workflow (APIs 62–76)

|   # | API                                                                          | Exact operational timing                                                   | Success → next action                                                                       |
| --: | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
|  62 | `POST /operations/agency-agents`                                             | Admin creates Agent invitation.                                            | Send invitation link through configured email/SMS channel; user activates with #8.          |
|  63 | `POST /operations/chauffeurs`                                                | Admin creates Chauffeur invitation with country/city/provider.             | Send activation link; Chauffeur uses #8 then #2.                                            |
|  64 | `GET /operations/chauffeurs/available`                                       | Assignment screen after booking leg/time/location are known.               | Choose a non-overlapping Chauffeur, then call #68.                                          |
|  65 | `POST /operations/agent-client-assignments`                                  | Admin assigns an existing client to an Agent.                              | Client becomes visible through #34/#36/#37.                                                 |
|  66 | `GET /operations/bookings/pending`                                           | Operations queue load, refresh and notification arrival.                   | Open pending booking/request for decision.                                                  |
|  67 | `POST /operations/bookings/{reservationId}/decision`                         | Operations confirms or rejects a paid/pending booking.                     | On confirmation discover/assign vehicle #69/#70 and Chauffeur #64/#68.                      |
|  68 | `POST /operations/bookings/{reservationId}/legs/{detailId}/assign-chauffeur` | After selecting an available driver and time range.                        | Chauffeur receives Expo push and sees offer in #39.                                         |
|  69 | `GET /operations/vehicles/available?...`                                     | After confirmation, with class, country, optional city and service window. | Choose physical vehicle; only status `1`, locally mapped and conflict-free vehicles return. |
|  70 | `POST /operations/bookings/{reservationId}/legs/{detailId}/assign-vehicle`   | Confirm selected physical vehicle.                                         | Backend transaction rechecks class/location/time conflicts and records history.             |
|  71 | `POST /operations/change-requests/{requestId}/decision`                      | Review Client/Agent change request.                                        | Approved changes are applied/repriced; collect difference or create refund as needed.       |
|  72 | `POST /operations/cancellation-requests/{requestId}/decision`                | Review cancellation request.                                               | Approved paid cancellation creates Stripe refund; webhook #56 finalizes state.              |
|  73 | `PATCH /operations/expenses/{expenseId}`                                     | Review Chauffeur expense.                                                  | Mark approved, rejected or reimbursed and notify relevant user.                             |
|  74 | `PATCH /operations/incidents/{incidentId}`                                   | Investigate incident.                                                      | Move through review/resolved/closed states with resolution note.                            |
|  75 | `PATCH /operations/vip-requests/{requestId}`                                 | Operations processes manual Airport VIP request.                           | Update request status/note; Client/Agent sees result through #26/notifications.             |
|  76 | `PATCH /operations/concierge-requests/{requestId}`                           | Operations processes Concierge request.                                    | Update request status/note; Client/Agent sees result through #27/notifications.             |

## M. Google authentication and role profiles (APIs 77–81)

|   # | API                        | Caller and exact call timing                                                                                 | Success → next action                                                                              |
| --: | -------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
|  77 | `POST /auth/google`        | Client, Agent, or Chauffeur submits a Google ID token. A new Client also supplies the required phone number. | Store the returned session and call #5. Agent/Chauffeur accounts must already exist and be active. |
|  78 | `GET /agent/profile`       | Agent Profile opens or refreshes.                                                                            | Populate Agent identity, agency, contact, address, and language fields.                            |
|  79 | `PATCH /agent/profile`     | Agent taps Save after editing supported profile fields.                                                      | Replace the local Agent profile cache with the response.                                           |
|  80 | `GET /chauffeur/profile`   | Chauffeur Profile opens or refreshes.                                                                        | Populate Chauffeur identity, location, contact, address, and language fields.                      |
|  81 | `PATCH /chauffeur/profile` | Chauffeur taps Save after editing supported profile fields.                                                  | Replace the local Chauffeur profile cache with the response.                                       |

## N. End-to-end order by application

### Client app

1. Session: #1/#2/#77 → #5; recovery uses #6/#7; background renewal uses #3.
2. Home/profile: #28, #29/#30, #57–#59.
3. Instant booking: #9 → #12 or #10/#11 → #13 → #14 → #15 → #17 → #18 → #19 → Stripe SDK → #53 → #21.
4. Resume/list: #16, #20, #21.
5. Live/completed: #31, #32.
6. Change/cancel: #22/#23, then wait for Operations #71/#72.
7. VIP/Concierge: #24/#25 and history #26/#27.
8. Communication/files: #49–#52 and #60/#61.
9. Exit: #4.

### Agency Agent area

1. Activation/login: #8 → #2/#77 → #5.
2. Dashboard/profile/client: #33, #78/#79 → #34; create #35 or view #36/#37.
3. Booking for selected client: #9–#19 with `customerId`, then #53 and #21.
4. Commissions: #38. Change/cancel/manual requests/communication use the shared APIs.

### Chauffeur app

1. Invitation/login: #8 → #2/#77 → #5.
2. Profile/work: #80/#81 and #39 → #40 → #41 or #42.
3. Active service: repeated #43 and throttled #44.
4. Support records: upload #60, then #45/#46; communication #49–#52.
5. History/documents: #47/#48/#61; notifications #57–#59; logout #4.

### Operations

1. Onboard accounts: #62/#63/#65.
2. Booking queue: #66 → #67.
3. Allocate resources: #69 → #70 and #64 → #68.
4. Requests/reviews: #71–#76.
5. Stripe asynchronously calls #56; Operations does not simulate #54 outside local development.

## O. Frontend integration rules

- Use #3 from one centralized HTTP interceptor and retry only once.
- Generate a stable unique `Idempotency-Key` for each #19 user confirmation.
- Cancel/debounce obsolete #11 and #13 requests when location inputs change.
- Never trust the Stripe SDK callback alone; reconcile through #53 and #56.
- Never expose vehicle statuses `0` or `2–7`; public apps receive class results only.
- Do not store GPS at login. Persist only explicit booking locations and profile
  changes accepted by the user.
- Use backend error `code` for application decisions and `message` for display.
- Use push notifications to prompt refresh; always reload the authoritative
  resource API after a push.
