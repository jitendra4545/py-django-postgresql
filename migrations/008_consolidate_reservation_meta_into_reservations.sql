-- Release v2.3: reservation-level metadata belongs to the existing website
-- `reservations` table. This is additive and leaves all existing columns intact.
--
-- Prerequisites: verified database backup; test on staging before production.
-- Apply this migration BEFORE deploying the matching Node.js source code.
-- Re-run safety: absent columns and indexes are detected and skipped.
-- DDL in MySQL/MariaDB commits implicitly even inside a transaction.
-- All mobile-only columns are nullable so PHP website reservation inserts work
-- without changing the existing site's SQL.
--
-- IMPORTANT: Execute once via the migration runner (checksum ledger), or
-- manually once on the verified target database. Do not edit the prior 001
-- migration because existing installations track its SHA256 checksum.

-- Build a single ALTER TABLE from missing columns/indexes only. This works
-- on both MySQL 8 and MariaDB 10.6 (unlike ADD COLUMN IF NOT EXISTS on MySQL),
-- and can recover from an interrupted earlier attempt without duplicate
-- column errors. Adding columns at the end avoids reordering PHP's columns.
SET @mobile_column_alters = (
  SELECT GROUP_CONCAT(CONCAT('ADD COLUMN ', spec.column_name, ' ', spec.column_type)
                      ORDER BY spec.position SEPARATOR ', ')
  FROM (
    SELECT 1 AS position, 'service_code' AS column_name, 'VARCHAR(40) NULL' AS column_type
    UNION ALL SELECT 2, 'source_channel', 'VARCHAR(30) NULL'
    UNION ALL SELECT 3, 'created_by_user_id', 'INT UNSIGNED NULL'
    UNION ALL SELECT 4, 'created_by_agent_id', 'INT UNSIGNED NULL'
    UNION ALL SELECT 5, 'lifecycle_status', 'VARCHAR(40) NULL'
    UNION ALL SELECT 6, 'currency_code', 'CHAR(3) NULL'
    UNION ALL SELECT 7, 'quote_snapshot_id', 'BIGINT UNSIGNED NULL'
  ) spec
  LEFT JOIN information_schema.COLUMNS c
    ON c.TABLE_SCHEMA = DATABASE()
   AND c.TABLE_NAME = 'reservations'
   AND c.COLUMN_NAME = spec.column_name
  WHERE c.COLUMN_NAME IS NULL
);

SET @mobile_index_alters = (
  SELECT GROUP_CONCAT(CONCAT('ADD INDEX ', spec.index_name, ' ', spec.index_columns)
                      ORDER BY spec.position SEPARATOR ', ')
  FROM (
    SELECT 1 AS position, 'idx_reservations_mobile_status' AS index_name,
           '(lifecycle_status, service_code)' AS index_columns
    UNION ALL SELECT 2, 'idx_reservations_mobile_agent', '(created_by_agent_id)'
  ) spec
  LEFT JOIN information_schema.STATISTICS i
    ON i.TABLE_SCHEMA = DATABASE()
   AND i.TABLE_NAME = 'reservations'
   AND i.INDEX_NAME = spec.index_name
  WHERE i.INDEX_NAME IS NULL
);

SET @mobile_table_alters = CONCAT_WS(', ', @mobile_column_alters, @mobile_index_alters);
SET @mobile_alter_sql = IF(@mobile_table_alters = '', 'SELECT 1',
                           CONCAT('ALTER TABLE reservations ', @mobile_table_alters));
PREPARE reservation_mobile_alter FROM @mobile_alter_sql;
EXECUTE reservation_mobile_alter;
DEALLOCATE PREPARE reservation_mobile_alter;

-- Migrate any previously stored mobile metadata into the original row.
-- The new website SQL dump does not contain app_reservation_meta, so the
-- data copy is optional and automatically skipped when that table is absent.
-- Never overwrite rows where the reservation already has mobile metadata.
SET @has_legacy_mobile_meta = (
  SELECT COUNT(*)
  FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'app_reservation_meta'
    AND TABLE_TYPE = 'BASE TABLE'
);

SET @copy_legacy_mobile_meta = IF(
  @has_legacy_mobile_meta > 0,
  'UPDATE reservations r JOIN app_reservation_meta m ON m.reservation_id = r.id SET r.service_code = m.service_code, r.source_channel = m.source_channel, r.created_by_user_id = m.created_by_user_id, r.created_by_agent_id = m.created_by_agent_id, r.lifecycle_status = m.lifecycle_status, r.currency_code = m.currency_code, r.quote_snapshot_id = m.quote_snapshot_id WHERE r.service_code IS NULL',
  'SELECT 1'
);

PREPARE reservation_mobile_meta_copy FROM @copy_legacy_mobile_meta;
EXECUTE reservation_mobile_meta_copy;
DEALLOCATE PREPARE reservation_mobile_meta_copy;

-- The original app_reservation_meta table, if one exists, is deliberately
-- retained for rollback/data recovery. No API query or write uses it anymore.
-- Do not DROP it until the team has validated production and a rollback plan.
