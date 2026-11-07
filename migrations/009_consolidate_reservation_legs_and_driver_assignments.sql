-- v2.3 additive consolidation: existing PHP tables remain the authoritative store.
-- Requires migration 008 first. Preserve 001-008 byte-for-byte for checksum safety.
-- Take a verified FULL backup and apply this on a staging database first.
-- MySQL/MariaDB DDL implicitly commits; do not assume transactional rollback.
-- Old app_reservation_leg_meta/app_driver_assignments tables remain as archives.
-- All new fields nullable so existing PHP INSERT/UPDATE statements still work.
-- Do NOT remove/drop the archived tables as part of this migration.

-- The PHP reservation_details.status is numeric (current/history). Mobile
-- lifecycle is stored separately in mobile_leg_status.
SET SESSION group_concat_max_len = 8192;

SET @detail_columns = (
  SELECT GROUP_CONCAT(CONCAT('ADD COLUMN `', d.name, '` ', d.definition)
                      ORDER BY d.position SEPARATOR ', ')
  FROM (
    SELECT 1 position, 'sequence_no' name, 'INT UNSIGNED NULL' definition
    UNION ALL SELECT 2, 'vehicle_class_id', 'INT UNSIGNED NULL'
    UNION ALL SELECT 3, 'passenger_count', 'INT UNSIGNED NULL'
    UNION ALL SELECT 4, 'luggage_count', 'INT UNSIGNED NULL'
    UNION ALL SELECT 5, 'pickup_details', 'JSON NULL'
    UNION ALL SELECT 6, 'dropoff_details', 'JSON NULL'
    UNION ALL SELECT 7, 'flight_number', 'VARCHAR(40) NULL'
    UNION ALL SELECT 8, 'mobile_leg_status', 'VARCHAR(40) NULL'
  ) d
  LEFT JOIN information_schema.COLUMNS c ON c.TABLE_SCHEMA=DATABASE()
    AND c.TABLE_NAME='reservation_details' AND c.COLUMN_NAME=d.name
  WHERE c.COLUMN_NAME IS NULL
);
SET @detail_alter_sql = IF(@detail_columns IS NULL, 'SELECT 1',
                          CONCAT('ALTER TABLE `reservation_details` ', @detail_columns));
PREPARE details_mobile_alter FROM @detail_alter_sql;
EXECUTE details_mobile_alter;
DEALLOCATE PREPARE details_mobile_alter;

SET @detail_index = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservation_details'
    AND INDEX_NAME='uq_reservation_details_mobile_sequence');
SET @detail_index_sql = IF(@detail_index>0, 'SELECT 1',
  'ALTER TABLE `reservation_details` ADD UNIQUE INDEX `uq_reservation_details_mobile_sequence` (`reservation_id`,`sequence_no`)');
PREPARE details_mobile_index FROM @detail_index_sql;
EXECUTE details_mobile_index;
DEALLOCATE PREPARE details_mobile_index;

-- Optionally restore old mobile leg metadata, without overwriting new fields.
SET @legacy_leg_table = (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_reservation_leg_meta'
    AND TABLE_TYPE='BASE TABLE');
SET @leg_backfill_sql = IF(@legacy_leg_table=0, 'SELECT 1',
  'UPDATE reservation_details rd JOIN app_reservation_leg_meta m ON m.reservation_details_id=rd.id AND m.reservation_id=rd.reservation_id SET rd.sequence_no=COALESCE(rd.sequence_no,m.sequence_no),rd.vehicle_class_id=COALESCE(rd.vehicle_class_id,m.vehicle_class_id),rd.passenger_count=COALESCE(rd.passenger_count,m.passenger_count),rd.luggage_count=COALESCE(rd.luggage_count,m.luggage_count),rd.pickup_details=COALESCE(rd.pickup_details,m.pickup_details),rd.dropoff_details=COALESCE(rd.dropoff_details,m.dropoff_details),rd.flight_number=COALESCE(rd.flight_number,m.flight_number),rd.mobile_leg_status=COALESCE(rd.mobile_leg_status,m.status)');
PREPARE leg_mobile_backfill FROM @leg_backfill_sql;
EXECUTE leg_mobile_backfill;
DEALLOCATE PREPARE leg_mobile_backfill;

-- The website stores two independent drivers in one reservation_drivers row.
-- Preserve those original columns, and add optional per-mobile-assignment state.
-- The public mobile ID is NOT reservation_drivers.id: old clients/bookings may
-- already hold app_driver_assignments.id; retaining it avoids breaking links.
SET @driver_columns = (
  SELECT GROUP_CONCAT(CONCAT('ADD COLUMN `', d.name, '` ', d.definition)
                      ORDER BY d.position SEPARATOR ', ')
  FROM (
    SELECT 1 position, 'mobile_assignment_id' name, 'BIGINT UNSIGNED NULL' definition
    UNION ALL SELECT 2, 'mobile_legacy_reservation_driver_id', 'INT UNSIGNED NULL'
    UNION ALL SELECT 3, 'mobile_driver_id', 'INT UNSIGNED NULL'
    UNION ALL SELECT 4, 'mobile_assignment_status', 'VARCHAR(40) NULL'
    UNION ALL SELECT 5, 'mobile_assignment_role', 'VARCHAR(12) NULL'
    UNION ALL SELECT 6, 'scheduled_start_at', 'DATETIME NULL'
    UNION ALL SELECT 7, 'scheduled_end_at', 'DATETIME NULL'
    UNION ALL SELECT 8, 'acknowledged_at', 'TIMESTAMP NULL'
    UNION ALL SELECT 9, 'declined_at', 'TIMESTAMP NULL'
    UNION ALL SELECT 10, 'decline_reason', 'TEXT NULL'
    UNION ALL SELECT 11, 'started_at', 'TIMESTAMP NULL'
    UNION ALL SELECT 12, 'completed_at', 'TIMESTAMP NULL'
    UNION ALL SELECT 13, 'assigned_by_user_id', 'INT UNSIGNED NULL'
  ) d
  LEFT JOIN information_schema.COLUMNS c ON c.TABLE_SCHEMA=DATABASE()
    AND c.TABLE_NAME='reservation_drivers' AND c.COLUMN_NAME=d.name
  WHERE c.COLUMN_NAME IS NULL
);
SET @driver_alter_sql = IF(@driver_columns IS NULL, 'SELECT 1',
                          CONCAT('ALTER TABLE `reservation_drivers` ', @driver_columns));
PREPARE drivers_mobile_alter FROM @driver_alter_sql;
EXECUTE drivers_mobile_alter;
DEALLOCATE PREPARE drivers_mobile_alter;

SET @driver_indexes = (
  SELECT GROUP_CONCAT(CONCAT('ADD ', d.definition) ORDER BY d.position SEPARATOR ', ')
  FROM (
    SELECT 1 position, 'uq_res_drivers_mobile_assignment' name,
           'UNIQUE KEY `uq_res_drivers_mobile_assignment` (`mobile_assignment_id`)' definition
    UNION ALL SELECT 2, 'idx_res_drivers_mobile_schedule',
           'KEY `idx_res_drivers_mobile_schedule` (`mobile_driver_id`,`scheduled_start_at`,`scheduled_end_at`)'
    UNION ALL SELECT 3, 'idx_res_drivers_mobile_reservation',
           'KEY `idx_res_drivers_mobile_reservation` (`reservation_id`,`reservation_details_id`,`mobile_assignment_status`)'
  ) d
  LEFT JOIN information_schema.STATISTICS s ON s.TABLE_SCHEMA=DATABASE()
   AND s.TABLE_NAME='reservation_drivers' AND s.INDEX_NAME=d.name
  WHERE s.INDEX_NAME IS NULL
);
SET @driver_index_sql = IF(@driver_indexes IS NULL, 'SELECT 1',
                          CONCAT('ALTER TABLE `reservation_drivers` ',@driver_indexes));
PREPARE drivers_mobile_indexes FROM @driver_index_sql;
EXECUTE drivers_mobile_indexes;
DEALLOCATE PREPARE drivers_mobile_indexes;

-- An ID-only allocator is needed to preserve all existing public assignment IDs
-- without colliding with unrelated reservation_drivers.id values. It does not
-- duplicate an assignment record or hold any customer/driver information.
CREATE TABLE IF NOT EXISTS `app_mobile_assignment_ids` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @legacy_driver_table = (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_driver_assignments'
    AND TABLE_TYPE='BASE TABLE');
SET @allocator_backfill_sql = IF(@legacy_driver_table=0,'SELECT 1',
  'INSERT IGNORE INTO app_mobile_assignment_ids (id) SELECT id FROM app_driver_assignments');
PREPARE mobile_allocator_backfill FROM @allocator_backfill_sql;
EXECUTE mobile_allocator_backfill;
DEALLOCATE PREPARE mobile_allocator_backfill;

-- First copy one historical mobile assignment onto its EXISTING linked PHP
-- reservation_drivers row. This preserves pick_up_driver_id/drop_off_driver_id
-- exactly, even when different chauffeurs serve each direction.
SET @reuse_driver_sql = IF(@legacy_driver_table=0,'SELECT 1',
  'UPDATE reservation_drivers rd JOIN app_driver_assignments a ON a.legacy_reservation_driver_id=rd.id JOIN (SELECT legacy_reservation_driver_id, MIN(id) AS first_assignment_id FROM app_driver_assignments WHERE legacy_reservation_driver_id IS NOT NULL GROUP BY legacy_reservation_driver_id) selected ON selected.legacy_reservation_driver_id=rd.id AND selected.first_assignment_id=a.id SET rd.mobile_assignment_id=a.id,rd.mobile_legacy_reservation_driver_id=rd.id,rd.mobile_driver_id=a.driver_id,rd.mobile_assignment_status=a.status,rd.mobile_assignment_role=CASE WHEN rd.drop_off_driver_id=a.driver_id AND (rd.pick_up_driver_id IS NULL OR rd.pick_up_driver_id<>a.driver_id) THEN ''DROPOFF'' WHEN rd.pick_up_driver_id=a.driver_id AND rd.drop_off_driver_id=a.driver_id THEN ''BOTH'' ELSE ''PICKUP'' END,rd.scheduled_start_at=a.scheduled_start_at,rd.scheduled_end_at=a.scheduled_end_at,rd.acknowledged_at=a.acknowledged_at,rd.declined_at=a.declined_at,rd.decline_reason=a.decline_reason,rd.started_at=a.started_at,rd.completed_at=a.completed_at,rd.assigned_by_user_id=a.assigned_by_user_id WHERE rd.mobile_assignment_id IS NULL');
PREPARE driver_mobile_reuse FROM @reuse_driver_sql;
EXECUTE driver_mobile_reuse;
DEALLOCATE PREPARE driver_mobile_reuse;

-- If multiple mobile assignments pointed at the same old PHP row, preserve the
-- additional independent assignments on new rows. Inactive numeric website
-- status=2 prevents these extra mobile-only backfill rows from appearing as
-- active website assignments. The original two website driver IDs are intact.
SET @additional_driver_sql = IF(@legacy_driver_table=0,'SELECT 1',
  'INSERT INTO reservation_drivers (reservation_id,reservation_details_id,pick_up_date,pick_up_time,pick_up_driver_id,drop_off_date,drop_off_time,drop_off_driver_id,user_id,status,created_at,updated_at,mobile_assignment_id,mobile_legacy_reservation_driver_id,mobile_driver_id,mobile_assignment_status,mobile_assignment_role,scheduled_start_at,scheduled_end_at,acknowledged_at,declined_at,decline_reason,started_at,completed_at,assigned_by_user_id) SELECT a.reservation_id,a.reservation_details_id,DATE(a.scheduled_start_at),TIME(a.scheduled_start_at),CASE WHEN legacy.drop_off_driver_id=a.driver_id AND (legacy.pick_up_driver_id IS NULL OR legacy.pick_up_driver_id<>a.driver_id) THEN NULL ELSE a.driver_id END,DATE(a.scheduled_end_at),TIME(a.scheduled_end_at),CASE WHEN legacy.drop_off_driver_id=a.driver_id THEN a.driver_id ELSE NULL END,a.assigned_by_user_id,CASE WHEN legacy.id IS NOT NULL THEN 2 ELSE 1 END,COALESCE(a.created_at,NOW()),COALESCE(a.updated_at,NOW()),a.id,a.legacy_reservation_driver_id,a.driver_id,a.status,CASE WHEN legacy.drop_off_driver_id=a.driver_id AND (legacy.pick_up_driver_id IS NULL OR legacy.pick_up_driver_id<>a.driver_id) THEN ''DROPOFF'' WHEN legacy.pick_up_driver_id=a.driver_id AND legacy.drop_off_driver_id=a.driver_id THEN ''BOTH'' ELSE ''PICKUP'' END,a.scheduled_start_at,a.scheduled_end_at,a.acknowledged_at,a.declined_at,a.decline_reason,a.started_at,a.completed_at,a.assigned_by_user_id FROM app_driver_assignments a LEFT JOIN reservation_drivers mapped ON mapped.mobile_assignment_id=a.id LEFT JOIN reservation_drivers legacy ON legacy.id=a.legacy_reservation_driver_id WHERE mapped.id IS NULL');
PREPARE driver_mobile_missing FROM @additional_driver_sql;
EXECUTE driver_mobile_missing;
DEALLOCATE PREPARE driver_mobile_missing;

-- In the original 001 migration these four children FK to the old assignment
-- table. Repoint them to the UNIQUE public ID on reservation_drivers without
-- changing child assignment_id values. Existing tracking/events/expenses and
-- incident IDs therefore remain valid. Do NOT drop those child tables.
SET @event_old_fk = (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_booking_status_events'
   AND COLUMN_NAME='assignment_id' AND REFERENCED_TABLE_NAME='app_driver_assignments' LIMIT 1);
SET @event_repoint_sql = IF(@event_old_fk IS NULL,'SELECT 1',
  CONCAT('ALTER TABLE app_booking_status_events DROP FOREIGN KEY `',REPLACE(@event_old_fk,'`','``'),
         '`, ADD CONSTRAINT fk_mobile_booking_assignment FOREIGN KEY (assignment_id) REFERENCES reservation_drivers (mobile_assignment_id)'));
PREPARE repoint_events FROM @event_repoint_sql;
EXECUTE repoint_events;
DEALLOCATE PREPARE repoint_events;

SET @location_old_fk = (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_driver_locations'
   AND COLUMN_NAME='assignment_id' AND REFERENCED_TABLE_NAME='app_driver_assignments' LIMIT 1);
SET @location_repoint_sql = IF(@location_old_fk IS NULL,'SELECT 1',
  CONCAT('ALTER TABLE app_driver_locations DROP FOREIGN KEY `',REPLACE(@location_old_fk,'`','``'),
         '`, ADD CONSTRAINT fk_mobile_location_assignment FOREIGN KEY (assignment_id) REFERENCES reservation_drivers (mobile_assignment_id) ON DELETE CASCADE'));
PREPARE repoint_locations FROM @location_repoint_sql;
EXECUTE repoint_locations;
DEALLOCATE PREPARE repoint_locations;

SET @expense_old_fk = (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_driver_expenses'
   AND COLUMN_NAME='assignment_id' AND REFERENCED_TABLE_NAME='app_driver_assignments' LIMIT 1);
SET @expense_repoint_sql = IF(@expense_old_fk IS NULL,'SELECT 1',
  CONCAT('ALTER TABLE app_driver_expenses DROP FOREIGN KEY `',REPLACE(@expense_old_fk,'`','``'),
         '`, ADD CONSTRAINT fk_mobile_expense_assignment FOREIGN KEY (assignment_id) REFERENCES reservation_drivers (mobile_assignment_id)'));
PREPARE repoint_expenses FROM @expense_repoint_sql;
EXECUTE repoint_expenses;
DEALLOCATE PREPARE repoint_expenses;

SET @incident_old_fk = (SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_incidents'
   AND COLUMN_NAME='assignment_id' AND REFERENCED_TABLE_NAME='app_driver_assignments' LIMIT 1);
SET @incident_repoint_sql = IF(@incident_old_fk IS NULL,'SELECT 1',
  CONCAT('ALTER TABLE app_incidents DROP FOREIGN KEY `',REPLACE(@incident_old_fk,'`','``'),
         '`, ADD CONSTRAINT fk_mobile_incident_assignment FOREIGN KEY (assignment_id) REFERENCES reservation_drivers (mobile_assignment_id)'));
PREPARE repoint_incidents FROM @incident_repoint_sql;
EXECUTE repoint_incidents;
DEALLOCATE PREPARE repoint_incidents;

-- No destructive SQL: both former app_* tables are deliberately retained.
-- Verify counts, assignments, and FK targets before switching the app.
