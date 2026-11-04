-- Expo push delivery is additive. Existing app_notifications and legacy tables are unchanged.
CREATE TABLE IF NOT EXISTS app_push_delivery_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  notification_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  status ENUM('PENDING','PROCESSING','RETRY','SENT','SKIPPED','FAILED') NOT NULL DEFAULT 'PENDING',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lock_token VARCHAR(36) NULL,
  locked_until DATETIME NULL,
  last_error VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_push_job_notification (notification_id),
  KEY idx_app_push_job_due (status,next_attempt_at,locked_until),
  CONSTRAINT fk_app_push_job_notification FOREIGN KEY (notification_id) REFERENCES app_notifications(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_push_job_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_push_delivery_tickets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  device_id VARCHAR(191) NOT NULL,
  push_token_hash CHAR(64) NOT NULL,
  receipt_id VARCHAR(191) NOT NULL,
  status ENUM('PENDING','DELIVERED','FAILED','EXPIRED') NOT NULL DEFAULT 'PENDING',
  provider_error VARCHAR(120) NULL,
  checked_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_push_ticket_receipt (receipt_id),
  KEY idx_app_push_ticket_pending (status,created_at),
  CONSTRAINT fk_app_push_ticket_job FOREIGN KEY (job_id) REFERENCES app_push_delivery_jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_push_ticket_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
