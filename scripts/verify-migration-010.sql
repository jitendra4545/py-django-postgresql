-- READ ONLY. Run after applying migration 010 in MySQL Workbench on staging.
SELECT DATABASE() AS selected_schema;

-- Every legacy mobile row must have been backfilled into a current table.
SELECT 'status events migrated' AS check_name, COUNT(*) AS missing
  FROM app_booking_status_events src
  LEFT JOIN activity_logs dest ON dest.mobile_event_id=src.id
 WHERE dest.id IS NULL
UNION ALL
SELECT 'driver expenses migrated', COUNT(*)
  FROM app_driver_expenses src
  LEFT JOIN reservation_other_costs dest ON dest.mobile_expense_id=src.id
 WHERE dest.id IS NULL
UNION ALL
SELECT 'service incidents migrated', COUNT(*)
  FROM app_incidents src
  LEFT JOIN reservation_service_incidents dest ON dest.id=src.id
 WHERE dest.id IS NULL
UNION ALL
SELECT 'driver status mirror missing', COUNT(*)
  FROM app_booking_status_events src
  LEFT JOIN reservation_driver_statuses dest ON dest.mobile_event_id=src.id
 WHERE src.assignment_id IS NOT NULL AND src.reservation_details_id IS NOT NULL AND dest.id IS NULL
UNION ALL
SELECT 'legacy cost double-charge risk', COUNT(*)
  FROM reservation_other_costs WHERE type='MOBILE_DRIVER_EXPENSE' AND amount<>0
UNION ALL
SELECT 'duplicate mobile status IDs', COUNT(*)
  FROM (SELECT mobile_event_id FROM activity_logs WHERE mobile_event_id IS NOT NULL
         GROUP BY mobile_event_id HAVING COUNT(*)>1) dup
UNION ALL
SELECT 'duplicate mobile expense IDs', COUNT(*)
  FROM (SELECT mobile_expense_id FROM reservation_other_costs WHERE mobile_expense_id IS NOT NULL
         GROUP BY mobile_expense_id HAVING COUNT(*)>1) dup;

-- Confirm data types and original columns. All original website columns remain.
SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE
  FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND (
   (TABLE_NAME='activity_logs' AND COLUMN_NAME IN ('mobile_event_id','mobile_assignment_id','mobile_note','mobile_occurred_at','action','subject_id'))
   OR (TABLE_NAME='reservation_driver_statuses' AND COLUMN_NAME IN ('mobile_event_id','mobile_assignment_id','status','source'))
   OR (TABLE_NAME='reservation_other_costs' AND COLUMN_NAME IN ('mobile_expense_id','mobile_expense_amount','mobile_expense_status','amount','type'))
   OR (TABLE_NAME='reservation_service_incidents' AND COLUMN_NAME IN ('vehicle_damage_id','type','severity','status'))
 ) ORDER BY TABLE_NAME,COLUMN_NAME;

SELECT 'activity_logs' AS business_table,COUNT(*) AS mobile_rows FROM activity_logs
 WHERE feature_name='mobile_booking_status'
UNION ALL SELECT 'reservation_driver_statuses',COUNT(*) FROM reservation_driver_statuses WHERE source='mobile_app'
UNION ALL SELECT 'reservation_other_costs',COUNT(*) FROM reservation_other_costs WHERE type='MOBILE_DRIVER_EXPENSE'
UNION ALL SELECT 'reservation_service_incidents',COUNT(*) FROM reservation_service_incidents;

-- The incident link is only optional; never force an unrelated incident to vehicle damage.
SELECT i.id, i.type, i.status, i.reservation_id, i.vehicle_damage_id
  FROM reservation_service_incidents i ORDER BY i.id DESC LIMIT 10;

-- Spot check the exact public booking event ID and chronological order.
SELECT COALESCE(a.mobile_event_id,a.id) AS id, a.subject_id AS reservation_id,
  a.mobile_reservation_details_id AS reservation_details_id,
  a.mobile_event_status AS status,a.mobile_occurred_at AS occurred_at
 FROM activity_logs a
 WHERE a.feature_name='mobile_booking_status' AND a.subject_type='Reservation'
 ORDER BY a.mobile_occurred_at DESC,a.id DESC LIMIT 20;
