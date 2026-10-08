CREATE TABLE IF NOT EXISTS app_schema_migrations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  filename VARCHAR(255) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_schema_migrations_filename (filename)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_service_catalog (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(40) NOT NULL,
  title VARCHAR(191) NOT NULL,
  description TEXT NULL,
  icon_url VARCHAR(500) NULL,
  booking_mode ENUM('INSTANT','MANUAL_REQUEST') NOT NULL,
  legacy_service_id BIGINT UNSIGNED NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_service_catalog_code (code),
  KEY idx_app_service_catalog_legacy (legacy_service_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO app_service_catalog
  (code,title,description,booking_mode,legacy_service_id,is_active,display_order,created_at,updated_at)
VALUES
  ('CHAUFFEUR','Chauffeur Service','Hourly and daily chauffeur service','INSTANT',8,1,10,NOW(),NOW()),
  ('TRANSFER','Transfer','Airport and point-to-point transfers','INSTANT',7,1,20,NOW(),NOW()),
  ('CAR_RENTAL','Car Rental','Luxury self-drive rental','INSTANT',10,1,30,NOW(),NOW()),
  ('AIRPORT_VIP','Airport VIP','Airport VIP assistance submitted for manual confirmation','MANUAL_REQUEST',NULL,1,40,NOW(),NOW()),
  ('CONCIERGE','Concierge','Bespoke concierge request submitted to the concierge team','MANUAL_REQUEST',NULL,1,50,NOW(),NOW())
ON DUPLICATE KEY UPDATE title=VALUES(title),description=VALUES(description),booking_mode=VALUES(booking_mode),legacy_service_id=VALUES(legacy_service_id),is_active=VALUES(is_active),display_order=VALUES(display_order),updated_at=NOW();

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

CREATE TABLE IF NOT EXISTS app_password_reset_tokens (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_password_reset_hash (token_hash),
  KEY idx_app_password_reset_user (user_id),
  CONSTRAINT fk_app_password_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_account_invitations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  email VARCHAR(191) NOT NULL,
  role TINYINT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP NULL,
  created_by_user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_account_invitation_token (token_hash),
  KEY idx_app_account_invitation_user (user_id),
  CONSTRAINT fk_app_account_invitation_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_account_invitation_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
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

CREATE TABLE IF NOT EXISTS app_reservation_meta (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_id INT UNSIGNED NOT NULL,
  service_code VARCHAR(40) NOT NULL,
  source_channel ENUM('CLIENT_APP','AGENCY_AGENT_APP','BACK_OFFICE') NOT NULL,
  created_by_user_id INT UNSIGNED NOT NULL,
  created_by_agent_id INT UNSIGNED NULL,
  lifecycle_status VARCHAR(40) NOT NULL,
  currency_code CHAR(3) NOT NULL DEFAULT 'EUR',
  quote_snapshot_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_reservation_meta_reservation (reservation_id),
  KEY idx_app_reservation_meta_status (lifecycle_status,service_code),
  CONSTRAINT fk_app_reservation_meta_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  CONSTRAINT fk_app_reservation_meta_user FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_app_reservation_meta_agent FOREIGN KEY (created_by_agent_id) REFERENCES agents(id),
  CONSTRAINT fk_app_reservation_meta_quote FOREIGN KEY (quote_snapshot_id) REFERENCES app_quote_snapshots(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_reservation_leg_meta (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_id INT UNSIGNED NOT NULL,
  reservation_details_id INT UNSIGNED NOT NULL,
  sequence_no INT UNSIGNED NOT NULL,
  vehicle_class_id INT UNSIGNED NOT NULL,
  passenger_count INT UNSIGNED NOT NULL DEFAULT 1,
  luggage_count INT UNSIGNED NOT NULL DEFAULT 0,
  pickup_details JSON NOT NULL,
  dropoff_details JSON NULL,
  flight_number VARCHAR(40) NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_reservation_leg_detail (reservation_details_id),
  UNIQUE KEY uq_app_reservation_leg_sequence (reservation_id,sequence_no),
  KEY idx_app_reservation_leg_status (status),
  CONSTRAINT fk_app_reservation_leg_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  CONSTRAINT fk_app_reservation_leg_detail FOREIGN KEY (reservation_details_id) REFERENCES reservation_details(id),
  CONSTRAINT fk_app_reservation_leg_class FOREIGN KEY (vehicle_class_id) REFERENCES vehicle_classes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_driver_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_id INT UNSIGNED NOT NULL,
  reservation_details_id INT UNSIGNED NOT NULL,
  legacy_reservation_driver_id INT UNSIGNED NULL,
  driver_id INT UNSIGNED NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'OFFERED',
  scheduled_start_at DATETIME NOT NULL,
  scheduled_end_at DATETIME NOT NULL,
  acknowledged_at TIMESTAMP NULL,
  declined_at TIMESTAMP NULL,
  decline_reason TEXT NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  assigned_by_user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_app_driver_assignment_driver_schedule (driver_id,scheduled_start_at,scheduled_end_at),
  KEY idx_app_driver_assignment_reservation (reservation_id,reservation_details_id),
  KEY idx_app_driver_assignment_status (status),
  CONSTRAINT fk_app_driver_assignment_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  CONSTRAINT fk_app_driver_assignment_detail FOREIGN KEY (reservation_details_id) REFERENCES reservation_details(id),
  CONSTRAINT fk_app_driver_assignment_legacy FOREIGN KEY (legacy_reservation_driver_id) REFERENCES reservation_drivers(id),
  CONSTRAINT fk_app_driver_assignment_driver FOREIGN KEY (driver_id) REFERENCES drivers(id),
  CONSTRAINT fk_app_driver_assignment_assigner FOREIGN KEY (assigned_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_booking_status_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_id INT UNSIGNED NOT NULL,
  reservation_details_id INT UNSIGNED NULL,
  assignment_id BIGINT UNSIGNED NULL,
  status VARCHAR(40) NOT NULL,
  actor_user_id INT UNSIGNED NULL,
  note TEXT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  occurred_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_app_booking_events_reservation (reservation_id,occurred_at),
  KEY idx_app_booking_events_assignment (assignment_id,occurred_at),
  CONSTRAINT fk_app_booking_event_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  CONSTRAINT fk_app_booking_event_detail FOREIGN KEY (reservation_details_id) REFERENCES reservation_details(id),
  CONSTRAINT fk_app_booking_event_assignment FOREIGN KEY (assignment_id) REFERENCES app_driver_assignments(id),
  CONSTRAINT fk_app_booking_event_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
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
  CONSTRAINT fk_app_driver_location_assignment FOREIGN KEY (assignment_id) REFERENCES app_driver_assignments(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_driver_location_driver FOREIGN KEY (driver_id) REFERENCES drivers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  owner_user_id INT UNSIGNED NOT NULL,
  reservation_id INT UNSIGNED NULL,
  category VARCHAR(50) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  storage_disk ENUM('local','s3') NOT NULL,
  storage_key VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  expires_at DATE NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  deleted_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_app_documents_owner (owner_user_id,category),
  KEY idx_app_documents_reservation (reservation_id),
  CONSTRAINT fk_app_document_owner FOREIGN KEY (owner_user_id) REFERENCES users(id),
  CONSTRAINT fk_app_document_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id)
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
  CONSTRAINT fk_app_driver_expense_assignment FOREIGN KEY (assignment_id) REFERENCES app_driver_assignments(id),
  CONSTRAINT fk_app_driver_expense_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  CONSTRAINT fk_app_driver_expense_driver FOREIGN KEY (driver_id) REFERENCES drivers(id),
  CONSTRAINT fk_app_driver_expense_document FOREIGN KEY (document_id) REFERENCES app_documents(id),
  CONSTRAINT fk_app_driver_expense_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_incidents (
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
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_app_incident_reservation (reservation_id,status),
  KEY idx_app_incident_assignment (assignment_id),
  CONSTRAINT fk_app_incident_assignment FOREIGN KEY (assignment_id) REFERENCES app_driver_assignments(id),
  CONSTRAINT fk_app_incident_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  CONSTRAINT fk_app_incident_reporter FOREIGN KEY (reported_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_app_incident_resolver FOREIGN KEY (resolved_by_user_id) REFERENCES users(id)
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

CREATE TABLE IF NOT EXISTS app_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_user_id INT UNSIGNED NOT NULL,
  message_type ENUM('TEXT','DOCUMENT') NOT NULL DEFAULT 'TEXT',
  body TEXT NULL,
  document_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_app_messages_conversation (conversation_id,created_at),
  CONSTRAINT fk_app_message_conversation FOREIGN KEY (conversation_id) REFERENCES app_conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_message_sender FOREIGN KEY (sender_user_id) REFERENCES users(id),
  CONSTRAINT fk_app_message_document FOREIGN KEY (document_id) REFERENCES app_documents(id)
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

CREATE TABLE IF NOT EXISTS app_notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id INT UNSIGNED NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(191) NOT NULL,
  body TEXT NOT NULL,
  data JSON NULL,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_app_notification_user (user_id,read_at,created_at),
  CONSTRAINT fk_app_notification_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

CREATE TABLE IF NOT EXISTS app_vip_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NOT NULL,
  agency_id INT UNSIGNED NULL,
  created_by_user_id INT UNSIGNED NOT NULL,
  airport VARCHAR(191) NOT NULL,
  terminal VARCHAR(100) NULL,
  service_at DATETIME NOT NULL,
  passenger_count INT UNSIGNED NOT NULL,
  flight_number VARCHAR(40) NULL,
  request_text TEXT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED',
  operations_note TEXT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_app_vip_customer (customer_id,status),
  CONSTRAINT fk_app_vip_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_app_vip_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
  CONSTRAINT fk_app_vip_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_concierge_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id INT UNSIGNED NOT NULL,
  agency_id INT UNSIGNED NULL,
  created_by_user_id INT UNSIGNED NOT NULL,
  category VARCHAR(100) NOT NULL,
  requested_for DATETIME NULL,
  city VARCHAR(191) NULL,
  request_text TEXT NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED',
  operations_note TEXT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_app_concierge_customer (customer_id,status),
  CONSTRAINT fk_app_concierge_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
  CONSTRAINT fk_app_concierge_agency FOREIGN KEY (agency_id) REFERENCES agencies(id),
  CONSTRAINT fk_app_concierge_creator FOREIGN KEY (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
