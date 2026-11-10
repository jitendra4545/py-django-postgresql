# Shared client admin integration

The supplied PHP source provided the reference for native reservations, trip legs, extras, taxes, fleet eligibility and independent rental pickup/dropoff driver tasks. The updated web workspace invokes authenticated Node operations APIs and writes the shared client records. It does not write directly to MySQL from the browser.

| Action | API and shared records |
| --- | --- |
| Reservation board/detail | Existing GET /bookings and /bookings/{id}; native reservations, active legs, costs and assignments |
| Native extras and money | New GET /operations/workspace?view=booking&reservationId=...; reservation_optional_costs, reservation_costs, reservation_payments, reservation_vehicles |
| Dispatch | Existing chauffeur availability and assign-chauffeur; reservation_drivers plus independent app_mobile_assignment_ids roles |
| Vehicle allocation | Existing available/assign-vehicle APIs; canonical checkout eligibility, native allocation/date rows and lock triggers |
| Change/cancellation review | Existing decision APIs and workflow tables |
| Expense/incident review | Existing review APIs; app_driver_expenses and reservation_service_incidents |
| VIP and other inquiries | Existing request/review APIs; contacts with mobile review metadata |
| Directories and queues | New staff-only GET /operations/workspace; selected fields only, pagination for queues/directories |
| Account invitations/customer roster | Existing invitation and agent-customer assignment APIs |

One additive read endpoint was necessary because the earlier API had mutation endpoints without corresponding admin review/directory lists. Its views are summary, queue, directory and booking. The original 96 mobile endpoints and OpenAPI snapshot remain intact; a separate OpenAPI addendum documents this endpoint. Optional detailId/reservationId query fields make staff availability selectors agree with the existing mutation policy while preserving their response shapes.

Corrections in this release: staff availability reconciles native admin assignments before checking driver conflicts; same-reservation driver tasks follow the native overlap policy; vehicle allocation uses the same active/service/location/capacity checks as checkout and excludes its own leg; inactive/ended legs cannot receive another vehicle. Current native task windows and full vehicle reservation dates are returned to the staff UI.

The browser test also found and fixed a partial-change validation defect: wrapping the draft's defaulted options array in optional() inserted an empty array into a notes-only change request. Approving it erased existing extras. The change-request validator now preserves omitted extras and passenger/luggage counts. The real request/decision flow was retested and retained the booked extras and total.

No tables, columns, indexes, triggers or seed rows are added by this frontend/operations release beyond the already supplied 10 November cumulative schema. The bundled cumulative DBA document remains applicable. The new endpoint reads existing records; assignment read-through can reconcile public IDs and status history using existing bridge code.

The original PHP admin remains a separate Laravel application. TEST_UI_NATIVE_ADMIN_URL adds a link to it; PHP login and Node bearer sessions are separate. A full original admin deployment still requires the client's complete repository and dependencies. Native agency, fleet, price-rate and advanced accounting management continue in that admin. Staging must verify its actual write conventions, local-time handling and response to vehicle-lock conflicts.
