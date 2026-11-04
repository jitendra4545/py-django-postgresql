-- HYBRID / LEGACY-FIRST SCHEMA: additive changes to the production Laravel tables.
-- No original columns, keys, indexes, constraints or existing row values are removed.
-- Apply to a RESTORED STAGING CLONE first. This migration is intended for a fresh
-- mobile-app schema install; for databases with previously applied app migrations,
-- follow docs/LEGACY_FIRST_DATABASE_MIGRATION.md before deploying.

ALTER TABLE reservations
  ADD COLUMN service_code VARCHAR(40) NULL,
  ADD COLUMN source_channel VARCHAR(30) NULL,
  ADD COLUMN created_by_user_id INT UNSIGNED NULL,
  ADD COLUMN created_by_agent_id INT UNSIGNED NULL,
  ADD COLUMN lifecycle_status VARCHAR(40) NULL,
  ADD COLUMN currency_code CHAR(3) NULL,
  ADD COLUMN quote_snapshot_id BIGINT UNSIGNED NULL,
  ADD KEY idx_reservations_app_lifecycle (lifecycle_status,service_code);

ALTER TABLE reservation_details
  ADD COLUMN sequence_no INT UNSIGNED NULL,
  ADD COLUMN vehicle_class_id INT UNSIGNED NULL,
  ADD COLUMN passenger_count INT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN luggage_count INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN pickup_details JSON NULL,
  ADD COLUMN dropoff_details JSON NULL,
  ADD COLUMN flight_number VARCHAR(40) NULL,
  ADD COLUMN app_leg_status VARCHAR(40) NULL,
  ADD KEY idx_reservation_details_app_sequence (reservation_id,sequence_no);

ALTER TABLE reservation_drivers
  ADD COLUMN app_assignment_status VARCHAR(40) NULL,
  ADD COLUMN scheduled_start_at DATETIME NULL,
  ADD COLUMN scheduled_end_at DATETIME NULL,
  ADD COLUMN acknowledged_at TIMESTAMP NULL,
  ADD COLUMN declined_at TIMESTAMP NULL,
  ADD COLUMN decline_reason TEXT NULL,
  ADD COLUMN started_at TIMESTAMP NULL,
  ADD COLUMN completed_at TIMESTAMP NULL,
  ADD COLUMN assigned_by_user_id INT UNSIGNED NULL,
  ADD KEY idx_reservation_drivers_app_schedule (pick_up_driver_id,scheduled_start_at,scheduled_end_at),
  ADD KEY idx_reservation_drivers_app_reservation (reservation_id,reservation_details_id);

ALTER TABLE reservation_messages
  ADD COLUMN message_type ENUM('TEXT','DOCUMENT') NOT NULL DEFAULT 'TEXT',
  ADD COLUMN document_id BIGINT UNSIGNED NULL,
  ADD KEY idx_reservation_messages_app_recent (reservation_id,created_at);

-- notifications.id remains the website's original CHAR(36) primary key.
-- A second AUTO_INCREMENT UNIQUE key exposes the same numeric IDs expected by
-- existing mobile APIs and the push delivery worker, with no change to the PK.
ALTER TABLE notifications
  ADD COLUMN app_mobile_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ADD UNIQUE KEY uq_notifications_app_mobile_id (app_mobile_id),
  ADD COLUMN app_type VARCHAR(50) NULL,
  ADD COLUMN app_title VARCHAR(191) NULL,
  ADD COLUMN app_body TEXT NULL,
  ADD KEY idx_notifications_mobile_user (notifiable_id,read_at,created_at);
