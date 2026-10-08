# Database compatibility and Release 1 changes

## Compatibility strategy

The API continues to use the existing `drive_luxury` database as the system of record. It writes core business records into the legacy tables and stores mobile-specific workflow state in additive `app_*` tables.

This release adds **no columns, keys, or constraints to existing legacy tables**. That is deliberate: it avoids locking or changing tables already used by the current website and back-office.

Run `npm run verify:schema` before migration/deployment. It validates the legacy tables and columns required by the API.

## Existing tables used without alteration

| Existing table                       | Release 1 use                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `users`                              | Authentication and legacy role IDs: Admin 1, Staff 2, Chauffeur 3, Agency Agent 4, Client 5 |
| `customers`                          | Client profile and agency relationship                                                      |
| `agents`                             | Agency administrators/members; never rental inspectors                                      |
| `agencies`                           | Agency status and commission percentage                                                     |
| `drivers`                            | Chauffeur profile                                                                           |
| `services`                           | Legacy service linkage (Transfer 7, Chauffeur 8, Car Rental 10 in supplied dump)            |
| `vehicle_classes`                    | Client-facing vehicle-class selection                                                       |
| `vehicles`                           | Physical fleet inventory; only status 1 and online-bookable rows are eligible               |
| `vehicle_class_countries`            | Country eligibility for classes                                                             |
| `vehicle_class_price_rates`          | Configured class prices                                                                     |
| `rental_options`                     | Extras/options                                                                              |
| `tax_surecharges`                    | Percentage tax/surcharge configuration                                                      |
| `reservations`                       | Booking header                                                                              |
| `reservation_details`                | One record per itinerary/service leg                                                        |
| `reservation_itineraries`            | Ordered intermediate/drop-off stops                                                         |
| `reservation_costs`                  | Per-leg price totals                                                                        |
| `reservation_payments`               | Approved legacy payment ledger entry                                                        |
| `reservation_drivers`                | Legacy chauffeur allocation bridge                                                          |
| `reservation_vehicles`               | Physical vehicle allocated by operations                                                    |
| `vehicle_reserved_dates`             | Physical-vehicle calendar block                                                             |
| `vehicle_blocks`                     | Existing maintenance/manual unavailability periods used by availability checks              |
| `vehicle_status_update_logs`         | Existing fleet status history retained for website/back-office compatibility                |
| `reservation_temp_vehicle_histories` | Existing history of replacement vehicles per reservation leg                                |
| `activity_logs`                      | Existing audit log used for operational booking decisions and vehicle changes               |
| `agency_commissions`                 | Backend-generated per-leg agency commissions                                                |

The availability rule is strict: only `vehicles.status = 1` (Available),
`online_booking_status = 1`, and non-deleted vehicles are eligible. Statuses 0 and
2–7 remain internal to the existing fleet system and are never presented as client
or agent choices.

## New tables (29 additive `app_*` tables)

| New table                           | Important keys/fields                                                          | Purpose                                              |
| ----------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `app_schema_migrations`             | Unique `filename`, SHA-256 `checksum`                                          | Prevent changed/replayed migrations                  |
| `app_service_catalog`               | Unique `code`, `legacy_service_id`, `booking_mode`                             | Unified five-service mobile catalog                  |
| `app_refresh_tokens`                | UUID PK, unique `token_hash`, `user_id`, expiry/revocation                     | Rotating login sessions                              |
| `app_user_devices`                  | Unique `device_id`, unique `push_token`, `user_id`                             | One-owner device and push registration               |
| `app_password_reset_tokens`         | Unique `token_hash`, expiry/used timestamps                                    | Password reset lifecycle                             |
| `app_account_invitations`           | Unique `token_hash`, `role`, `user_id`, expiry                                 | Approved Agent/Chauffeur onboarding                  |
| `app_agent_customer_assignments`    | Unique `(agent_id, customer_id)`, `agency_id`, preferences                     | Personal client roster and authorization boundary    |
| `app_booking_drafts`                | Creator/client/agency, `service_code`, JSON `details`, `revision`              | Multi-step booking form state                        |
| `app_quote_snapshots`               | `draft_id`, revision/hash, decimal total, JSON breakdown, expiry               | Immutable checkout price                             |
| `app_reservation_meta`              | Unique `reservation_id`, `service_code`, source, lifecycle, ISO currency       | Mobile extension for a legacy reservation            |
| `app_reservation_leg_meta`          | Unique detail ID and `(reservation_id, sequence_no)`, class, precise locations | Detail-level passenger/location/status data          |
| `app_driver_assignments`            | Driver schedule index, reservation/detail IDs, state/timestamps                | Chauffeur assignment and acknowledgment              |
| `app_booking_status_events`         | Reservation/detail/assignment indexes, status/time/location                    | Append-only tracking timeline                        |
| `app_driver_locations`              | `(assignment_id, recorded_at)` and `(driver_id, recorded_at)` indexes          | Time-series GPS data                                 |
| `app_documents`                     | Owner/reservation indexes, private storage key, MIME/size/expiry               | Protected receipts, licences and service documents   |
| `app_driver_expenses`               | Assignment/reservation/driver, decimal amount, review state                    | Expense submission and reimbursement review          |
| `app_incidents`                     | Reservation/assignment, severity, evidence IDs, resolution                     | Operational and safety incident workflow             |
| `app_booking_change_requests`       | Reservation/status index, prior lifecycle state, JSON changes, resolver        | Safe modifications without direct client mutation    |
| `app_booking_cancellation_requests` | Reservation/status index, prior lifecycle state, refund-pending state          | Approval and refund-aware cancellation               |
| `app_payment_transactions`          | Unique provider reference, decimal amount, ISO currency, refund ref            | Provider-facing payment lifecycle                    |
| `app_payment_webhook_events`        | Unique provider event                                                          | Webhook replay protection                            |
| `app_conversations`                 | Unique `reservation_id`                                                        | One conversation per booking                         |
| `app_conversation_participants`     | Unique `(conversation_id, user_id)`                                            | Authorized Client/Agent/Chauffeur/Support membership |
| `app_messages`                      | Conversation/time index, sender, text/document                                 | Paginated secure messaging                           |
| `app_masked_calls`                  | Reservation, initiator, recipient role, expiry                                 | Temporary call-bridge lifecycle                      |
| `app_notifications`                 | `(user_id, read_at, created_at)` index                                         | In-app/push notification inbox                       |
| `app_idempotency_keys`              | Unique `(user_id, scope, idempotency_key)`                                     | Duplicate checkout protection                        |
| `app_vip_requests`                  | Client/agency, airport/time/flight/status                                      | Manual Airport VIP workflow                          |
| `app_concierge_requests`            | Client/agency, category/text/time/status                                       | Manual concierge workflow                            |

## Financial storage

All new monetary values use `DECIMAL(12,2)` plus a three-letter ISO currency code. Legacy `double` and `€` fields are populated only where required for compatibility.

`tax_surecharges.amount` is confirmed and implemented as a percentage. For example, `5` means **5%**, calculated over the taxable base.

Agency commissions use `agencies.commission` as a percentage. The backend creates one `agency_commissions` record per active reservation leg and recalculates non-custom commission rows after an approved booking change.

## Migration safety

- The migration is additive and does not rename/drop legacy objects.
- Foreign keys are applied for new tables where legacy PK types are compatible.
- Applied migrations are checksum-protected.
- MySQL DDL performs implicit commits; take a backup and run first in staging even though the runner groups statements transactionally.
- The schema migration does not backfill old reservations into `app_reservation_meta`. A separate reviewed backfill is required if old bookings must appear in the new apps.
