-- READ ONLY: schema audit for checkout and consolidation 008-010.
-- Run against the SAME database configured as DB_NAME in your backend.
SELECT DATABASE() AS selected_database,VERSION() AS server_version;

SELECT required.table_name, required.column_name,
  CASE WHEN col_current.COLUMN_NAME IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS check_result
FROM (
  SELECT 'services' AS table_name, 'id' AS column_name
 UNION ALL
  SELECT 'services', 'title'
 UNION ALL
  SELECT 'services', 'slug'
 UNION ALL
  SELECT 'services', 'image'
 UNION ALL
  SELECT 'services', 'description_en'
 UNION ALL
  SELECT 'app_booking_drafts', 'id'
 UNION ALL
  SELECT 'app_booking_drafts', 'created_by_user_id'
 UNION ALL
  SELECT 'app_booking_drafts', 'customer_id'
 UNION ALL
  SELECT 'app_booking_drafts', 'service_code'
 UNION ALL
  SELECT 'app_booking_drafts', 'status'
 UNION ALL
  SELECT 'app_booking_drafts', 'details'
 UNION ALL
  SELECT 'app_booking_drafts', 'revision'
 UNION ALL
  SELECT 'app_booking_drafts', 'quote_snapshot_id'
 UNION ALL
  SELECT 'app_booking_drafts', 'reservation_id'
 UNION ALL
  SELECT 'app_booking_drafts', 'expires_at'
 UNION ALL
  SELECT 'app_quote_snapshots', 'id'
 UNION ALL
  SELECT 'app_quote_snapshots', 'draft_id'
 UNION ALL
  SELECT 'app_quote_snapshots', 'draft_revision'
 UNION ALL
  SELECT 'app_quote_snapshots', 'request_hash'
 UNION ALL
  SELECT 'app_quote_snapshots', 'quote_data'
 UNION ALL
  SELECT 'app_quote_snapshots', 'currency'
 UNION ALL
  SELECT 'app_quote_snapshots', 'total_amount'
 UNION ALL
  SELECT 'app_quote_snapshots', 'valid_until'
 UNION ALL
  SELECT 'app_payment_transactions', 'id'
 UNION ALL
  SELECT 'app_payment_transactions', 'reservation_id'
 UNION ALL
  SELECT 'app_payment_transactions', 'user_id'
 UNION ALL
  SELECT 'app_payment_transactions', 'provider'
 UNION ALL
  SELECT 'app_payment_transactions', 'provider_reference'
 UNION ALL
  SELECT 'app_payment_transactions', 'amount'
 UNION ALL
  SELECT 'app_payment_transactions', 'currency'
 UNION ALL
  SELECT 'app_payment_transactions', 'status'
 UNION ALL
  SELECT 'app_payment_transactions', 'idempotency_key'
 UNION ALL
  SELECT 'app_payment_transactions', 'created_at'
 UNION ALL
  SELECT 'app_idempotency_keys', 'id'
 UNION ALL
  SELECT 'app_idempotency_keys', 'user_id'
 UNION ALL
  SELECT 'app_idempotency_keys', 'scope'
 UNION ALL
  SELECT 'app_idempotency_keys', 'idempotency_key'
 UNION ALL
  SELECT 'app_idempotency_keys', 'request_hash'
 UNION ALL
  SELECT 'app_idempotency_keys', 'response_status'
 UNION ALL
  SELECT 'app_idempotency_keys', 'response_body'
 UNION ALL
  SELECT 'app_idempotency_keys', 'expires_at'
 UNION ALL
  SELECT 'vehicles', 'id'
 UNION ALL
  SELECT 'vehicles', 'vehicle_class_id'
 UNION ALL
  SELECT 'vehicles', 'status'
 UNION ALL
  SELECT 'reservation_itineraries', 'id'
 UNION ALL
  SELECT 'reservation_itineraries', 'reservation_id'
 UNION ALL
  SELECT 'reservation_itineraries', 'reservation_details_id'
 UNION ALL
  SELECT 'reservation_costs', 'id'
 UNION ALL
  SELECT 'reservation_costs', 'reservation_id'
 UNION ALL
  SELECT 'reservation_costs', 'reservation_details_id'
 UNION ALL
  SELECT 'reservation_costs', 'base_rate'
 UNION ALL
  SELECT 'reservation_costs', 'total_tax'
 UNION ALL
  SELECT 'reservation_costs', 'total_amount'
 UNION ALL
  SELECT 'reservation_taxes', 'reservation_id'
 UNION ALL
  SELECT 'reservation_taxes', 'reservation_details_id'
 UNION ALL
  SELECT 'reservation_optional_costs', 'reservation_id'
 UNION ALL
  SELECT 'reservation_optional_costs', 'reservation_details_id'
 UNION ALL
  SELECT 'reservation_vehicles', 'reservation_id'
 UNION ALL
  SELECT 'reservation_vehicles', 'reservation_details_id'
 UNION ALL
  SELECT 'reservation_vehicles', 'vehicle_id'
 UNION ALL
  SELECT 'vehicle_reserved_dates', 'reservation_id'
 UNION ALL
  SELECT 'vehicle_reserved_dates', 'reservation_detail_id'
 UNION ALL
  SELECT 'vehicle_reserved_dates', 'vehicle_id'
 UNION ALL
  SELECT 'vehicle_reserved_dates', 'reserved_date'
 UNION ALL
  SELECT 'reservation_insurances', 'reservation_id'
 UNION ALL
  SELECT 'reservation_insurances', 'reservation_details_id'
 UNION ALL
  SELECT 'reservation_insurances', 'vehicle_id'
 UNION ALL
  SELECT 'reservation_service_incidents', 'id'
 UNION ALL
  SELECT 'reservation_service_incidents', 'assignment_id'
 UNION ALL
  SELECT 'reservation_service_incidents', 'reservation_id'
 UNION ALL
  SELECT 'reservation_service_incidents', 'reported_by_user_id'
 UNION ALL
  SELECT 'reservation_service_incidents', 'type'
 UNION ALL
  SELECT 'reservation_service_incidents', 'severity'
 UNION ALL
  SELECT 'reservation_service_incidents', 'description'
 UNION ALL
  SELECT 'reservation_service_incidents', 'latitude'
 UNION ALL
  SELECT 'reservation_service_incidents', 'longitude'
 UNION ALL
  SELECT 'reservation_service_incidents', 'document_ids'
 UNION ALL
  SELECT 'reservation_service_incidents', 'status'
 UNION ALL
  SELECT 'reservation_service_incidents', 'resolution_note'
 UNION ALL
  SELECT 'reservation_service_incidents', 'resolved_by_user_id'
 UNION ALL
  SELECT 'reservation_service_incidents', 'reported_at'
 UNION ALL
  SELECT 'reservation_service_incidents', 'resolved_at'
 UNION ALL
  SELECT 'reservation_service_incidents', 'vehicle_damage_id'
 UNION ALL
  SELECT 'reservation_service_incidents', 'created_at'
 UNION ALL
  SELECT 'reservation_service_incidents', 'updated_at'
 UNION ALL
  SELECT 'app_mobile_assignment_ids', 'id'
 UNION ALL
  SELECT 'app_mobile_status_event_ids', 'id'
 UNION ALL
  SELECT 'app_mobile_expense_ids', 'id'
 UNION ALL
  SELECT 'activity_logs', 'id'
 UNION ALL
  SELECT 'activity_logs', 'subject_type'
 UNION ALL
  SELECT 'activity_logs', 'subject_id'
 UNION ALL
  SELECT 'activity_logs', 'feature_name'
 UNION ALL
  SELECT 'activity_logs', 'features_id'
 UNION ALL
  SELECT 'activity_logs', 'action'
 UNION ALL
  SELECT 'activity_logs', 'description'
 UNION ALL
  SELECT 'activity_logs', 'user_id'
 UNION ALL
  SELECT 'activity_logs', 'created_at'
 UNION ALL
  SELECT 'reservation_driver_statuses', 'id'
 UNION ALL
  SELECT 'reservation_driver_statuses', 'reservation_id'
 UNION ALL
  SELECT 'reservation_driver_statuses', 'reservation_details_id'
 UNION ALL
  SELECT 'reservation_driver_statuses', 'driver_id'
 UNION ALL
  SELECT 'reservation_driver_statuses', 'status'
 UNION ALL
  SELECT 'reservation_driver_statuses', 'note'
 UNION ALL
  SELECT 'reservation_driver_statuses', 'source'
 UNION ALL
  SELECT 'reservation_other_costs', 'id'
 UNION ALL
  SELECT 'reservation_other_costs', 'reservation_id'
 UNION ALL
  SELECT 'reservation_other_costs', 'reservation_details_id'
 UNION ALL
  SELECT 'reservation_other_costs', 'amount'
 UNION ALL
  SELECT 'reservation_other_costs', 'type'
 UNION ALL
  SELECT 'reservation_other_costs', 'user_id'
 UNION ALL
  SELECT 'reservation_details', 'id'
 UNION ALL
  SELECT 'reservation_details', 'reservation_id'
 UNION ALL
  SELECT 'reservation_details', 'pick_up_location'
 UNION ALL
  SELECT 'reservation_details', 'pick_up_date'
 UNION ALL
  SELECT 'reservation_details', 'pick_up_time'
 UNION ALL
  SELECT 'reservation_details', 'status'
 UNION ALL
  SELECT 'reservation_drivers', 'id'
 UNION ALL
  SELECT 'reservation_drivers', 'reservation_id'
 UNION ALL
  SELECT 'reservation_drivers', 'reservation_details_id'
 UNION ALL
  SELECT 'reservation_drivers', 'pick_up_driver_id'
 UNION ALL
  SELECT 'reservation_drivers', 'drop_off_driver_id'
 UNION ALL
  SELECT 'reservations', 'id'
 UNION ALL
  SELECT 'reservations', 'reservation_no'
 UNION ALL
  SELECT 'reservations', 'service_type'
 UNION ALL
  SELECT 'reservations', 'status'
 UNION ALL
  SELECT 'reservations', 'payment_status'
 UNION ALL
  SELECT 'reservations', 'service_code'
 UNION ALL
  SELECT 'reservations', 'source_channel'
 UNION ALL
  SELECT 'reservations', 'created_by_user_id'
 UNION ALL
  SELECT 'reservations', 'created_by_agent_id'
 UNION ALL
  SELECT 'reservations', 'lifecycle_status'
 UNION ALL
  SELECT 'reservations', 'currency_code'
 UNION ALL
  SELECT 'reservations', 'quote_snapshot_id'
 UNION ALL
  SELECT 'reservation_details', 'sequence_no'
 UNION ALL
  SELECT 'reservation_details', 'vehicle_class_id'
 UNION ALL
  SELECT 'reservation_details', 'passenger_count'
 UNION ALL
  SELECT 'reservation_details', 'luggage_count'
 UNION ALL
  SELECT 'reservation_details', 'pickup_details'
 UNION ALL
  SELECT 'reservation_details', 'dropoff_details'
 UNION ALL
  SELECT 'reservation_details', 'flight_number'
 UNION ALL
  SELECT 'reservation_details', 'mobile_leg_status'
 UNION ALL
  SELECT 'reservation_drivers', 'mobile_assignment_id'
 UNION ALL
  SELECT 'reservation_drivers', 'mobile_legacy_reservation_driver_id'
 UNION ALL
  SELECT 'reservation_drivers', 'mobile_driver_id'
 UNION ALL
  SELECT 'reservation_drivers', 'mobile_assignment_status'
 UNION ALL
  SELECT 'reservation_drivers', 'mobile_assignment_role'
 UNION ALL
  SELECT 'reservation_drivers', 'scheduled_start_at'
 UNION ALL
  SELECT 'reservation_drivers', 'scheduled_end_at'
 UNION ALL
  SELECT 'reservation_drivers', 'acknowledged_at'
 UNION ALL
  SELECT 'reservation_drivers', 'declined_at'
 UNION ALL
  SELECT 'reservation_drivers', 'decline_reason'
 UNION ALL
  SELECT 'reservation_drivers', 'started_at'
 UNION ALL
  SELECT 'reservation_drivers', 'completed_at'
 UNION ALL
  SELECT 'reservation_drivers', 'assigned_by_user_id'
 UNION ALL
  SELECT 'activity_logs', 'mobile_event_id'
 UNION ALL
  SELECT 'activity_logs', 'mobile_reservation_details_id'
 UNION ALL
  SELECT 'activity_logs', 'mobile_assignment_id'
 UNION ALL
  SELECT 'activity_logs', 'mobile_event_status'
 UNION ALL
  SELECT 'activity_logs', 'mobile_note'
 UNION ALL
  SELECT 'activity_logs', 'mobile_latitude'
 UNION ALL
  SELECT 'activity_logs', 'mobile_longitude'
 UNION ALL
  SELECT 'activity_logs', 'mobile_occurred_at'
 UNION ALL
  SELECT 'reservation_driver_statuses', 'mobile_event_id'
 UNION ALL
  SELECT 'reservation_driver_statuses', 'mobile_assignment_id'
 UNION ALL
  SELECT 'reservation_other_costs', 'mobile_expense_id'
 UNION ALL
  SELECT 'reservation_other_costs', 'mobile_assignment_id'
 UNION ALL
  SELECT 'reservation_other_costs', 'mobile_driver_id'
 UNION ALL
  SELECT 'reservation_other_costs', 'mobile_category'
 UNION ALL
  SELECT 'reservation_other_costs', 'mobile_expense_amount'
 UNION ALL
  SELECT 'reservation_other_costs', 'mobile_currency'
 UNION ALL
  SELECT 'reservation_other_costs', 'mobile_description'
 UNION ALL
  SELECT 'reservation_other_costs', 'mobile_document_id'
 UNION ALL
  SELECT 'reservation_other_costs', 'mobile_expense_status'
 UNION ALL
  SELECT 'reservation_other_costs', 'mobile_review_note'
 UNION ALL
  SELECT 'reservation_other_costs', 'mobile_incurred_at'
 UNION ALL
  SELECT 'reservation_other_costs', 'mobile_reviewed_by_user_id'
 UNION ALL
  SELECT 'reservation_other_costs', 'mobile_reviewed_at'
) required
LEFT JOIN information_schema.COLUMNS col_current
  ON current.TABLE_SCHEMA=DATABASE() AND col_current.TABLE_NAME=required.table_name AND col_current.COLUMN_NAME=required.column_name
WHERE col_current.COLUMN_NAME IS NULL
ORDER BY required.table_name,required.column_name;

-- Check any missing required index name (the Node preflight checks index shape and uniqueness too).
SELECT req.table_name, req.index_name,
  CASE WHEN st.INDEX_NAME IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS check_result
FROM (
  SELECT 'reservations' AS table_name, 'idx_reservations_mobile_status' AS index_name
 UNION ALL
  SELECT 'reservations', 'idx_reservations_mobile_agent'
 UNION ALL
  SELECT 'reservation_details', 'uq_reservation_details_mobile_sequence'
 UNION ALL
  SELECT 'reservation_drivers', 'uq_res_drivers_mobile_assignment'
 UNION ALL
  SELECT 'reservation_drivers', 'idx_res_drivers_mobile_schedule'
 UNION ALL
  SELECT 'reservation_drivers', 'idx_res_drivers_mobile_reservation'
 UNION ALL
  SELECT 'activity_logs', 'uq_activity_mobile_event'
 UNION ALL
  SELECT 'activity_logs', 'idx_activity_mobile_timeline'
 UNION ALL
  SELECT 'reservation_driver_statuses', 'uq_rds_mobile_event'
 UNION ALL
  SELECT 'reservation_other_costs', 'uq_other_costs_mobile_expense'
 UNION ALL
  SELECT 'reservation_other_costs', 'idx_other_costs_mobile_assignment'
 UNION ALL
  SELECT 'reservation_service_incidents', 'PRIMARY'
 UNION ALL
  SELECT 'reservation_service_incidents', 'idx_rsi_reservation_status'
 UNION ALL
  SELECT 'reservation_service_incidents', 'idx_rsi_assignment'
 UNION ALL
  SELECT 'reservation_service_incidents', 'idx_rsi_vehicle_damage'
 UNION ALL
  SELECT 'app_mobile_assignment_ids', 'PRIMARY'
 UNION ALL
  SELECT 'app_mobile_status_event_ids', 'PRIMARY'
 UNION ALL
  SELECT 'app_mobile_expense_ids', 'PRIMARY'
) req
LEFT JOIN (SELECT DISTINCT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()) st
 ON st.TABLE_NAME=req.table_name AND st.INDEX_NAME=req.index_name
WHERE st.INDEX_NAME IS NULL ORDER BY req.table_name,req.index_name;

-- Confirm app mobile allocators exist and auto-increment.
SELECT t.TABLE_NAME, c.COLUMN_TYPE, c.EXTRA
  FROM information_schema.TABLES t
  LEFT JOIN information_schema.COLUMNS c ON c.TABLE_SCHEMA=t.TABLE_SCHEMA AND c.TABLE_NAME=t.TABLE_NAME AND c.COLUMN_NAME='id'
 WHERE t.TABLE_SCHEMA=DATABASE() AND t.TABLE_NAME IN ('app_mobile_assignment_ids','app_mobile_status_event_ids','app_mobile_expense_ids');
-- Check that the legacy website's numeric reservation status remains intact.
SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservations'
 AND COLUMN_NAME IN ('status','service_type','lifecycle_status','service_code');
