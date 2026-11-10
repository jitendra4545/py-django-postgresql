# Cumulative client database changes

Release candidate 10 November 2026. Reported additions are not a verification of the hosted database.

57 of the original 165 tables are reused. There are 26 active additional base tables: 24 new creations and two retained ID tables. Preserve the third reported ID table as retired history. Five views and 14 triggers are separate schema objects.

Compared with the 9 November implementation: one new derived lock table, no further existing-table columns, two native indexes and ten concurrency triggers. The extras feature reuses rental_options, rental_option_classes, reservation_optional_costs, reservation_costs and reservation_taxes.

## Remaining 35 columns if the reported 51 exist

| Table | Column | SQL type |
| --- | --- | --- |
| reservation_messages | mobile_message_id | BIGINT UNSIGNED NULL |
| reservation_messages | mobile_document_id | BIGINT UNSIGNED NULL |
| notifications | mobile_notification_id | BIGINT UNSIGNED NOT NULL AUTO_INCREMENT |
| file_managers | mobile_document_id | BIGINT UNSIGNED NULL |
| file_managers | mobile_category | VARCHAR(50) NULL |
| file_managers | mobile_expires_at | DATE NULL |
| file_managers | mobile_visibility | VARCHAR(10) NULL |
| file_managers | mobile_original_name | VARCHAR(255) NULL |
| file_managers | mobile_media_file_id | BIGINT UNSIGNED NULL |
| reservation_files | mobile_file_manager_id | BIGINT UNSIGNED NULL |
| customer_files | mobile_file_manager_id | BIGINT UNSIGNED NULL |
| driver_files | mobile_file_manager_id | BIGINT UNSIGNED NULL |
| contacts | mobile_request_id | BIGINT UNSIGNED NULL |
| contacts | mobile_request_kind | VARCHAR(20) NULL |
| contacts | mobile_customer_id | INT UNSIGNED NULL |
| contacts | mobile_agency_id | INT UNSIGNED NULL |
| contacts | mobile_created_by_user_id | INT UNSIGNED NULL |
| contacts | mobile_request_status | VARCHAR(30) NULL |
| contacts | mobile_operations_note | TEXT NULL |
| password_resets | mobile_token_hash | CHAR(64) NULL |
| app_mobile_assignment_ids | reservation_driver_id | INT UNSIGNED NULL |
| app_mobile_assignment_ids | assignment_role | VARCHAR(12) NULL |
| app_mobile_assignment_ids | driver_id | INT UNSIGNED NULL |
| app_mobile_assignment_ids | assignment_status | VARCHAR(40) NULL |
| app_mobile_assignment_ids | current_slot | TINYINT UNSIGNED NULL |
| app_mobile_assignment_ids | scheduled_start_at | DATETIME NULL |
| app_mobile_assignment_ids | scheduled_end_at | DATETIME NULL |
| app_mobile_assignment_ids | acknowledged_at | TIMESTAMP NULL |
| app_mobile_assignment_ids | declined_at | TIMESTAMP NULL |
| app_mobile_assignment_ids | decline_reason | TEXT NULL |
| app_mobile_assignment_ids | started_at | TIMESTAMP NULL |
| app_mobile_assignment_ids | completed_at | TIMESTAMP NULL |
| app_mobile_assignment_ids | assigned_by_user_id | INT UNSIGNED NULL |
| app_mobile_assignment_ids | created_at | TIMESTAMP NULL |
| app_mobile_assignment_ids | updated_at | TIMESTAMP NULL |

## Remaining 18 indexes on existing tables

| Table | Index | Columns in order |
| --- | --- | --- |
| reservations | idx_reservations_lifecycle_service_type | lifecycle_status, service_type |
| reservation_messages | UNIQUE uq_reservation_messages_mobile_id | mobile_message_id |
| reservation_messages | idx_reservation_messages_mobile_document | mobile_document_id |
| notifications | UNIQUE uq_notifications_mobile_id | mobile_notification_id |
| file_managers | UNIQUE uq_file_managers_mobile_document | mobile_document_id |
| file_managers | idx_file_managers_mobile_owner_category | created_by, mobile_category |
| contacts | UNIQUE uq_contacts_mobile_request | mobile_request_kind, mobile_request_id |
| contacts | idx_contacts_mobile_customer | mobile_customer_id, mobile_request_kind, mobile_request_status |
| contacts | idx_contacts_mobile_agency | mobile_agency_id, mobile_request_kind, mobile_request_status |
| password_resets | UNIQUE uq_password_resets_mobile_hash | mobile_token_hash |
| reservation_files | idx_reservation_files_mobile_manager | mobile_file_manager_id |
| customer_files | idx_customer_files_mobile_manager | mobile_file_manager_id |
| driver_files | idx_driver_files_mobile_manager | mobile_file_manager_id |
| vehicle_reserved_dates | idx_mobile_vehicle_reserved_date | vehicle_id, reserved_date, reservation_id |
| reservation_vehicles | idx_mobile_reservation_vehicle_window | vehicle_id, status, pick_up_date, drop_off_date |
| app_mobile_assignment_ids | UNIQUE uq_app_mobile_assignment_current_role | reservation_driver_id, assignment_role, current_slot |
| app_mobile_assignment_ids | idx_app_mobile_assignment_driver_schedule | driver_id, scheduled_start_at, scheduled_end_at |
| app_mobile_assignment_ids | idx_app_mobile_assignment_row_role_history | reservation_driver_id, assignment_role, id |

## Additional table definitions

All 26 active table definitions and their internal primary keys, foreign keys and indexes appear in client-target-tables.sql. That file is a reference; use the guarded upgrade runner for the full upgrade. The lock table has seven columns and two secondary indexes, counted within new-table DDL, not the 35 columns or 18 indexes above.

## Views and triggers

- View: app_notifications
- View: app_messages
- View: app_documents
- View: app_vip_requests
- View: app_concierge_requests
- Trigger: dl_mobile_res_insert
- Trigger: dl_mobile_res_update
- Trigger: dl_mobile_leg_insert
- Trigger: dl_mobile_leg_update
- Trigger: dl_mobile_lock_rv_insert
- Trigger: dl_mobile_lock_rv_update
- Trigger: dl_mobile_lock_rv_delete
- Trigger: dl_mobile_lock_date_insert
- Trigger: dl_mobile_lock_date_update
- Trigger: dl_mobile_lock_date_delete
- Trigger: dl_mobile_lock_block_insert
- Trigger: dl_mobile_lock_block_update
- Trigger: dl_mobile_lock_block_delete
- Trigger: dl_mobile_lock_parent_update

## Conditional seed and repair operations

Missing detailed driver statuses use type=driver_status, driver_status=1, sort_order=0, status=1. Slugs: assigned, offered, acknowledged, preparing, on_the_way, arrived, waiting, passenger_onboard, in_service, at_stop, dropoff_reached, completed, no_show, cancelled. IDs are preserved.

Native trip statuses use type=trip_status, driver_status=0, sort_order=0, status=1. Slugs: confirmed, completed, no_show_chargeable, cancelled_chargeable. If confirmed/completed is occupied by a driver status, create confirmed_trip/completed_trip instead. A chargeable slug with an incompatible type stops the upgrade for DBA review.

LEGACY_USER_MODEL defaults to App\User, matching the supplied PHP source. Old mobile notifications stamped with the previous default App\Models\User are repaired to the configured class. No user account or credential is seeded by the upgrade.

Compatibility fields, public IDs, assignments and expense history are backfilled with collision checks. The technical occupancy claims are rebuilt from current/future native records; original source records are retained. Conflicting future allocations stop the upgrade.

## Apply and verify

Stop PHP and Node writers during the upgrade and take a verified backup. MySQL DDL is not transactional. Use npm run db:client:plan, then npm run db:client:upgrade and npm run db:client:verify. The runner recreates its 14 owned triggers and five views; it preserves client triggers. Rerun after correcting a reported mismatch. Do not replay migrations 001 through 010.

All exact reported and proposed objects are in client-schema.json. See docs/PRODUCTION_RELEASE_GUIDE.md and the cumulative DBA document for deployment acceptance and limits.
