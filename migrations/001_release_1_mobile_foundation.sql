CREATE TABLE IF NOT EXISTS app_schema_migrations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  filename VARCHAR(255) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_schema_migrations_filename (filename)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

CREATE TABLE IF NOT EXISTS app_booking_status_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  reservation_id INT UNSIGNED NOT NULL,
  reservation_details_id INT UNSIGNED NULL,
  assignment_id INT UNSIGNED NULL,
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
  CONSTRAINT fk_app_booking_event_assignment FOREIGN KEY (assignment_id) REFERENCES reservation_drivers(id),
  CONSTRAINT fk_app_booking_event_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_driver_locations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id INT UNSIGNED NOT NULL,
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
  CONSTRAINT fk_app_driver_location_assignment FOREIGN KEY (assignment_id) REFERENCES reservation_drivers(id) ON DELETE CASCADE,
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
  assignment_id INT UNSIGNED NOT NULL,
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
  CONSTRAINT fk_app_driver_expense_assignment FOREIGN KEY (assignment_id) REFERENCES reservation_drivers(id),
  CONSTRAINT fk_app_driver_expense_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  CONSTRAINT fk_app_driver_expense_driver FOREIGN KEY (driver_id) REFERENCES drivers(id),
  CONSTRAINT fk_app_driver_expense_document FOREIGN KEY (document_id) REFERENCES app_documents(id),
  CONSTRAINT fk_app_driver_expense_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_incidents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id INT UNSIGNED NULL,
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
  CONSTRAINT fk_app_incident_assignment FOREIGN KEY (assignment_id) REFERENCES reservation_drivers(id),
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

-- Read-only compatibility projections over the existing production business tables.
-- Mobile writes target the actual legacy tables directly; these names are VIEWS,
-- not duplicate stores. Existing route SQL can keep its response aliases.

CREATE ALGORITHM=MERGE VIEW app_reservation_meta AS
SELECT r.id AS reservation_id,
       COALESCE(r.service_code,CASE r.service_type WHEN 1 THEN 'CHAUFFEUR'
         WHEN 2 THEN 'CAR_RENTAL' WHEN 3 THEN 'TRANSFER' ELSE NULL END) AS service_code,
       COALESCE(r.source_channel,'BACK_OFFICE') AS source_channel,
       COALESCE(r.created_by_user_id,r.user_id) AS created_by_user_id,
       r.created_by_agent_id,
       CASE WHEN r.status=3 THEN 'CANCELLED'
            WHEN r.status=2 THEN 'COMPLETED'
            WHEN r.lifecycle_status IS NOT NULL THEN r.lifecycle_status
            WHEN r.status=1 THEN 'CONFIRMED' ELSE 'PENDING' END AS lifecycle_status,
       COALESCE(r.currency_code,CASE WHEN r.currency='CHF' THEN 'CHF' ELSE 'EUR' END) AS currency_code,
       r.quote_snapshot_id,r.created_at,r.updated_at
  FROM reservations r;

CREATE VIEW app_reservation_leg_meta AS
SELECT rd.id,rd.reservation_id,rd.id AS reservation_details_id,
       COALESCE(rd.sequence_no,rd.id) AS sequence_no,
       COALESCE(rd.vehicle_class_id,
          (SELECT v.vehicle_class_id FROM reservation_vehicles rv
            JOIN vehicles v ON v.id=rv.vehicle_id
           WHERE rv.reservation_details_id=rd.id AND rv.deleted_at IS NULL
           ORDER BY rv.id DESC LIMIT 1)) AS vehicle_class_id,
       rd.passenger_count,rd.luggage_count,
       COALESCE(rd.pickup_details,JSON_OBJECT('address',rd.pick_up_location,
         'countryId',rd.pick_up_country_id,'cityId',rd.pick_up_city_id)) AS pickup_details,
       COALESCE(rd.dropoff_details,JSON_OBJECT('address',rd.drop_off_location,
         'countryId',rd.drop_off_country_id,'cityId',rd.drop_off_city_id)) AS dropoff_details,
       COALESCE(rd.flight_number,
          (SELECT rf.flight_number FROM reservation_flight_numbers rf
            WHERE rf.reservation_details_id=rd.id ORDER BY rf.id DESC LIMIT 1)) AS flight_number,
       COALESCE(rd.app_leg_status,'PENDING') AS status,
       rd.created_at,rd.updated_at
  FROM reservation_details rd;

CREATE VIEW app_driver_assignments AS
SELECT rdv.id,rdv.reservation_id,rdv.reservation_details_id,
       rdv.id AS legacy_reservation_driver_id,
       COALESCE(rdv.pick_up_driver_id,rdv.drop_off_driver_id) AS driver_id,
       CASE WHEN rdv.status=2 THEN 'CANCELLED'
            WHEN r.status=3 THEN 'CANCELLED'
            WHEN r.status=2 THEN 'COMPLETED'
            ELSE COALESCE(rdv.app_assignment_status,'OFFERED') END AS status,
       COALESCE(rdv.scheduled_start_at,TIMESTAMP(rdv.pick_up_date,rdv.pick_up_time),
         TIMESTAMP(d.pick_up_date,d.pick_up_time)) AS scheduled_start_at,
       COALESCE(rdv.scheduled_end_at,TIMESTAMP(rdv.drop_off_date,rdv.drop_off_time),
         TIMESTAMP(d.drop_off_date,d.drop_off_time)) AS scheduled_end_at,
       rdv.acknowledged_at,rdv.declined_at,rdv.decline_reason,
       rdv.started_at,rdv.completed_at,
       COALESCE(rdv.assigned_by_user_id,rdv.user_id) AS assigned_by_user_id,
       rdv.created_at,rdv.updated_at
  FROM reservation_drivers rdv
  JOIN reservation_details d ON d.id=rdv.reservation_details_id
  JOIN reservations r ON r.id=rdv.reservation_id
 WHERE rdv.deleted_at IS NULL;

-- The original website reservation_messages table owns message rows.
CREATE VIEW app_messages AS
SELECT m.id,c.id AS conversation_id,m.sender_id AS sender_user_id,
       m.message_type,m.body,m.document_id,m.created_at,m.deleted_at
  FROM reservation_messages m
  JOIN app_conversations c ON c.reservation_id=m.reservation_id;

-- Preserve the numeric mobile notification IDs without changing the website UUID PK.
CREATE VIEW app_notifications AS
SELECT n.app_mobile_id AS id,n.notifiable_id AS user_id,
       COALESCE(n.app_type,n.type) AS type,
       COALESCE(n.app_title,IF(JSON_VALID(n.data),JSON_UNQUOTE(JSON_EXTRACT(n.data,'$.title')),NULL),'Notification') AS title,
       COALESCE(n.app_body,IF(JSON_VALID(n.data),JSON_UNQUOTE(JSON_EXTRACT(n.data,'$.message')),NULL),'') AS body,
       n.data,n.read_at,n.created_at
  FROM notifications n
 WHERE n.notifiable_type='App\\Models\\User' OR n.app_type IS NOT NULL;

-- Service mapping is a read-only projection. Website services remain
-- authoritative for descriptions, and numeric booking service_type is 1/2/3.
CREATE VIEW app_service_catalog AS
SELECT 'CHAUFFEUR' AS code,'Chauffeur Service' AS title,
       COALESCE((SELECT NULLIF(description_en,'') FROM services WHERE id=8),
                'Hourly and daily chauffeur service') AS description,
       (SELECT image FROM services WHERE id=8) AS icon_url,
       'INSTANT' AS booking_mode,1 AS legacy_service_id,1 AS is_active,10 AS display_order
UNION ALL
SELECT 'TRANSFER','Transfer',
       COALESCE((SELECT NULLIF(description_en,'') FROM services WHERE id=7),
                'Airport and point-to-point transfers'),
       (SELECT image FROM services WHERE id=7),'INSTANT',3,1,20
UNION ALL
SELECT 'CAR_RENTAL','Car Rental',
       COALESCE((SELECT NULLIF(description_en,'') FROM services WHERE id=10),
                'Luxury self-drive rental'),
       (SELECT image FROM services WHERE id=10),'INSTANT',2,1,30
UNION ALL
SELECT 'AIRPORT_VIP','Airport VIP',
       'Airport VIP assistance submitted for manual confirmation',NULL,
       'MANUAL_REQUEST',NULL,1,40
UNION ALL
SELECT 'CONCIERGE','Concierge',
       'Bespoke concierge request submitted to the concierge team',NULL,
       'MANUAL_REQUEST',NULL,1,50;
