-- 010: consolidate mobile booking status events and chauffeur expenses into existing
-- website tables, and separate general service incidents from physical vehicle damage.
-- Requires migrations 001 through 009. Run on a verified staging copy first,
-- with old mobile-backend writes paused. DDL is not transactional on MariaDB.
-- Backfills are additive; NEVER delete the retired app_* source tables here.
-- Existing website columns and booking totals are not changed.
SET SESSION group_concat_max_len = 32768;

-- Public IDs must stay stable and must not collide with PHP primary keys.
CREATE TABLE IF NOT EXISTS `app_mobile_status_event_ids` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS `app_mobile_expense_ids` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO app_mobile_status_event_ids (id)
  SELECT id FROM app_booking_status_events;
INSERT IGNORE INTO app_mobile_expense_ids (id)
  SELECT id FROM app_driver_expenses;

-- Explicitly refuse an incomplete assignment backfill (migration 009).
SET @unmapped_010 =
 (SELECT COUNT(*) FROM app_driver_expenses x LEFT JOIN reservation_drivers rd
    ON rd.mobile_assignment_id=x.assignment_id WHERE rd.id IS NULL)
 + (SELECT COUNT(*) FROM app_booking_status_events x LEFT JOIN reservation_drivers rd
    ON rd.mobile_assignment_id=x.assignment_id
    WHERE x.assignment_id IS NOT NULL AND rd.id IS NULL)
 + (SELECT COUNT(*) FROM app_incidents x LEFT JOIN reservation_drivers rd
    ON rd.mobile_assignment_id=x.assignment_id
    WHERE x.assignment_id IS NOT NULL AND rd.id IS NULL);
SET @guard_010 = IF(@unmapped_010=0, 'SELECT 1',
  'SELECT 1 FROM `ERROR_010_UNMAPPED_ASSIGNMENTS_APPLY_009_FIRST`');
PREPARE guard_stmt_010 FROM @guard_010;
EXECUTE guard_stmt_010;
DEALLOCATE PREPARE guard_stmt_010;

-- Add mobile fields to activity_logs; all fields are NULL on existing website rows.
SET @event_cols = (
  SELECT GROUP_CONCAT(CONCAT('ADD COLUMN `', d.name, '` ', d.definition)
                      ORDER BY d.position SEPARATOR ', ')
  FROM (
    SELECT 1 position, 'mobile_event_id' name, 'BIGINT UNSIGNED NULL' definition
    UNION ALL SELECT 2 position, 'mobile_reservation_details_id' name, 'INT UNSIGNED NULL' definition
    UNION ALL SELECT 3 position, 'mobile_assignment_id' name, 'BIGINT UNSIGNED NULL' definition
    UNION ALL SELECT 4 position, 'mobile_event_status' name, 'VARCHAR(40) NULL' definition
    UNION ALL SELECT 5 position, 'mobile_note' name, 'TEXT NULL' definition
    UNION ALL SELECT 6 position, 'mobile_latitude' name, 'DECIMAL(10,7) NULL' definition
    UNION ALL SELECT 7 position, 'mobile_longitude' name, 'DECIMAL(10,7) NULL' definition
    UNION ALL SELECT 8 position, 'mobile_occurred_at' name, 'DATETIME NULL' definition
  ) d
  LEFT JOIN information_schema.COLUMNS c ON c.TABLE_SCHEMA=DATABASE()
    AND c.TABLE_NAME='activity_logs' AND c.COLUMN_NAME=d.name
  WHERE c.COLUMN_NAME IS NULL
);
SET @event_sql=IF(@event_cols IS NULL,'SELECT 1',
                     CONCAT('ALTER TABLE `activity_logs` ',@event_cols));
PREPARE event_alter FROM @event_sql;
EXECUTE event_alter;
DEALLOCATE PREPARE event_alter;

SET @idx_event = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='activity_logs' AND INDEX_NAME='uq_activity_mobile_event');
SET @idx_event_sql=IF(@idx_event>0,'SELECT 1',
  'ALTER TABLE `activity_logs` ADD UNIQUE KEY `uq_activity_mobile_event` (`mobile_event_id`)');
PREPARE idx_event_stmt FROM @idx_event_sql;
EXECUTE idx_event_stmt;
DEALLOCATE PREPARE idx_event_stmt;

SET @idx_timeline = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='activity_logs' AND INDEX_NAME='idx_activity_mobile_timeline');
SET @idx_timeline_sql=IF(@idx_timeline>0,'SELECT 1',
  'ALTER TABLE `activity_logs` ADD KEY `idx_activity_mobile_timeline` (`subject_type`,`subject_id`,`feature_name`,`mobile_occurred_at`)');
PREPARE idx_timeline_stmt FROM @idx_timeline_sql;
EXECUTE idx_timeline_stmt;
DEALLOCATE PREPARE idx_timeline_stmt;

-- Add mobile fields to reservation_driver_statuses; all fields are NULL on existing website rows.
SET @driverstatus_cols = (
  SELECT GROUP_CONCAT(CONCAT('ADD COLUMN `', d.name, '` ', d.definition)
                      ORDER BY d.position SEPARATOR ', ')
  FROM (
    SELECT 1 position, 'mobile_event_id' name, 'BIGINT UNSIGNED NULL' definition
    UNION ALL SELECT 2 position, 'mobile_assignment_id' name, 'BIGINT UNSIGNED NULL' definition
  ) d
  LEFT JOIN information_schema.COLUMNS c ON c.TABLE_SCHEMA=DATABASE()
    AND c.TABLE_NAME='reservation_driver_statuses' AND c.COLUMN_NAME=d.name
  WHERE c.COLUMN_NAME IS NULL
);
SET @driverstatus_sql=IF(@driverstatus_cols IS NULL,'SELECT 1',
                     CONCAT('ALTER TABLE `reservation_driver_statuses` ',@driverstatus_cols));
PREPARE driverstatus_alter FROM @driverstatus_sql;
EXECUTE driverstatus_alter;
DEALLOCATE PREPARE driverstatus_alter;

SET @idx_rds = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservation_driver_statuses' AND INDEX_NAME='uq_rds_mobile_event');
SET @idx_rds_sql=IF(@idx_rds>0,'SELECT 1',
  'ALTER TABLE `reservation_driver_statuses` ADD UNIQUE KEY `uq_rds_mobile_event` (`mobile_event_id`)');
PREPARE idx_rds_stmt FROM @idx_rds_sql;
EXECUTE idx_rds_stmt;
DEALLOCATE PREPARE idx_rds_stmt;

-- Add mobile fields to reservation_other_costs; all fields are NULL on existing website rows.
SET @expense_cols = (
  SELECT GROUP_CONCAT(CONCAT('ADD COLUMN `', d.name, '` ', d.definition)
                      ORDER BY d.position SEPARATOR ', ')
  FROM (
    SELECT 1 position, 'mobile_expense_id' name, 'BIGINT UNSIGNED NULL' definition
    UNION ALL SELECT 2 position, 'mobile_assignment_id' name, 'BIGINT UNSIGNED NULL' definition
    UNION ALL SELECT 3 position, 'mobile_driver_id' name, 'INT UNSIGNED NULL' definition
    UNION ALL SELECT 4 position, 'mobile_category' name, 'VARCHAR(40) NULL' definition
    UNION ALL SELECT 5 position, 'mobile_expense_amount' name, 'DECIMAL(12,2) NULL' definition
    UNION ALL SELECT 6 position, 'mobile_currency' name, 'CHAR(3) NULL' definition
    UNION ALL SELECT 7 position, 'mobile_description' name, 'TEXT NULL' definition
    UNION ALL SELECT 8 position, 'mobile_document_id' name, 'BIGINT UNSIGNED NULL' definition
    UNION ALL SELECT 9 position, 'mobile_expense_status' name, 'VARCHAR(30) NULL' definition
    UNION ALL SELECT 10 position, 'mobile_review_note' name, 'TEXT NULL' definition
    UNION ALL SELECT 11 position, 'mobile_incurred_at' name, 'DATETIME NULL' definition
    UNION ALL SELECT 12 position, 'mobile_reviewed_by_user_id' name, 'INT UNSIGNED NULL' definition
    UNION ALL SELECT 13 position, 'mobile_reviewed_at' name, 'TIMESTAMP NULL' definition
  ) d
  LEFT JOIN information_schema.COLUMNS c ON c.TABLE_SCHEMA=DATABASE()
    AND c.TABLE_NAME='reservation_other_costs' AND c.COLUMN_NAME=d.name
  WHERE c.COLUMN_NAME IS NULL
);
SET @expense_sql=IF(@expense_cols IS NULL,'SELECT 1',
                     CONCAT('ALTER TABLE `reservation_other_costs` ',@expense_cols));
PREPARE expense_alter FROM @expense_sql;
EXECUTE expense_alter;
DEALLOCATE PREPARE expense_alter;

SET @idx_expense = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservation_other_costs' AND INDEX_NAME='uq_other_costs_mobile_expense');
SET @idx_expense_sql=IF(@idx_expense>0,'SELECT 1',
  'ALTER TABLE `reservation_other_costs` ADD UNIQUE KEY `uq_other_costs_mobile_expense` (`mobile_expense_id`)');
PREPARE idx_expense_stmt FROM @idx_expense_sql;
EXECUTE idx_expense_stmt;
DEALLOCATE PREPARE idx_expense_stmt;

SET @idx_expense_assignment = (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='reservation_other_costs' AND INDEX_NAME='idx_other_costs_mobile_assignment');
SET @idx_expense_assignment_sql=IF(@idx_expense_assignment>0,'SELECT 1',
  'ALTER TABLE `reservation_other_costs` ADD KEY `idx_other_costs_mobile_assignment` (`mobile_assignment_id`,`mobile_expense_status`)');
PREPARE idx_expense_assignment_stmt FROM @idx_expense_assignment_sql;
EXECUTE idx_expense_assignment_stmt;
DEALLOCATE PREPARE idx_expense_assignment_stmt;

-- Timeline: activity_logs is canonical. The previous public event ID is
-- copied to mobile_event_id; all event metadata survives unchanged.
INSERT INTO activity_logs
  (subject_type,subject_id,feature_name,features_id,action,description,
   old_values,new_values,user_id,ip_address,created_at,
   mobile_event_id,mobile_reservation_details_id,mobile_assignment_id,
   mobile_event_status,mobile_note,mobile_latitude,mobile_longitude,mobile_occurred_at)
SELECT 'Reservation',e.reservation_id,'mobile_booking_status',e.reservation_details_id,
       e.status,LEFT(e.note,191),NULL,NULL,e.actor_user_id,NULL,
       COALESCE(e.created_at,NOW()),
       e.id,e.reservation_details_id,e.assignment_id,e.status,e.note,e.latitude,
       e.longitude,e.occurred_at
  FROM app_booking_status_events e
  LEFT JOIN activity_logs existing ON existing.mobile_event_id=e.id
 WHERE existing.id IS NULL;

-- Driver-specific status history is mirrored to the website's existing table.
-- A 1000-character mobile note remains complete in activity_logs; the website
-- column holds a max-500 character display version.
INSERT INTO reservation_driver_statuses
  (reservation_id,reservation_details_id,driver_id,reservation_status_id,
   status,note,source,ip,created_at,updated_at,mobile_event_id,mobile_assignment_id)
SELECT e.reservation_id,e.reservation_details_id,rd.mobile_driver_id,NULL,
       LEFT(e.status,30),LEFT(e.note,500),'mobile_app',NULL,
       COALESCE(e.created_at,NOW()),COALESCE(e.created_at,NOW()),
       e.id,e.assignment_id
  FROM app_booking_status_events e
  JOIN reservation_drivers rd ON rd.mobile_assignment_id=e.assignment_id
  LEFT JOIN reservation_driver_statuses prev ON prev.mobile_event_id=e.id
 WHERE e.reservation_details_id IS NOT NULL AND prev.id IS NULL;

-- Internal chauffeur expenses MUST NOT increase website reservation costs.
-- Reserve the website amount=0, store actual outlay in mobile_expense_amount.
-- Expense rows are identifiable by type='MOBILE_DRIVER_EXPENSE'.
INSERT INTO reservation_other_costs
  (reservation_id,reservation_details_id,amount,type,note,user_id,created_at,updated_at,
   mobile_expense_id,mobile_assignment_id,mobile_driver_id,mobile_category,
   mobile_expense_amount,mobile_currency,mobile_description,mobile_document_id,
   mobile_expense_status,mobile_review_note,mobile_incurred_at,
   mobile_reviewed_by_user_id,mobile_reviewed_at)
SELECT e.reservation_id,rd.reservation_details_id,0,'MOBILE_DRIVER_EXPENSE',NULL,
       d.user_id,e.created_at,e.updated_at,
       e.id,e.assignment_id,e.driver_id,e.category,e.amount,e.currency,
       e.description,e.document_id,e.status,e.review_note,e.incurred_at,
       e.reviewed_by_user_id,e.reviewed_at
  FROM app_driver_expenses e
  JOIN reservation_drivers rd ON rd.mobile_assignment_id=e.assignment_id
  JOIN drivers d ON d.id=e.driver_id
  LEFT JOIN reservation_other_costs prev ON prev.mobile_expense_id=e.id
 WHERE prev.id IS NULL;

-- Service incidents are NOT synonymous with physical vehicle damage.
-- DELAY, PASSENGER_ISSUE, SAFETY and OTHER do not require a vehicle_id.
-- Keep damage/inspection records pristine and optionally link a confirmed damage.
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

-- Preserve historical incident IDs directly (including review status and media).
INSERT INTO reservation_service_incidents
  (id,assignment_id,reservation_id,reported_by_user_id,type,severity,
   description,latitude,longitude,document_ids,status,resolution_note,
   resolved_by_user_id,reported_at,resolved_at,created_at,updated_at)
SELECT i.id,i.assignment_id,i.reservation_id,i.reported_by_user_id,
       i.type,i.severity,i.description,i.latitude,i.longitude,i.document_ids,
       i.status,i.resolution_note,i.resolved_by_user_id,i.reported_at,
       i.resolved_at,i.created_at,i.updated_at
  FROM app_incidents i
  LEFT JOIN reservation_service_incidents prev ON prev.id=i.id
 WHERE prev.id IS NULL;

-- Do not drop app_booking_status_events, app_driver_expenses or app_incidents:
-- keep them as read-only rollback sources until full end-to-end verification.

-- Terminal no-op makes older semicolon/newline migration splitters safe.
SELECT 1;
