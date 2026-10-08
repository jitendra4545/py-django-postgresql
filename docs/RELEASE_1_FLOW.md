# Drive Luxury Release 1 flow

## Application boundary

Release 1 serves two mobile applications and the existing back-office:

1. **Client + Agency Agent application**
2. **Chauffeur application**
3. **Existing back-office/operations system**

The term **Agency Agent** means an administrator or member of an agency. It does not mean a rental handover/inspection employee.

## Client booking flow

1. Register or log in.
2. Browse Chauffeur, Transfer, Car Rental, Airport VIP, and Concierge services.
3. For Chauffeur, Transfer, or Car Rental, create a booking draft.
4. Enter passenger data and one or more itinerary legs. Locations include address, building/unit/floor/instructions, map coordinates, country, and city.
5. Choose a vehicle **class** and options. The catalog shows only classes backed by at least one active, online-bookable physical vehicle. With trip dates supplied, existing blocks, reserved dates, and overlapping allocations are also excluded. Internal fleet statuses are never shown.
6. Create an immutable 30-minute quotation. Availability is rechecked before quoting, and tax configuration is interpreted as a percentage over the taxable base.
7. Checkout with an idempotency key. The API writes compatible records, creates agency commissions when applicable, and creates a Stripe PaymentIntent.
8. After payment, operations confirms or rejects the booking.
9. Operations allocates a physical vehicle and assigns a chauffeur per reservation leg.
10. The client receives notifications, tracks assignment status and GPS, chats, and uses masked calling.
11. Changes and cancellations are submitted as requests. On approval, the backend applies and reprices validated changes, recreates commissions, and creates any extra Stripe payment or refund. Cancellation refunds are finalized only by Stripe webhook.
12. Completed bookings expose structured receipt data.

Airport VIP and Concierge use manual-request flows because details and prices require a person to confirm them.

## Agency Agent flow

1. Operations creates/invites the agent under an active agency.
2. The agent activates the account and logs in.
3. The dashboard shows managed clients, active bookings, unread alerts, and backend-generated agency commissions.
4. The agent views only clients explicitly assigned through `app_agent_customer_assignments`.
5. The agent can create a client, view client contact/preferences, and review that client's booking history.
6. The agent creates bookings and manual requests on behalf of managed clients through the same booking engine.
7. The agent follows booking/payment/ride status, receives alerts, communicates, and submits change/cancellation requests.

## Chauffeur flow

1. Operations creates/invites the chauffeur. There is no public chauffeur registration.
2. Operations assigns a chauffeur to one reservation leg after checking schedule overlap.
3. The chauffeur receives an `OFFERED` assignment and acknowledges or declines it.
4. The controlled happy path is:

   `OFFERED → ACKNOWLEDGED → PREPARING → ON_THE_WAY → ARRIVED → WAITING → PASSENGER_ONBOARD → IN_SERVICE → AT_STOP → IN_SERVICE → DROPOFF_REACHED → COMPLETED`

5. `NO_SHOW` and `CANCELLED` branches are supported where operationally valid. Incidents are recorded separately so reporting one does not destroy the current ride state.
6. GPS sharing is accepted only while an assignment is active.
7. The chauffeur can chat/call securely, submit expenses with private receipts, report incidents, and access private documents and history.
8. A reservation becomes completed only when no active legs remain.

## Back-office flow

Operations users can:

- Invite Agency Agents and Chauffeurs.
- Assign an existing client to an Agency Agent.
- Confirm or reject bookings.
- Request the date-filtered physical-vehicle list from `GET /operations/vehicles/available`, then allocate one after the client has chosen a class. Allocation is checked again transactionally.
- Assign Chauffeurs at reservation-leg level with overlap protection.
- Review change and cancellation requests; approval applies validated booking changes in the backend.
- Trigger Stripe refunds; the signed Stripe webhook completes refund-dependent cancellation.
- Review expenses and incidents.

Operational booking decisions and vehicle reassignments are written to the existing
`activity_logs` table. Replaced physical vehicles are written to the existing
`reservation_temp_vehicle_histories` table. The existing `vehicle_blocks`,
`vehicle_reserved_dates`, and `reservation_vehicles` tables drive availability; no
duplicate mobile-only fleet tables are introduced.

## Deferred functionality

The following are intentionally not included in Release 1:

- Rental delivery/return contracts in the mobile app.
- Pickup and return inspection workflows.
- Vehicle-condition photos/video and damage comparison.
- Inspection fuel/mileage/checklists/signatures.
- Conversational or voice booking.
- Predictive rebooking.
- AI itinerary optimization.
- Live AI translation.
- AI-generated receipts.
- AI route optimization and assignment matching.
- Receipt/document OCR.
- Predictive maintenance.

The database's existing rental agreement/inspection tables are left untouched for a later release.
