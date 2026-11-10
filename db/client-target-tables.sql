-- Reference table DDL only. Use npm run db:client:upgrade for the full guarded upgrade.

CREATE TABLE IF NOT EXISTS app_refresh_tokens (
  id CHAR(36) NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  device_id VARCHAR(191) NULL,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_refresh_tokens_hash (token_hash),
  KEY idx_app_refresh_tokens_user (user_id,expires_at),
  CONSTRAINT fk_app_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_user_oauth_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  provider VARCHAR(32) NOT NULL,
  provider_subject VARCHAR(191) NOT NULL,
  provider_email VARCHAR(191) NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_oauth_provider_subject (provider,provider_subject),
  UNIQUE KEY uq_app_oauth_user_provider (user_id,provider),
  KEY idx_app_oauth_provider_email (provider,provider_email),
  CONSTRAINT fk_app_oauth_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_account_invitations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  email VARCHAR(191) NOT NULL,
  role TINYINT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP NULL,
  last_sent_at TIMESTAMP NULL,
  send_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_by_user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_account_invitation_token (token_hash),
  KEY idx_app_account_invitation_user (user_id),
  KEY idx_app_account_invitation_pending (user_id,accepted_at,expires_at),
  CONSTRAINT fk_app_account_invitation_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_account_invitation_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_user_devices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  device_id VARCHAR(191) NOT NULL,
  platform ENUM('IOS','ANDROID','WEB') NOT NULL,
  push_token VARCHAR(512) NULL,
  app_version VARCHAR(32) NULL,
  last_seen_at TIMESTAMP NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_user_devices_device (device_id),
  UNIQUE KEY uq_app_user_devices_push (push_token),
  KEY idx_app_user_devices_user (user_id),
  CONSTRAINT fk_app_user_devices_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
  CONSTRAINT fk_app_push_job_notification FOREIGN KEY (notification_id) REFERENCES notifications(mobile_notification_id) ON DELETE CASCADE,
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

CREATE TABLE IF NOT EXISTS app_booking_drafts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  created_by_user_id INT UNSIGNED NOT NULL,
  created_by_agent_id INT UNSIGNED NULL,
  customer_id INT UNSIGNED NOT NULL,
  agency_id INT UNSIGNED NULL,
  service_code VARCHAR(40) NOT NULL,
  status ENUM('DRAFT','READY','QUOTED','CHECKED_OUT','EXPIRED','ABANDONED') NOT NULL DEFAULT 'DRAFT',
  details JSON NOT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  quote_snapshot_id BIGINT UNSIGNED NULL,
  reservation_id INT UNSIGNED NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_app_booking_drafts_user_status (created_by_user_id,status),
  KEY idx_app_booking_drafts_customer (customer_id),
  KEY idx_app_booking_drafts_expiry (expires_at,status),
  CONSTRAINT fk_app_booking_drafts_user FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_app_booking_drafts_agent FOREIGN KEY (created_by_agent_id) REFERENCES agents(id),
  CONSTRAINT fk_app_booking_drafts_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_app_booking_drafts_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
  CONSTRAINT fk_app_booking_drafts_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_quote_snapshots (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  draft_id BIGINT UNSIGNED NOT NULL,
  draft_revision INT UNSIGNED NOT NULL,
  request_hash CHAR(64) NOT NULL,
  currency CHAR(3) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  quote_data JSON NOT NULL,
  valid_until TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_app_quote_draft (draft_id,valid_until),
  CONSTRAINT fk_app_quote_draft FOREIGN KEY (draft_id) REFERENCES app_booking_drafts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_idempotency_keys (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  scope VARCHAR(80) NOT NULL,
  idempotency_key VARCHAR(191) NOT NULL,
  request_hash CHAR(64) NOT NULL,
  response_status INT NOT NULL,
  response_body JSON NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_idempotency_user_scope_key (user_id,scope,idempotency_key),
  KEY idx_app_idempotency_expiry (expires_at),
  CONSTRAINT fk_app_idempotency_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_payment_transactions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  provider VARCHAR(40) NOT NULL,
  provider_reference VARCHAR(191) NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  status VARCHAR(30) NOT NULL,
  idempotency_key VARCHAR(191) NULL,
  provider_payload JSON NULL,
  refund_reference VARCHAR(191) NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_payment_provider_ref (provider,provider_reference),
  KEY idx_app_payment_reservation (reservation_id,status),
  CONSTRAINT fk_app_payment_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  CONSTRAINT fk_app_payment_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_payment_webhook_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  provider VARCHAR(40) NOT NULL,
  provider_event_id VARCHAR(191) NOT NULL,
  payload JSON NOT NULL,
  received_at TIMESTAMP NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_payment_webhook_event (provider,provider_event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_agent_customer_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agent_id INT UNSIGNED NOT NULL,
  customer_id INT UNSIGNED NOT NULL,
  agency_id INT UNSIGNED NOT NULL,
  status ENUM('ACTIVE','INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  preferences JSON NULL,
  notes TEXT NULL,
  assigned_by_user_id INT UNSIGNED NOT NULL,
  assigned_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_agent_customer (agent_id,customer_id),
  KEY idx_app_agent_customer_customer (customer_id,status),
  KEY idx_app_agent_customer_agency (agency_id,status),
  CONSTRAINT fk_app_agent_customer_agent FOREIGN KEY (agent_id) REFERENCES agents(id),
  CONSTRAINT fk_app_agent_customer_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_app_agent_customer_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
  CONSTRAINT fk_app_agent_customer_assigner FOREIGN KEY (assigned_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_booking_change_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_id INT UNSIGNED NOT NULL,
  requested_by_user_id INT UNSIGNED NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  previous_lifecycle_status VARCHAR(40) NOT NULL,
  reason TEXT NOT NULL,
  requested_changes JSON NOT NULL,
  resolution_note TEXT NULL,
  resolved_by_user_id INT UNSIGNED NULL,
  resolved_at TIMESTAMP NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_app_change_request_reservation (reservation_id,status),
  CONSTRAINT fk_app_change_request_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  CONSTRAINT fk_app_change_request_requester FOREIGN KEY (requested_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_app_change_request_resolver FOREIGN KEY (resolved_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_booking_cancellation_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_id INT UNSIGNED NOT NULL,
  requested_by_user_id INT UNSIGNED NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  previous_lifecycle_status VARCHAR(40) NOT NULL,
  reason TEXT NOT NULL,
  resolution_note TEXT NULL,
  resolved_by_user_id INT UNSIGNED NULL,
  resolved_at TIMESTAMP NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_app_cancel_request_reservation (reservation_id,status),
  CONSTRAINT fk_app_cancel_request_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  CONSTRAINT fk_app_cancel_request_requester FOREIGN KEY (requested_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_app_cancel_request_resolver FOREIGN KEY (resolved_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_conversations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_id INT UNSIGNED NOT NULL,
  status ENUM('ACTIVE','CLOSED') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_conversation_reservation (reservation_id),
  CONSTRAINT fk_app_conversation_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_conversation_participants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  participant_role VARCHAR(30) NOT NULL,
  joined_at TIMESTAMP NOT NULL,
  left_at TIMESTAMP NULL,
  last_read_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_conversation_participant (conversation_id,user_id),
  KEY idx_app_conversation_participant_user (user_id,left_at),
  CONSTRAINT fk_app_conversation_participant_conversation FOREIGN KEY (conversation_id) REFERENCES app_conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_conversation_participant_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_driver_locations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id BIGINT UNSIGNED NOT NULL,
  driver_id INT UNSIGNED NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  heading DECIMAL(6,2) NULL,
  speed DECIMAL(8,2) NULL,
  accuracy DECIMAL(8,2) NULL,
  recorded_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_app_driver_location_assignment_time (assignment_id,recorded_at),
  KEY idx_app_driver_location_driver_time (driver_id,recorded_at),
  CONSTRAINT fk_app_driver_location_assignment FOREIGN KEY (assignment_id) REFERENCES app_mobile_assignment_ids(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_driver_location_driver FOREIGN KEY (driver_id) REFERENCES drivers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_driver_expenses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id BIGINT UNSIGNED NOT NULL,
  reservation_id INT UNSIGNED NOT NULL,
  driver_id INT UNSIGNED NOT NULL,
  category VARCHAR(40) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  description TEXT NULL,
  document_id BIGINT UNSIGNED NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED',
  review_note TEXT NULL,
  incurred_at DATETIME NOT NULL,
  reviewed_by_user_id INT UNSIGNED NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_app_driver_expense_driver (driver_id,incurred_at),
  KEY idx_app_driver_expense_reservation (reservation_id,status),
  CONSTRAINT fk_app_driver_expense_assignment FOREIGN KEY (assignment_id) REFERENCES app_mobile_assignment_ids(id),
  CONSTRAINT fk_app_driver_expense_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  CONSTRAINT fk_app_driver_expense_driver FOREIGN KEY (driver_id) REFERENCES drivers(id),
  CONSTRAINT fk_app_driver_expense_document FOREIGN KEY (document_id) REFERENCES file_managers(mobile_document_id),
  CONSTRAINT fk_app_driver_expense_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
    REFERENCES app_mobile_assignment_ids (id),
  CONSTRAINT fk_rsi_reservation FOREIGN KEY (reservation_id)
    REFERENCES reservations (id),
  CONSTRAINT fk_rsi_reporter FOREIGN KEY (reported_by_user_id)
    REFERENCES users (id),
  CONSTRAINT fk_rsi_resolver FOREIGN KEY (resolved_by_user_id)
    REFERENCES users (id),
  CONSTRAINT fk_rsi_damage FOREIGN KEY (vehicle_damage_id)
    REFERENCES reservation_vehicle_damages (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_masked_calls (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_id INT UNSIGNED NOT NULL,
  initiator_user_id INT UNSIGNED NOT NULL,
  recipient_role VARCHAR(30) NOT NULL,
  provider VARCHAR(40) NOT NULL,
  provider_reference VARCHAR(191) NULL,
  status VARCHAR(30) NOT NULL,
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_app_masked_call_reservation (reservation_id,created_at),
  CONSTRAINT fk_app_masked_call_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  CONSTRAINT fk_app_masked_call_initiator FOREIGN KEY (initiator_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_telnyx_call_routes (
  masked_call_id BIGINT UNSIGNED NOT NULL,
  caller_phone VARCHAR(30) NOT NULL,
  recipient_phone VARCHAR(30) NOT NULL,
  inbound_call_id VARCHAR(191) NULL,
  outbound_call_id VARCHAR(191) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (masked_call_id),
  UNIQUE KEY uq_telnyx_inbound_call_id (inbound_call_id),
  UNIQUE KEY uq_telnyx_outbound_call_id (outbound_call_id),
  KEY idx_telnyx_caller_phone (caller_phone),
  CONSTRAINT fk_telnyx_masked_call FOREIGN KEY (masked_call_id) REFERENCES app_masked_calls(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_telnyx_webhook_events (
  event_id VARCHAR(191) NOT NULL,
  received_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `app_mobile_assignment_ids` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_driver_id INT UNSIGNED NULL,
  assignment_role VARCHAR(12) NULL,
  driver_id INT UNSIGNED NULL,
  assignment_status VARCHAR(40) NULL,
  current_slot TINYINT UNSIGNED NULL,
  scheduled_start_at DATETIME NULL,
  scheduled_end_at DATETIME NULL,
  acknowledged_at TIMESTAMP NULL,
  declined_at TIMESTAMP NULL,
  decline_reason TEXT NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  assigned_by_user_id INT UNSIGNED NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY uq_app_mobile_assignment_current_role (reservation_driver_id,assignment_role,current_slot),
  KEY idx_app_mobile_assignment_driver_schedule (driver_id,scheduled_start_at,scheduled_end_at),
  KEY idx_app_mobile_assignment_row_role_history (reservation_driver_id,assignment_role,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `app_mobile_status_event_ids` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS app_vehicle_booking_locks (
 source_kind VARCHAR(8) NOT NULL,
 source_id BIGINT UNSIGNED NOT NULL,
 vehicle_id INT UNSIGNED NOT NULL,
 reservation_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
 reserved_start DATE NOT NULL,
 reserved_end DATE NOT NULL,
 parent_active TINYINT UNSIGNED NOT NULL DEFAULT 1,
 PRIMARY KEY (source_kind,source_id),
 KEY idx_mobile_booking_lock_vehicle_window (vehicle_id,parent_active,reserved_start,reserved_end),
 KEY idx_mobile_booking_lock_reservation (reservation_id,vehicle_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
