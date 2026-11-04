# Shared client database consolidation - implementation notes

## Scope and contract

Release 2.4.0 implements the eight strongest consolidation candidates from the supplied backend/schema comparison. It does not force unrelated financial, security, membership or infrastructure lifecycles into a vaguely similar client table. This is backend-only. Historical SQL migrations 001-007, OpenAPI, API mount points, request validators and public response-call expressions remain unchanged.

The original client primary keys, column definitions and indexes are not removed, renamed or widened. Namespaced `mobile_*` extension columns and `uq_dl_*` / `idx_dl_*` indexes are added. `notifications.mobile_id` is a **new** secondary indexed AUTO_INCREMENT column; the existing UUID primary key remains the primary key. Child foreign keys belonging to the new app tables are rebound to the new aliases, not silently discarded.

Existing client rows can receive additional metadata. Where a mapped cancelled/declined mobile assignment left the native driver row active, migration marks that native assignment inactive. Missing native assignment schedule components are filled from the verified mobile assignment. Conflicting non-null schedules or ambiguous mappings cause preflight to stop rather than overwrite them. Existing website rows are not recreated under different primary keys.

## Active storage after migration

| Retired active store | Canonical client storage | Read compatibility object |
| --- | --- | --- |
| `app_reservation_meta` | Extension fields on `reservations` | `dl_mobile_reservation_meta` |
| `app_reservation_leg_meta` | Extension fields on `reservation_details`; flight records in `reservation_flight_numbers` | `dl_mobile_reservation_leg_meta` |
| `app_driver_assignments` | `reservation_drivers` | `dl_mobile_driver_assignments` |
| `app_messages` | `reservation_messages`, `reservation_message_recipients`, representable shared attachments in `reservation_message_attachments` | `dl_mobile_messages` |
| `app_notifications` | `notifications` | `dl_mobile_notifications` |
| `app_api_request_logs` | `route_access_logs` | None needed; logger/pruner use the native table |
| `app_vip_requests` | `contacts`, discriminator `AIRPORT_VIP` | `dl_mobile_vip_requests` |
| `app_concierge_requests` | `contacts`, discriminator `CONCIERGE` | `dl_mobile_concierge_requests` |

The seven SQL views are read adapters, not seven new data tables. They are SQL SECURITY INVOKER views. All application writes target base tables; there is no SQL-string-rewriting layer and no reliance on updating a complex view.

## Identifier compatibility

Assignment IDs are mapped to `reservation_drivers.mobile_assignment_id`; message IDs to `reservation_messages.mobile_message_id`. Pre-existing native rows get unique aliases above the old mobile maximum. The native auto-increment range is raised above both native and public maxima. New rows can use their native inserted ID as the public ID without collisions. No legacy primary key is changed.

Notifications retain their UUID IDs, while `mobile_id` preserves old numeric IDs and allocates new numeric IDs. UUIDs for imported mobile notifications are deterministic, so a retry does not create another notification. The mobile envelope `{title, body, data}` is stored in native `notifications.data`. The approved User morph discriminator is applied to both reads and writes, rather than assuming every polymorphic numeric ID is a user ID.

VIP/concierge retain independent public-ID namespaces through `(mobile_request_type,mobile_request_id)`. Thus an old VIP ID 1 and old concierge ID 1 can coexist with a native contact ID 1. Newly created requests use the reserved native auto-increment range. Migration blocks unsafe numeric ranges rather than silently converting API IDs to strings.

GPS, incidents, expenses, status events and push jobs keep their existing public foreign-key values; only their referenced parent aliases are changed.

## Booking and chauffeur consistency

Header/leg projections can read native website bookings without a mandatory app metadata row. Native dates, addresses, customer/agency links and status remain the starting point. A saved mobile lifecycle is used only while its legacy numeric-status snapshot still matches; a website-side numeric status change supersedes a stale mobile lifecycle.

A structured pickup/dropoff JSON payload is reused only while its address/country/city agrees with the native fields. A native address edit causes the view to rebuild a basic payload instead of returning stale GPS coordinates. Full mobile addresses are retained in JSON and itinerary extensions while native 191-character address columns retain a compatible prefix; existing column sizes are not silently changed.

New chauffeur assignment writes create one native assignment row, not parallel native/app assignment rows. A driver-identity snapshot prevents a replacement driver edited in the native row from inheriting the old driver's acknowledgement/progress. Current GPS reads also require the recorded driver to match the current assignment owner. Acknowledge and decline writes lock the native assignment and write their event within the same transaction. Reassignment deactivates the previous native assignment. Availability checks include both native pickup and dropoff driver references, including rows created outside the app. Exact native trip-status slug matches update `reservation_details.trip_status_id` and append `reservation_driver_statuses`; unknown/ambiguous native status IDs are never guessed.

Limit: a native row can represent different pickup and dropoff drivers, while the existing mobile assignment object has a single driver. Both duties block availability, but the mobile row exposes the primary driver. The PHP application must use compatible transactional locking for cross-application scheduling races. No PHP source was supplied and no PHP concurrency behavior was certified.

## Message privacy and files

App conversation IDs, memberships and read cursors remain in the existing app conversation tables. Message bodies move to the native reservation message tables. Native staff-only messages are not exposed to a client/chauffeur/agent merely because they are members of the reservation conversation: the reader must be the sender or an explicit native recipient. Existing mobile-conversation messages keep the existing membership policy. Staff/admin access retains its prior privilege model.

New mobile messages create native recipient records. Mobile read actions also mark the caller's native recipient receipts. Shared Spaces document attachments are mirrored only when their paths fit the original client schema; private/local document access remains through the existing authorized document API. Unlinked native attachments are not automatically made public. Verify the PHP storage-disk mapping against the actual client configuration.

## Diagnostics

The existing bounded audit queue and redaction middleware remain. Redacted entries go into native `route_access_logs`; added fields preserve fractional timing, response metadata and request IDs. The existing user/IP/method/status fields are reused. Migration retains the original actor identifier separately even when a deleted actor cannot satisfy the client's native user FK.

Retention deletes only `mobile_source='MOBILE_API'` entries. Website logs are not pruned by the mobile backend. Old `app_api_request_logs` rows become inactive snapshots, not a live diagnostics source.

## Twenty-seven tables retained intentionally

The following eight conditional candidates are retained in this release:

| Retained table | Reason |
| --- | --- |
| `app_service_catalog` | Mobile service codes/booking modes are not interchangeable with website marketing-service records. |
| `app_booking_status_events` | Mobile event stream includes assignment, actor, location and lifecycle history. Native trip history is also written where appropriate. |
| `app_documents` | Authorized owner/reservation/category/storage/expiry metadata is not identical to a generic media-file inventory. |
| `app_driver_expenses` | Driver reimbursement review is not automatically a customer-billable reservation cost. |
| `app_payment_transactions` | Provider intent/failure/refund lifecycle is distinct from approved reservation accounting payments. |
| `app_password_reset_tokens` | Merging token formats without the PHP password broker could break existing website resets. |
| `app_conversations` | Stable mobile conversation ID and lifecycle. |
| `app_conversation_participants` | Membership and read cursor are different from per-message recipients. |

The remaining nineteen retain their distinct technical/business purposes:

`app_schema_migrations`, `app_refresh_tokens`, `app_user_devices`, `app_account_invitations`, `app_agent_customer_assignments`, `app_user_oauth_accounts`, `app_booking_drafts`, `app_quote_snapshots`, `app_driver_locations`, `app_incidents`, `app_booking_change_requests`, `app_booking_cancellation_requests`, `app_payment_webhook_events`, `app_masked_calls`, `app_idempotency_keys`, `app_push_delivery_jobs`, `app_push_delivery_tickets`, `app_telnyx_call_routes`, `app_telnyx_webhook_events`.

No agent-client relationship is inferred automatically from agency membership. Native-only accounting payments are not assigned invented provider transaction IDs. Website-originated bookings without a mobile pricing snapshot require operations review for repricing.

## Migration and operational safeguards

`008_shared_client_storage.js` exports preflight, resumable copying, explicit field checks, FK rebinding and view construction. Existing migration checksums are validated by the runner. All writers must be stopped; source counts are compared before and after copying, but that comparison is not a replacement for maintenance and cannot detect every concurrent update.

Preflight rejects missing tables, incompatible extension types/lengths, ambiguous notification models, orphan/mismatched relationships, contradictory schedules and unsafe IDs. Copy verification checks source identities and critical fields. Partially applied DDL cannot be rolled back with a SQL transaction; use the full external snapshot and the documented resume/recovery process.

Startup and `db:consolidation:verify` validate the migration checksum, added columns/indexes, view availability, numeric notification allocator and expected child FKs. This is a structural readiness check, not a statement that all production data or API behavior is correct. The transition-time source/copy verifier is not rerun after live writes because the retired source snapshots are intentionally stale.

Optional archiving is rename-only and has a separate explicit execution/maintenance acknowledgement. No original client table is renamed or dropped. No automatic destructive cleanup/down migration is included.

## Known validation boundaries

The supplied SQL contains no data rows. The PHP code, frontend ZIP and running databases/providers were not part of this implementation environment. Actual row conflicts, site-specific service/currency labels, unassigned website vehicle classes, reporting conventions, file-disk conventions and simultaneous writers must be exercised on the restored clone. Do not interpret static response-expression checks as end-to-end frontend verification.
