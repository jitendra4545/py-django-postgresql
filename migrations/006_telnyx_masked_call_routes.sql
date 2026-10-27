-- Incremental Telnyx route metadata. Does not modify the original mobile foundation migration.
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
