-- DRIVE LUXURY - ADDITIVE REPAIR OF CONSOLIDATED MOBILE STORAGE (008-010)
-- Review and execute ONLY on a verified BACKED-UP STAGING copy in MySQL Workbench.
-- Stops when original website tables or historical assignment mappings are missing.
-- Run during a maintenance window with all PHP / Node booking writes paused.
-- This is a manual repair, NOT a numbered migration: never add it to app_schema_migrations.
-- No original PHP website columns or keys are renamed or dropped.
-- The original migrations 001-010 must be reconciled separately in the checksum ledger.
-- Do not run 'npm run migrate' blindly on an imported client DB with an incomplete ledger.
-- DDL implicitly commits in MariaDB: a failed step may leave earlier steps applied.
-- Idempotent structure steps detect already-existing columns/indexes, but a backup is REQUIRED.
SELECT DATABASE() AS selected_database, VERSION() AS database_version;
SET SESSION group_concat_max_len = 65535;

-- Abort early if a required legacy or mobile-foundation table is absent.
SET @missing_base = (
  SELECT GROUP_CONCAT(req.name ORDER BY req.name SEPARATOR ', ')
  FROM (SELECT 'services' AS name UNION ALL SELECT 'reservations' AS name UNION ALL SELECT 'reservation_details' AS name UNION ALL SELECT 'reservation_drivers' AS name UNION ALL SELECT 'activity_logs' AS name UNION ALL SELECT 'reservation_driver_statuses' AS name UNION ALL SELECT 'reservation_other_costs' AS name UNION ALL SELECT 'users' AS name UNION ALL SELECT 'drivers' AS name UNION ALL SELECT 'reservation_vehicle_damages' AS name UNION ALL SELECT 'app_booking_drafts' AS name UNION ALL SELECT 'app_quote_snapshots' AS name UNION ALL SELECT 'app_payment_transactions' AS name UNION ALL SELECT 'app_idempotency_keys' AS name) req
  LEFT JOIN information_schema.TABLES existing
    ON existing.TABLE_SCHEMA=DATABASE() AND existing.TABLE_NAME=req.name AND existing.TABLE_TYPE='BASE TABLE'
  WHERE existing.TABLE_NAME IS NULL
);
SELECT IFNULL(@missing_base,'NONE') AS missing_required_base_tables;
SET @guard_sql=IF(@missing_base IS NULL,'SELECT 1',
 'SELECT 1 FROM `STOP_MISSING_BASE_TABLES_APPLY_FOUNDATION_FIRST`');
PREPARE guard_base FROM @guard_sql;
EXECUTE guard_base;
DEALLOCATE PREPARE guard_base;

-- Add any missing reservations columns (from migrations 008-010).
SET @pending_columns=(
  SELECT GROUP_CONCAT(CONCAT('ADD COLUMN `',defs.name,'` ',defs.definition)
                      ORDER BY defs.ord SEPARATOR ', ')
  FROM (SELECT 1 AS ord,'service_code' AS name,'VARCHAR(40) NULL' AS definition
   UNION ALL SELECT 2,'source_channel','VARCHAR(30) NULL'
   UNION ALL SELECT 3,'created_by_user_id','INT UNSIGNED NULL'
   UNION ALL SELECT 4,'created_by_agent_id','INT UNSIGNED NULL'
   UNION ALL SELECT 5,'lifecycle_status','VARCHAR(40) NULL'
   UNION ALL SELECT 6,'currency_code','CHAR(3) NULL'
   UNION ALL SELECT 7,'quote_snapshot_id','BIGINT UNSIGNED NULL') defs
  LEFT JOIN information_schema.COLUMNS col_current
    ON current.TABLE_SCHEMA=DATABASE() AND col_current.TABLE_NAME='reservations' AND col_current.COLUMN_NAME=defs.name
  WHERE col_current.COLUMN_NAME IS NULL
);
SET @repair_sql=IF(@pending_columns IS NULL,'SELECT 1',
  CONCAT('ALTER TABLE `reservations` ',@pending_columns));
PREPARE repair_columns FROM @repair_sql;
EXECUTE repair_columns;
DEALLOCATE PREPARE repair_columns;

-- Add any missing reservation_details columns (from migrations 008-010).
SET @pending_columns=(
  SELECT GROUP_CONCAT(CONCAT('ADD COLUMN `',defs.name,'` ',defs.definition)
                      ORDER BY defs.ord SEPARATOR ', ')
  FROM (SELECT 1 AS ord,'sequence_no' AS name,'INT UNSIGNED NULL' AS definition
   UNION ALL SELECT 2,'vehicle_class_id','INT UNSIGNED NULL'
   UNION ALL SELECT 3,'passenger_count','INT UNSIGNED NULL'
   UNION ALL SELECT 4,'luggage_count','INT UNSIGNED NULL'
   UNION ALL SELECT 5,'pickup_details','JSON NULL'
   UNION ALL SELECT 6,'dropoff_details','JSON NULL'
   UNION ALL SELECT 7,'flight_number','VARCHAR(40) NULL'
   UNION ALL SELECT 8,'mobile_leg_status','VARCHAR(40) NULL') defs
  LEFT JOIN information_schema.COLUMNS col_current
    ON current.TABLE_SCHEMA=DATABASE() AND col_current.TABLE_NAME='reservation_details' AND col_current.COLUMN_NAME=defs.name
  WHERE col_current.COLUMN_NAME IS NULL
);
SET @repair_sql=IF(@pending_columns IS NULL,'SELECT 1',
  CONCAT('ALTER TABLE `reservation_details` ',@pending_columns));
PREPARE repair_columns FROM @repair_sql;
EXECUTE repair_columns;
DEALLOCATE PREPARE repair_columns;

-- Add any missing reservation_drivers columns (from migrations 008-010).
SET @pending_columns=(
  SELECT GROUP_CONCAT(CONCAT('ADD COLUMN `',defs.name,'` ',defs.definition)
                      ORDER BY defs.ord SEPARATOR ', ')
  FROM (SELECT 1 AS ord,'mobile_assignment_id' AS name,'BIGINT UNSIGNED NULL' AS definition
   UNION ALL SELECT 2,'mobile_legacy_reservation_driver_id','INT UNSIGNED NULL'
   UNION ALL SELECT 3,'mobile_driver_id','INT UNSIGNED NULL'
   UNION ALL SELECT 4,'mobile_assignment_status','VARCHAR(40) NULL'
   UNION ALL SELECT 5,'mobile_assignment_role','VARCHAR(12) NULL'
   UNION ALL SELECT 6,'scheduled_start_at','DATETIME NULL'
   UNION ALL SELECT 7,'scheduled_end_at','DATETIME NULL'
   UNION ALL SELECT 8,'acknowledged_at','TIMESTAMP NULL'
   UNION ALL SELECT 9,'declined_at','TIMESTAMP NULL'
   UNION ALL SELECT 10,'decline_reason','TEXT NULL'
   UNION ALL SELECT 11,'started_at','TIMESTAMP NULL'
   UNION ALL SELECT 12,'completed_at','TIMESTAMP NULL'
   UNION ALL SELECT 13,'assigned_by_user_id','INT UNSIGNED NULL') defs
  LEFT JOIN information_schema.COLUMNS col_current
    ON current.TABLE_SCHEMA=DATABASE() AND col_current.TABLE_NAME='reservation_drivers' AND col_current.COLUMN_NAME=defs.name
  WHERE col_current.COLUMN_NAME IS NULL
);
SET @repair_sql=IF(@pending_columns IS NULL,'SELECT 1',
  CONCAT('ALTER TABLE `reservation_drivers` ',@pending_columns));
PREPARE repair_columns FROM @repair_sql;
EXECUTE repair_columns;
DEALLOCATE PREPARE repair_columns;

-- Add any missing activity_logs columns (from migrations 008-010).
SET @pending_columns=(
  SELECT GROUP_CONCAT(CONCAT('ADD COLUMN `',defs.name,'` ',defs.definition)
                      ORDER BY defs.ord SEPARATOR ', ')
  FROM (SELECT 1 AS ord,'mobile_event_id' AS name,'BIGINT UNSIGNED NULL' AS definition
   UNION ALL SELECT 2,'mobile_reservation_details_id','INT UNSIGNED NULL'
   UNION ALL SELECT 3,'mobile_assignment_id','BIGINT UNSIGNED NULL'
   UNION ALL SELECT 4,'mobile_event_status','VARCHAR(40) NULL'
   UNION ALL SELECT 5,'mobile_note','TEXT NULL'
   UNION ALL SELECT 6,'mobile_latitude','DECIMAL(10,7) NULL'
   UNION ALL SELECT 7,'mobile_longitude','DECIMAL(10,7) NULL'
   UNION ALL SELECT 8,'mobile_occurred_at','DATETIME NULL') defs
  LEFT JOIN information_schema.COLUMNS col_current
    ON current.TABLE_SCHEMA=DATABASE() AND col_current.TABLE_NAME='activity_logs' AND col_current.COLUMN_NAME=defs.name
  WHERE col_current.COLUMN_NAME IS NULL
);
SET @repair_sql=IF(@pending_columns IS NULL,'SELECT 1',
  CONCAT('ALTER TABLE `activity_logs` ',@pending_columns));
PREPARE repair_columns FROM @repair_sql;
EXECUTE repair_columns;
DEALLOCATE PREPARE repair_columns;

-- Add any missing reservation_driver_statuses columns (from migrations 008-010).
SET @pending_columns=(
  SELECT GROUP_CONCAT(CONCAT('ADD COLUMN `',defs.name,'` ',defs.definition)
                      ORDER BY defs.ord SEPARATOR ', ')
  FROM (SELECT 1 AS ord,'mobile_event_id' AS name,'BIGINT UNSIGNED NULL' AS definition
   UNION ALL SELECT 2,'mobile_assignment_id','BIGINT UNSIGNED NULL') defs
  LEFT JOIN information_schema.COLUMNS col_current
    ON current.TABLE_SCHEMA=DATABASE() AND col_current.TABLE_NAME='reservation_driver_statuses' AND col_current.COLUMN_NAME=defs.name
  WHERE col_current.COLUMN_NAME IS NULL
);
SET @repair_sql=IF(@pending_columns IS NULL,'SELECT 1',
  CONCAT('ALTER TABLE `reservation_driver_statuses` ',@pending_columns));
PREPARE repair_columns FROM @repair_sql;
EXECUTE repair_columns;
DEALLOCATE PREPARE repair_columns;

-- Add any missing reservation_other_costs columns (from migrations 008-010).
SET @pending_columns=(
  SELECT GROUP_CONCAT(CONCAT('ADD COLUMN `',defs.name,'` ',defs.definition)
                      ORDER BY defs.ord SEPARATOR ', ')
  FROM (SELECT 1 AS ord,'mobile_expense_id' AS name,'BIGINT UNSIGNED NULL' AS definition
   UNION ALL SELECT 2,'mobile_assignment_id','BIGINT UNSIGNED NULL'
   UNION ALL SELECT 3,'mobile_driver_id','INT UNSIGNED NULL'
   UNION ALL SELECT 4,'mobile_category','VARCHAR(40) NULL'
   UNION ALL SELECT 5,'mobile_expense_amount','DECIMAL(12,2) NULL'
   UNION ALL SELECT 6,'mobile_currency','CHAR(3) NULL'
   UNION ALL SELECT 7,'mobile_description','TEXT NULL'
   UNION ALL SELECT 8,'mobile_document_id','BIGINT UNSIGNED NULL'
   UNION ALL SELECT 9,'mobile_expense_status','VARCHAR(30) NULL'
   UNION ALL SELECT 10,'mobile_review_note','TEXT NULL'
   UNION ALL SELECT 11,'mobile_incurred_at','DATETIME NULL'
   UNION ALL SELECT 12,'mobile_reviewed_by_user_id','INT UNSIGNED NULL'
   UNION ALL SELECT 13,'mobile_reviewed_at','TIMESTAMP NULL') defs
  LEFT JOIN information_schema.COLUMNS col_current
    ON current.TABLE_SCHEMA=DATABASE() AND col_current.TABLE_NAME='reservation_other_costs' AND col_current.COLUMN_NAME=defs.name
  WHERE col_current.COLUMN_NAME IS NULL
);
SET @repair_sql=IF(@pending_columns IS NULL,'SELECT 1',
  CONCAT('ALTER TABLE `reservation_other_costs` ',@pending_columns));
PREPARE repair_columns FROM @repair_sql;
EXECUTE repair_columns;
DEALLOCATE PREPARE repair_columns;

CREATE TABLE IF NOT EXISTS `app_mobile_assignment_ids` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `app_mobile_status_event_ids` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `app_mobile_expense_ids` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add required index only when its name does not already exist; the preflight verifies shape and uniqueness.
SET @pending_indexes=(
  SELECT GROUP_CONCAT(defs.definition ORDER BY defs.ord SEPARATOR ', ')
  FROM (SELECT 1 AS ord,'idx_reservations_mobile_status' AS name,'ADD INDEX `idx_reservations_mobile_status` (`lifecycle_status`,`service_code`)' AS definition
    UNION ALL SELECT 2,'idx_reservations_mobile_agent','ADD INDEX `idx_reservations_mobile_agent` (`created_by_agent_id`)') defs
  LEFT JOIN (SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservations') idx
    ON idx.INDEX_NAME=defs.name
  WHERE idx.INDEX_NAME IS NULL
);
SET @repair_sql=IF(@pending_indexes IS NULL,'SELECT 1',CONCAT('ALTER TABLE `reservations` ',@pending_indexes));
PREPARE repair_index FROM @repair_sql;
EXECUTE repair_index;
DEALLOCATE PREPARE repair_index;

-- Add required index only when its name does not already exist; the preflight verifies shape and uniqueness.
SET @pending_indexes=(
  SELECT GROUP_CONCAT(defs.definition ORDER BY defs.ord SEPARATOR ', ')
  FROM (SELECT 1 AS ord,'uq_reservation_details_mobile_sequence' AS name,'ADD UNIQUE INDEX `uq_reservation_details_mobile_sequence` (`reservation_id`,`sequence_no`)' AS definition) defs
  LEFT JOIN (SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservation_details') idx
    ON idx.INDEX_NAME=defs.name
  WHERE idx.INDEX_NAME IS NULL
);
SET @repair_sql=IF(@pending_indexes IS NULL,'SELECT 1',CONCAT('ALTER TABLE `reservation_details` ',@pending_indexes));
PREPARE repair_index FROM @repair_sql;
EXECUTE repair_index;
DEALLOCATE PREPARE repair_index;

-- Add required index only when its name does not already exist; the preflight verifies shape and uniqueness.
SET @pending_indexes=(
  SELECT GROUP_CONCAT(defs.definition ORDER BY defs.ord SEPARATOR ', ')
  FROM (SELECT 1 AS ord,'uq_res_drivers_mobile_assignment' AS name,'ADD UNIQUE INDEX `uq_res_drivers_mobile_assignment` (`mobile_assignment_id`)' AS definition
    UNION ALL SELECT 2,'idx_res_drivers_mobile_schedule','ADD INDEX `idx_res_drivers_mobile_schedule` (`mobile_driver_id`,`scheduled_start_at`,`scheduled_end_at`)'
    UNION ALL SELECT 3,'idx_res_drivers_mobile_reservation','ADD INDEX `idx_res_drivers_mobile_reservation` (`reservation_id`,`reservation_details_id`,`mobile_assignment_status`)') defs
  LEFT JOIN (SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservation_drivers') idx
    ON idx.INDEX_NAME=defs.name
  WHERE idx.INDEX_NAME IS NULL
);
SET @repair_sql=IF(@pending_indexes IS NULL,'SELECT 1',CONCAT('ALTER TABLE `reservation_drivers` ',@pending_indexes));
PREPARE repair_index FROM @repair_sql;
EXECUTE repair_index;
DEALLOCATE PREPARE repair_index;

-- Add required index only when its name does not already exist; the preflight verifies shape and uniqueness.
SET @pending_indexes=(
  SELECT GROUP_CONCAT(defs.definition ORDER BY defs.ord SEPARATOR ', ')
  FROM (SELECT 1 AS ord,'uq_activity_mobile_event' AS name,'ADD UNIQUE INDEX `uq_activity_mobile_event` (`mobile_event_id`)' AS definition
    UNION ALL SELECT 2,'idx_activity_mobile_timeline','ADD INDEX `idx_activity_mobile_timeline` (`subject_type`,`subject_id`,`feature_name`,`mobile_occurred_at`)') defs
  LEFT JOIN (SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='activity_logs') idx
    ON idx.INDEX_NAME=defs.name
  WHERE idx.INDEX_NAME IS NULL
);
SET @repair_sql=IF(@pending_indexes IS NULL,'SELECT 1',CONCAT('ALTER TABLE `activity_logs` ',@pending_indexes));
PREPARE repair_index FROM @repair_sql;
EXECUTE repair_index;
DEALLOCATE PREPARE repair_index;

-- Add required index only when its name does not already exist; the preflight verifies shape and uniqueness.
SET @pending_indexes=(
  SELECT GROUP_CONCAT(defs.definition ORDER BY defs.ord SEPARATOR ', ')
  FROM (SELECT 1 AS ord,'uq_rds_mobile_event' AS name,'ADD UNIQUE INDEX `uq_rds_mobile_event` (`mobile_event_id`)' AS definition) defs
  LEFT JOIN (SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservation_driver_statuses') idx
    ON idx.INDEX_NAME=defs.name
  WHERE idx.INDEX_NAME IS NULL
);
SET @repair_sql=IF(@pending_indexes IS NULL,'SELECT 1',CONCAT('ALTER TABLE `reservation_driver_statuses` ',@pending_indexes));
PREPARE repair_index FROM @repair_sql;
EXECUTE repair_index;
DEALLOCATE PREPARE repair_index;

-- Add required index only when its name does not already exist; the preflight verifies shape and uniqueness.
SET @pending_indexes=(
  SELECT GROUP_CONCAT(defs.definition ORDER BY defs.ord SEPARATOR ', ')
  FROM (SELECT 1 AS ord,'uq_other_costs_mobile_expense' AS name,'ADD UNIQUE INDEX `uq_other_costs_mobile_expense` (`mobile_expense_id`)' AS definition
    UNION ALL SELECT 2,'idx_other_costs_mobile_assignment','ADD INDEX `idx_other_costs_mobile_assignment` (`mobile_assignment_id`,`mobile_expense_status`)') defs
  LEFT JOIN (SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservation_other_costs') idx
    ON idx.INDEX_NAME=defs.name
  WHERE idx.INDEX_NAME IS NULL
);
SET @repair_sql=IF(@pending_indexes IS NULL,'SELECT 1',CONCAT('ALTER TABLE `reservation_other_costs` ',@pending_indexes));
PREPARE repair_index FROM @repair_sql;
EXECUTE repair_index;
DEALLOCATE PREPARE repair_index;

-- This incident table is intentionally separate from website vehicle-damage inspections.
CREATE TABLE IF NOT EXISTS reservation_service_incidents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id BIGINT UNSIGNED NULL,
  reservation_id INT UNSIGNED NOT NULL,
  reported_by_user_id INT UNSIGNED NOT NULL,
  type VARCHAR(40) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  description TEXT NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  document_ids JSON NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  resolution_note TEXT NULL,
  resolved_by_user_id INT UNSIGNED NULL,
  reported_at DATETIME NOT NULL,
  resolved_at TIMESTAMP NULL,
  vehicle_damage_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_rsi_reservation_status (reservation_id,status),
  KEY idx_rsi_assignment (assignment_id),
  KEY idx_rsi_vehicle_damage (vehicle_damage_id),
  CONSTRAINT fk_rsi_assignment FOREIGN KEY (assignment_id)
    REFERENCES reservation_drivers (mobile_assignment_id),
  CONSTRAINT fk_rsi_reservation FOREIGN KEY (reservation_id)
    REFERENCES reservations (id),
  CONSTRAINT fk_rsi_reporter FOREIGN KEY (reported_by_user_id)
    REFERENCES users (id),
  CONSTRAINT fk_rsi_resolver FOREIGN KEY (resolved_by_user_id)
    REFERENCES users (id),
  CONSTRAINT fk_rsi_damage FOREIGN KEY (vehicle_damage_id)
    REFERENCES reservation_vehicle_damages (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- If an incident table already existed partially, repair only absent fields, without rewriting populated rows.
SET @pending_incident_columns=(
  SELECT GROUP_CONCAT(CONCAT('ADD COLUMN `',d.name,'` ',d.definition) ORDER BY d.ord SEPARATOR ', ')
  FROM (SELECT 1 ord,'assignment_id' name,'BIGINT UNSIGNED NULL' definition
    UNION ALL SELECT 2,'reservation_id','INT UNSIGNED NULL'
    UNION ALL SELECT 3,'reported_by_user_id','INT UNSIGNED NULL'
    UNION ALL SELECT 4,'type','VARCHAR(40) NULL'
    UNION ALL SELECT 5,'severity','VARCHAR(20) NULL'
    UNION ALL SELECT 6,'description','TEXT NULL'
    UNION ALL SELECT 7,'latitude','DECIMAL(10,7) NULL'
    UNION ALL SELECT 8,'longitude','DECIMAL(10,7) NULL'
    UNION ALL SELECT 9,'document_ids','JSON NULL'
    UNION ALL SELECT 10,'status','VARCHAR(30) NULL'
    UNION ALL SELECT 11,'resolution_note','TEXT NULL'
    UNION ALL SELECT 12,'resolved_by_user_id','INT UNSIGNED NULL'
    UNION ALL SELECT 13,'reported_at','DATETIME NULL'
    UNION ALL SELECT 14,'resolved_at','TIMESTAMP NULL'
    UNION ALL SELECT 15,'vehicle_damage_id','BIGINT UNSIGNED NULL'
    UNION ALL SELECT 16,'created_at','TIMESTAMP NULL'
    UNION ALL SELECT 17,'updated_at','TIMESTAMP NULL') d
  LEFT JOIN information_schema.COLUMNS c ON c.TABLE_SCHEMA=DATABASE()
    AND c.TABLE_NAME='reservation_service_incidents' AND c.COLUMN_NAME=d.name
  WHERE c.COLUMN_NAME IS NULL
);
SET @repair_sql=IF(@pending_incident_columns IS NULL,'SELECT 1',CONCAT('ALTER TABLE `reservation_service_incidents` ',@pending_incident_columns));
PREPARE repair_incident_fields FROM @repair_sql;
EXECUTE repair_incident_fields;
DEALLOCATE PREPARE repair_incident_fields;

SET @incident_index_sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservation_service_incidents' AND INDEX_NAME='idx_rsi_reservation_status')=0, 'ALTER TABLE `reservation_service_incidents` ADD INDEX `idx_rsi_reservation_status` (`reservation_id`,`status`)', 'SELECT 1');
PREPARE stmt_incident_index_sql FROM @incident_index_sql;
EXECUTE stmt_incident_index_sql;
DEALLOCATE PREPARE stmt_incident_index_sql;

SET @incident_index_sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservation_service_incidents' AND INDEX_NAME='idx_rsi_assignment')=0, 'ALTER TABLE `reservation_service_incidents` ADD INDEX `idx_rsi_assignment` (`assignment_id`)', 'SELECT 1');
PREPARE stmt_incident_index_sql FROM @incident_index_sql;
EXECUTE stmt_incident_index_sql;
DEALLOCATE PREPARE stmt_incident_index_sql;

SET @incident_index_sql = IF((SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservation_service_incidents' AND INDEX_NAME='idx_rsi_vehicle_damage')=0, 'ALTER TABLE `reservation_service_incidents` ADD INDEX `idx_rsi_vehicle_damage` (`vehicle_damage_id`)', 'SELECT 1');
PREPARE stmt_incident_index_sql FROM @incident_index_sql;
EXECUTE stmt_incident_index_sql;
DEALLOCATE PREPARE stmt_incident_index_sql;

SET @incident_fk_sql = IF((SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservation_service_incidents' AND COLUMN_NAME='assignment_id' AND REFERENCED_TABLE_NAME='reservation_drivers' AND REFERENCED_COLUMN_NAME='mobile_assignment_id')=0, 'ALTER TABLE `reservation_service_incidents` ADD CONSTRAINT `fk_rsi_assignment` FOREIGN KEY (`assignment_id`) REFERENCES `reservation_drivers` (`mobile_assignment_id`)', 'SELECT 1');
PREPARE stmt_incident_fk_sql FROM @incident_fk_sql;
EXECUTE stmt_incident_fk_sql;
DEALLOCATE PREPARE stmt_incident_fk_sql;

SET @incident_fk_sql = IF((SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservation_service_incidents' AND COLUMN_NAME='reservation_id' AND REFERENCED_TABLE_NAME='reservations' AND REFERENCED_COLUMN_NAME='id')=0, 'ALTER TABLE `reservation_service_incidents` ADD CONSTRAINT `fk_rsi_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`id`)', 'SELECT 1');
PREPARE stmt_incident_fk_sql FROM @incident_fk_sql;
EXECUTE stmt_incident_fk_sql;
DEALLOCATE PREPARE stmt_incident_fk_sql;

SET @incident_fk_sql = IF((SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservation_service_incidents' AND COLUMN_NAME='reported_by_user_id' AND REFERENCED_TABLE_NAME='users' AND REFERENCED_COLUMN_NAME='id')=0, 'ALTER TABLE `reservation_service_incidents` ADD CONSTRAINT `fk_rsi_reporter` FOREIGN KEY (`reported_by_user_id`) REFERENCES `users` (`id`)', 'SELECT 1');
PREPARE stmt_incident_fk_sql FROM @incident_fk_sql;
EXECUTE stmt_incident_fk_sql;
DEALLOCATE PREPARE stmt_incident_fk_sql;

SET @incident_fk_sql = IF((SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservation_service_incidents' AND COLUMN_NAME='resolved_by_user_id' AND REFERENCED_TABLE_NAME='users' AND REFERENCED_COLUMN_NAME='id')=0, 'ALTER TABLE `reservation_service_incidents` ADD CONSTRAINT `fk_rsi_resolver` FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users` (`id`)', 'SELECT 1');
PREPARE stmt_incident_fk_sql FROM @incident_fk_sql;
EXECUTE stmt_incident_fk_sql;
DEALLOCATE PREPARE stmt_incident_fk_sql;

SET @incident_fk_sql = IF((SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservation_service_incidents' AND COLUMN_NAME='vehicle_damage_id' AND REFERENCED_TABLE_NAME='reservation_vehicle_damages' AND REFERENCED_COLUMN_NAME='id')=0, 'ALTER TABLE `reservation_service_incidents` ADD CONSTRAINT `fk_rsi_damage` FOREIGN KEY (`vehicle_damage_id`) REFERENCES `reservation_vehicle_damages` (`id`)', 'SELECT 1');
PREPARE stmt_incident_fk_sql FROM @incident_fk_sql;
EXECUTE stmt_incident_fk_sql;
DEALLOCATE PREPARE stmt_incident_fk_sql;

INSERT IGNORE INTO `app_mobile_assignment_ids` (`id`) SELECT `mobile_assignment_id` FROM `reservation_drivers` WHERE `mobile_assignment_id` IS NOT NULL;

INSERT IGNORE INTO `app_mobile_status_event_ids` (`id`) SELECT `mobile_event_id` FROM `activity_logs` WHERE `mobile_event_id` IS NOT NULL;

INSERT IGNORE INTO `app_mobile_expense_ids` (`id`) SELECT `mobile_expense_id` FROM `reservation_other_costs` WHERE `mobile_expense_id` IS NOT NULL;

SET @old_allocator_sql = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_driver_assignments' AND TABLE_TYPE='BASE TABLE')>0, 'INSERT IGNORE INTO `app_mobile_assignment_ids` (`id`) SELECT `id` FROM `app_driver_assignments`', 'SELECT 1');
PREPARE stmt_old_allocator_sql FROM @old_allocator_sql;
EXECUTE stmt_old_allocator_sql;
DEALLOCATE PREPARE stmt_old_allocator_sql;

SET @old_allocator_sql = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_booking_status_events' AND TABLE_TYPE='BASE TABLE')>0, 'INSERT IGNORE INTO `app_mobile_status_event_ids` (`id`) SELECT `id` FROM `app_booking_status_events`', 'SELECT 1');
PREPARE stmt_old_allocator_sql FROM @old_allocator_sql;
EXECUTE stmt_old_allocator_sql;
DEALLOCATE PREPARE stmt_old_allocator_sql;

SET @old_allocator_sql = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_driver_expenses' AND TABLE_TYPE='BASE TABLE')>0, 'INSERT IGNORE INTO `app_mobile_expense_ids` (`id`) SELECT `id` FROM `app_driver_expenses`', 'SELECT 1');
PREPARE stmt_old_allocator_sql FROM @old_allocator_sql;
EXECUTE stmt_old_allocator_sql;
DEALLOCATE PREPARE stmt_old_allocator_sql;

-- Optional historical metadata backfill; never changes original PHP fields.

SET @old_meta_sql = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_reservation_meta' AND TABLE_TYPE='BASE TABLE')>0, 'UPDATE reservations r JOIN app_reservation_meta m ON m.reservation_id = r.id SET r.service_code = m.service_code, r.source_channel = m.source_channel, r.created_by_user_id = m.created_by_user_id, r.created_by_agent_id = m.created_by_agent_id, r.lifecycle_status = m.lifecycle_status, r.currency_code = m.currency_code, r.quote_snapshot_id = m.quote_snapshot_id WHERE r.service_code IS NULL', 'SELECT 1');
PREPARE stmt_old_meta_sql FROM @old_meta_sql;
EXECUTE stmt_old_meta_sql;
DEALLOCATE PREPARE stmt_old_meta_sql;

-- Optional historical metadata backfill; never changes original PHP fields.

SET @old_meta_sql = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_reservation_leg_meta' AND TABLE_TYPE='BASE TABLE')>0, 'UPDATE reservation_details rd JOIN app_reservation_leg_meta m ON m.reservation_details_id=rd.id AND m.reservation_id=rd.reservation_id SET rd.sequence_no=COALESCE(rd.sequence_no,m.sequence_no),rd.vehicle_class_id=COALESCE(rd.vehicle_class_id,m.vehicle_class_id),rd.passenger_count=COALESCE(rd.passenger_count,m.passenger_count),rd.luggage_count=COALESCE(rd.luggage_count,m.luggage_count),rd.pickup_details=COALESCE(rd.pickup_details,m.pickup_details),rd.dropoff_details=COALESCE(rd.dropoff_details,m.dropoff_details),rd.flight_number=COALESCE(rd.flight_number,m.flight_number),rd.mobile_leg_status=COALESCE(rd.mobile_leg_status,m.status)', 'SELECT 1');
PREPARE stmt_old_meta_sql FROM @old_meta_sql;
EXECUTE stmt_old_meta_sql;
DEALLOCATE PREPARE stmt_old_meta_sql;

-- Historical chauffeur assignment backfill copied from original migration 009.

SET @legacy_driver_table=(SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_driver_assignments' AND TABLE_TYPE='BASE TABLE');

SET @reuse_driver_sql = IF(@legacy_driver_table=0,'SELECT 1',
  'UPDATE reservation_drivers rd JOIN app_driver_assignments a ON a.legacy_reservation_driver_id=rd.id JOIN (SELECT legacy_reservation_driver_id, MIN(id) AS first_assignment_id FROM app_driver_assignments WHERE legacy_reservation_driver_id IS NOT NULL GROUP BY legacy_reservation_driver_id) selected ON selected.legacy_reservation_driver_id=rd.id AND selected.first_assignment_id=a.id SET rd.mobile_assignment_id=a.id,rd.mobile_legacy_reservation_driver_id=rd.id,rd.mobile_driver_id=a.driver_id,rd.mobile_assignment_status=a.status,rd.mobile_assignment_role=CASE WHEN rd.drop_off_driver_id=a.driver_id AND (rd.pick_up_driver_id IS NULL OR rd.pick_up_driver_id<>a.driver_id) THEN ''DROPOFF'' WHEN rd.pick_up_driver_id=a.driver_id AND rd.drop_off_driver_id=a.driver_id THEN ''BOTH'' ELSE ''PICKUP'' END,rd.scheduled_start_at=a.scheduled_start_at,rd.scheduled_end_at=a.scheduled_end_at,rd.acknowledged_at=a.acknowledged_at,rd.declined_at=a.declined_at,rd.decline_reason=a.decline_reason,rd.started_at=a.started_at,rd.completed_at=a.completed_at,rd.assigned_by_user_id=a.assigned_by_user_id WHERE rd.mobile_assignment_id IS NULL');
PREPARE driver_mobile_reuse FROM @reuse_driver_sql;
EXECUTE driver_mobile_reuse;
DEALLOCATE PREPARE driver_mobile_reuse;

SET @additional_driver_sql = IF(@legacy_driver_table=0,'SELECT 1',
  'INSERT INTO reservation_drivers (reservation_id,reservation_details_id,pick_up_date,pick_up_time,pick_up_driver_id,drop_off_date,drop_off_time,drop_off_driver_id,user_id,status,created_at,updated_at,mobile_assignment_id,mobile_legacy_reservation_driver_id,mobile_driver_id,mobile_assignment_status,mobile_assignment_role,scheduled_start_at,scheduled_end_at,acknowledged_at,declined_at,decline_reason,started_at,completed_at,assigned_by_user_id) SELECT a.reservation_id,a.reservation_details_id,DATE(a.scheduled_start_at),TIME(a.scheduled_start_at),CASE WHEN legacy.drop_off_driver_id=a.driver_id AND (legacy.pick_up_driver_id IS NULL OR legacy.pick_up_driver_id<>a.driver_id) THEN NULL ELSE a.driver_id END,DATE(a.scheduled_end_at),TIME(a.scheduled_end_at),CASE WHEN legacy.drop_off_driver_id=a.driver_id THEN a.driver_id ELSE NULL END,a.assigned_by_user_id,CASE WHEN legacy.id IS NOT NULL THEN 2 ELSE 1 END,COALESCE(a.created_at,NOW()),COALESCE(a.updated_at,NOW()),a.id,a.legacy_reservation_driver_id,a.driver_id,a.status,CASE WHEN legacy.drop_off_driver_id=a.driver_id AND (legacy.pick_up_driver_id IS NULL OR legacy.pick_up_driver_id<>a.driver_id) THEN ''DROPOFF'' WHEN legacy.pick_up_driver_id=a.driver_id AND legacy.drop_off_driver_id=a.driver_id THEN ''BOTH'' ELSE ''PICKUP'' END,a.scheduled_start_at,a.scheduled_end_at,a.acknowledged_at,a.declined_at,a.decline_reason,a.started_at,a.completed_at,a.assigned_by_user_id FROM app_driver_assignments a LEFT JOIN reservation_drivers mapped ON mapped.mobile_assignment_id=a.id LEFT JOIN reservation_drivers legacy ON legacy.id=a.legacy_reservation_driver_id WHERE mapped.id IS NULL');
PREPARE driver_mobile_missing FROM @additional_driver_sql;
EXECUTE driver_mobile_missing;
DEALLOCATE PREPARE driver_mobile_missing;

-- Historical assignment records are handled by migration 009. Verify they are fully mapped.
SET @unmapped_assignments=0;
SET @assignment_check_sql=IF(
  (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_driver_assignments' AND TABLE_TYPE='BASE TABLE')>0,
  'SELECT COUNT(*) INTO @unmapped_assignments FROM app_driver_assignments a LEFT JOIN reservation_drivers rd ON rd.mobile_assignment_id=a.id WHERE rd.id IS NULL',
  'SELECT 1');
PREPARE check_assignment_history FROM @assignment_check_sql;
EXECUTE check_assignment_history;
DEALLOCATE PREPARE check_assignment_history;
SELECT @unmapped_assignments AS unmapped_historical_assignments;
SET @guard_sql=IF(@unmapped_assignments=0,'SELECT 1',
  'SELECT 1 FROM `STOP_HISTORICAL_ASSIGNMENTS_APPLY_MIGRATION_009_FIRST`');
PREPARE guard_history FROM @guard_sql;
EXECUTE guard_history;
DEALLOCATE PREPARE guard_history;

-- Stop if historical status, expense, or incident refers to an unbackfilled assignment.
SET @unmapped_history_links=0;

SET @missing_link_count=0;

SET @missing_link_sql = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_booking_status_events' AND TABLE_TYPE='BASE TABLE')>0, 'SELECT COUNT(*) INTO @missing_link_count FROM `app_booking_status_events` old LEFT JOIN reservation_drivers rd ON rd.mobile_assignment_id=old.assignment_id WHERE old.assignment_id IS NOT NULL AND rd.id IS NULL', 'SELECT 1');
PREPARE stmt_missing_link_sql FROM @missing_link_sql;
EXECUTE stmt_missing_link_sql;
DEALLOCATE PREPARE stmt_missing_link_sql;

SET @unmapped_history_links=@unmapped_history_links+@missing_link_count;

SET @missing_link_count=0;

SET @missing_link_sql = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_driver_expenses' AND TABLE_TYPE='BASE TABLE')>0, 'SELECT COUNT(*) INTO @missing_link_count FROM `app_driver_expenses` old LEFT JOIN reservation_drivers rd ON rd.mobile_assignment_id=old.assignment_id WHERE old.assignment_id IS NOT NULL AND rd.id IS NULL', 'SELECT 1');
PREPARE stmt_missing_link_sql FROM @missing_link_sql;
EXECUTE stmt_missing_link_sql;
DEALLOCATE PREPARE stmt_missing_link_sql;

SET @unmapped_history_links=@unmapped_history_links+@missing_link_count;

SET @missing_link_count=0;

SET @missing_link_sql = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_incidents' AND TABLE_TYPE='BASE TABLE')>0, 'SELECT COUNT(*) INTO @missing_link_count FROM `app_incidents` old LEFT JOIN reservation_drivers rd ON rd.mobile_assignment_id=old.assignment_id WHERE old.assignment_id IS NOT NULL AND rd.id IS NULL', 'SELECT 1');
PREPARE stmt_missing_link_sql FROM @missing_link_sql;
EXECUTE stmt_missing_link_sql;
DEALLOCATE PREPARE stmt_missing_link_sql;

SET @unmapped_history_links=@unmapped_history_links+@missing_link_count;

SELECT @unmapped_history_links AS unmapped_historical_assignment_links;
SET @guard_sql=IF(@unmapped_history_links=0,'SELECT 1',
  'SELECT 1 FROM `STOP_MISSING_HISTORICAL_ASSIGNMENT_LINKS_APPLY_009_FIRST`');
PREPARE guard_old_links FROM @guard_sql;
EXECUTE guard_old_links;
DEALLOCATE PREPARE guard_old_links;

-- Historical data backfill from app_booking_status_events when present; guarded by destination public ID.

SET @history_copy_sql = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_booking_status_events' AND TABLE_TYPE='BASE TABLE')>0, 'INSERT INTO activity_logs
  (subject_type,subject_id,feature_name,features_id,action,description,
   old_values,new_values,user_id,ip_address,created_at,
   mobile_event_id,mobile_reservation_details_id,mobile_assignment_id,
   mobile_event_status,mobile_note,mobile_latitude,mobile_longitude,mobile_occurred_at)
SELECT ''Reservation'',e.reservation_id,''mobile_booking_status'',e.reservation_details_id,
       e.status,LEFT(e.note,191),NULL,NULL,e.actor_user_id,NULL,
       COALESCE(e.created_at,NOW()),
       e.id,e.reservation_details_id,e.assignment_id,e.status,e.note,e.latitude,
       e.longitude,e.occurred_at
  FROM app_booking_status_events e
  LEFT JOIN activity_logs existing ON existing.mobile_event_id=e.id
 WHERE existing.id IS NULL', 'SELECT 1');
PREPARE stmt_history_copy_sql FROM @history_copy_sql;
EXECUTE stmt_history_copy_sql;
DEALLOCATE PREPARE stmt_history_copy_sql;

-- Historical data backfill from app_booking_status_events when present; guarded by destination public ID.

SET @history_copy_sql = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_booking_status_events' AND TABLE_TYPE='BASE TABLE')>0, 'INSERT INTO reservation_driver_statuses
  (reservation_id,reservation_details_id,driver_id,reservation_status_id,
   status,note,source,ip,created_at,updated_at,mobile_event_id,mobile_assignment_id)
SELECT e.reservation_id,e.reservation_details_id,rd.mobile_driver_id,NULL,
       LEFT(e.status,30),LEFT(e.note,500),''mobile_app'',NULL,
       COALESCE(e.created_at,NOW()),COALESCE(e.created_at,NOW()),
       e.id,e.assignment_id
  FROM app_booking_status_events e
  JOIN reservation_drivers rd ON rd.mobile_assignment_id=e.assignment_id
  LEFT JOIN reservation_driver_statuses prev ON prev.mobile_event_id=e.id
 WHERE e.reservation_details_id IS NOT NULL AND prev.id IS NULL', 'SELECT 1');
PREPARE stmt_history_copy_sql FROM @history_copy_sql;
EXECUTE stmt_history_copy_sql;
DEALLOCATE PREPARE stmt_history_copy_sql;

-- Historical data backfill from app_driver_expenses when present; guarded by destination public ID.

SET @history_copy_sql = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_driver_expenses' AND TABLE_TYPE='BASE TABLE')>0, 'INSERT INTO reservation_other_costs
  (reservation_id,reservation_details_id,amount,type,note,user_id,created_at,updated_at,
   mobile_expense_id,mobile_assignment_id,mobile_driver_id,mobile_category,
   mobile_expense_amount,mobile_currency,mobile_description,mobile_document_id,
   mobile_expense_status,mobile_review_note,mobile_incurred_at,
   mobile_reviewed_by_user_id,mobile_reviewed_at)
SELECT e.reservation_id,rd.reservation_details_id,0,''MOBILE_DRIVER_EXPENSE'',NULL,
       d.user_id,e.created_at,e.updated_at,
       e.id,e.assignment_id,e.driver_id,e.category,e.amount,e.currency,
       e.description,e.document_id,e.status,e.review_note,e.incurred_at,
       e.reviewed_by_user_id,e.reviewed_at
  FROM app_driver_expenses e
  JOIN reservation_drivers rd ON rd.mobile_assignment_id=e.assignment_id
  JOIN drivers d ON d.id=e.driver_id
  LEFT JOIN reservation_other_costs prev ON prev.mobile_expense_id=e.id
 WHERE prev.id IS NULL', 'SELECT 1');
PREPARE stmt_history_copy_sql FROM @history_copy_sql;
EXECUTE stmt_history_copy_sql;
DEALLOCATE PREPARE stmt_history_copy_sql;

-- Historical data backfill from app_incidents when present; guarded by destination public ID.

SET @history_copy_sql = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='app_incidents' AND TABLE_TYPE='BASE TABLE')>0, 'INSERT INTO reservation_service_incidents
  (id,assignment_id,reservation_id,reported_by_user_id,type,severity,
   description,latitude,longitude,document_ids,status,resolution_note,
   resolved_by_user_id,reported_at,resolved_at,created_at,updated_at)
SELECT i.id,i.assignment_id,i.reservation_id,i.reported_by_user_id,
       i.type,i.severity,i.description,i.latitude,i.longitude,i.document_ids,
       i.status,i.resolution_note,i.resolved_by_user_id,i.reported_at,
       i.resolved_at,i.created_at,i.updated_at
  FROM app_incidents i
  LEFT JOIN reservation_service_incidents prev ON prev.id=i.id
 WHERE prev.id IS NULL', 'SELECT 1');
PREPARE stmt_history_copy_sql FROM @history_copy_sql;
EXECUTE stmt_history_copy_sql;
DEALLOCATE PREPARE stmt_history_copy_sql;

-- Final smoke check. The CLI db:consolidation-check also validates every required index and FK.
SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND (
   (TABLE_NAME='activity_logs' AND COLUMN_NAME LIKE 'mobile_%')
   OR (TABLE_NAME='reservation_details' AND COLUMN_NAME='mobile_leg_status')
   OR (TABLE_NAME='reservation_other_costs' AND COLUMN_NAME LIKE 'mobile_%')
 ) ORDER BY TABLE_NAME,COLUMN_NAME;
SELECT 'Repair finished. Run npm run db:consolidation-check -- --deep before checkout' AS next_step;

