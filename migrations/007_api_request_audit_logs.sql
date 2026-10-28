-- Additive HTTP diagnostics for the mobile API. No changes to the existing
-- activity_logs table, users, bookings, payments, or applied migrations.
-- Contains REDACTED request/response snapshots only; not a raw payload archive.
CREATE TABLE IF NOT EXISTS app_api_request_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id CHAR(36) NOT NULL,
  method VARCHAR(10) NOT NULL,
  request_path VARCHAR(512) NOT NULL,
  access_line VARCHAR(800) NOT NULL,
  http_status SMALLINT UNSIGNED NOT NULL,
  duration_ms DECIMAL(12,3) NOT NULL,
  request_query JSON NULL,
  request_body JSON NULL,
  response_body JSON NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  actor_role SMALLINT NULL,
  client_ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  response_content_type VARCHAR(120) NULL,
  response_bytes BIGINT UNSIGNED NULL,
  error_code VARCHAR(120) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_api_audit_request_id (request_id),
  KEY idx_api_audit_created_at (created_at),
  KEY idx_api_audit_actor (actor_user_id, created_at),
  KEY idx_api_audit_http (http_status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
