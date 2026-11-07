/**
 * Database requirements for the legacy-first Drive Luxury mobile API.
 * Matches the checked-in 008/009/010 additive migration contract.
 * This module is intentionally dependency-free: static checks and the DB
 * preflight use the same authoritative manifest.
 *
 * Do NOT silently mutate these definitions without a new migration.
 */
export const additiveColumns = Object.freeze({
  reservations: {
    service_code: 'VARCHAR(40) NULL',
    source_channel: 'VARCHAR(30) NULL',
    created_by_user_id: 'INT UNSIGNED NULL',
    created_by_agent_id: 'INT UNSIGNED NULL',
    lifecycle_status: 'VARCHAR(40) NULL',
    currency_code: 'CHAR(3) NULL',
    quote_snapshot_id: 'BIGINT UNSIGNED NULL',
  },
  reservation_details: {
    sequence_no: 'INT UNSIGNED NULL',
    vehicle_class_id: 'INT UNSIGNED NULL',
    passenger_count: 'INT UNSIGNED NULL',
    luggage_count: 'INT UNSIGNED NULL',
    pickup_details: 'JSON NULL',
    dropoff_details: 'JSON NULL',
    flight_number: 'VARCHAR(40) NULL',
    mobile_leg_status: 'VARCHAR(40) NULL',
  },
  reservation_drivers: {
    mobile_assignment_id: 'BIGINT UNSIGNED NULL',
    mobile_legacy_reservation_driver_id: 'INT UNSIGNED NULL',
    mobile_driver_id: 'INT UNSIGNED NULL',
    mobile_assignment_status: 'VARCHAR(40) NULL',
    mobile_assignment_role: 'VARCHAR(12) NULL',
    scheduled_start_at: 'DATETIME NULL',
    scheduled_end_at: 'DATETIME NULL',
    acknowledged_at: 'TIMESTAMP NULL',
    declined_at: 'TIMESTAMP NULL',
    decline_reason: 'TEXT NULL',
    started_at: 'TIMESTAMP NULL',
    completed_at: 'TIMESTAMP NULL',
    assigned_by_user_id: 'INT UNSIGNED NULL',
  },
  activity_logs: {
    mobile_event_id: 'BIGINT UNSIGNED NULL',
    mobile_reservation_details_id: 'INT UNSIGNED NULL',
    mobile_assignment_id: 'BIGINT UNSIGNED NULL',
    mobile_event_status: 'VARCHAR(40) NULL',
    mobile_note: 'TEXT NULL',
    mobile_latitude: 'DECIMAL(10,7) NULL',
    mobile_longitude: 'DECIMAL(10,7) NULL',
    mobile_occurred_at: 'DATETIME NULL',
  },
  reservation_driver_statuses: {
    mobile_event_id: 'BIGINT UNSIGNED NULL',
    mobile_assignment_id: 'BIGINT UNSIGNED NULL',
  },
  reservation_other_costs: {
    mobile_expense_id: 'BIGINT UNSIGNED NULL',
    mobile_assignment_id: 'BIGINT UNSIGNED NULL',
    mobile_driver_id: 'INT UNSIGNED NULL',
    mobile_category: 'VARCHAR(40) NULL',
    mobile_expense_amount: 'DECIMAL(12,2) NULL',
    mobile_currency: 'CHAR(3) NULL',
    mobile_description: 'TEXT NULL',
    mobile_document_id: 'BIGINT UNSIGNED NULL',
    mobile_expense_status: 'VARCHAR(30) NULL',
    mobile_review_note: 'TEXT NULL',
    mobile_incurred_at: 'DATETIME NULL',
    mobile_reviewed_by_user_id: 'INT UNSIGNED NULL',
    mobile_reviewed_at: 'TIMESTAMP NULL',
  },
});

export const extraRequiredTables = Object.freeze({
  users: ['id','status'],
  drivers: ['id'],
  reservation_vehicle_damages: ['id'],
  services: ['id','title','slug','image','description_en'],
  app_booking_drafts: ['id','created_by_user_id','customer_id','service_code','status','details','revision','quote_snapshot_id','reservation_id','expires_at'],
  app_quote_snapshots: ['id','draft_id','draft_revision','request_hash','quote_data','currency','total_amount','valid_until'],
  app_payment_transactions: ['id','reservation_id','user_id','provider','provider_reference','amount','currency','status','idempotency_key','created_at'],
  app_idempotency_keys: ['id','user_id','scope','idempotency_key','request_hash','response_status','response_body','expires_at'],
  vehicles: ['id','vehicle_class_id','status'],
  reservation_itineraries: ['id','reservation_id','reservation_details_id'],
  reservation_costs: ['id','reservation_id','reservation_details_id','base_rate','total_tax','total_amount'],
  reservation_taxes: ['reservation_id','reservation_details_id'],
  reservation_optional_costs: ['reservation_id','reservation_details_id'],
  reservation_vehicles: ['reservation_id','reservation_details_id','vehicle_id'],
  vehicle_reserved_dates: ['reservation_id','reservation_detail_id','vehicle_id','reserved_date'],
  reservation_insurances: ['reservation_id','reservation_details_id','vehicle_id'],
  reservation_service_incidents: [
    'id','assignment_id','reservation_id','reported_by_user_id','type','severity',
    'description','latitude','longitude','document_ids','status','resolution_note',
    'resolved_by_user_id','reported_at','resolved_at','vehicle_damage_id','created_at','updated_at'
  ],
  app_mobile_assignment_ids: ['id'],
  app_mobile_status_event_ids: ['id'],
  app_mobile_expense_ids: ['id'],
  // These were present in the client's 2026-11-03 website dump.
  activity_logs: ['id','subject_type','subject_id','feature_name','features_id','action','description','user_id','created_at'],
  reservation_driver_statuses: ['id','reservation_id','reservation_details_id','driver_id','status','note','source'],
  reservation_other_costs: ['id','reservation_id','reservation_details_id','amount','type','user_id'],
  reservation_details: ['id','reservation_id','pick_up_location','pick_up_date','pick_up_time','status'],
  reservation_drivers: ['id','reservation_id','reservation_details_id','pick_up_driver_id','drop_off_driver_id'],
  reservations: ['id','reservation_no','service_type','status','payment_status'],
});

/** The order and uniqueness of each index are material, not merely its name. */
export const requiredIndexes = Object.freeze({
  reservations: {
    idx_reservations_mobile_status: { columns: ['lifecycle_status','service_code'], unique: false },
    idx_reservations_mobile_agent: { columns: ['created_by_agent_id'], unique: false },
  },
  reservation_details: {
    uq_reservation_details_mobile_sequence: { columns: ['reservation_id','sequence_no'], unique: true },
  },
  reservation_drivers: {
    uq_res_drivers_mobile_assignment: { columns: ['mobile_assignment_id'], unique: true },
    idx_res_drivers_mobile_schedule: { columns: ['mobile_driver_id','scheduled_start_at','scheduled_end_at'], unique: false },
    idx_res_drivers_mobile_reservation: { columns: ['reservation_id','reservation_details_id','mobile_assignment_status'], unique: false },
  },
  activity_logs: {
    uq_activity_mobile_event: { columns: ['mobile_event_id'], unique: true },
    idx_activity_mobile_timeline: { columns: ['subject_type','subject_id','feature_name','mobile_occurred_at'], unique: false },
  },
  reservation_driver_statuses: {
    uq_rds_mobile_event: { columns: ['mobile_event_id'], unique: true },
  },
  reservation_other_costs: {
    uq_other_costs_mobile_expense: { columns: ['mobile_expense_id'], unique: true },
    idx_other_costs_mobile_assignment: { columns: ['mobile_assignment_id','mobile_expense_status'], unique: false },
  },
  reservation_service_incidents: {
    PRIMARY: { columns: ['id'], unique: true },
    idx_rsi_reservation_status: { columns: ['reservation_id','status'], unique: false },
    idx_rsi_assignment: { columns: ['assignment_id'], unique: false },
    idx_rsi_vehicle_damage: { columns: ['vehicle_damage_id'], unique: false },
  },
  app_mobile_assignment_ids: { PRIMARY: { columns: ['id'], unique: true } },
  app_mobile_status_event_ids: { PRIMARY: { columns: ['id'], unique: true } },
  app_mobile_expense_ids: { PRIMARY: { columns: ['id'], unique: true } },
});

export const requiredIncidentForeignKeys = Object.freeze({
  assignment_id: ['reservation_drivers','mobile_assignment_id'],
  reservation_id: ['reservations','id'],
  reported_by_user_id: ['users','id'],
  resolved_by_user_id: ['users','id'],
  vehicle_damage_id: ['reservation_vehicle_damages','id'],
});

export const idAllocatorTables = Object.freeze([
  'app_mobile_assignment_ids',
  'app_mobile_status_event_ids',
  'app_mobile_expense_ids',
]);

export const mustBeUnsignedBigint = Object.freeze([
  ['reservation_drivers','mobile_assignment_id'],
  ['activity_logs','mobile_event_id'],
  ['reservation_other_costs','mobile_expense_id'],
  ['reservation_driver_statuses','mobile_event_id'],
  ['reservation_driver_statuses','mobile_assignment_id'],
  ...idAllocatorTables.map((table) => [table, 'id']),
]);

/** Optional broader inventory: all mobile app-prefixed tables found in runtime SQL.
 * Run with --all-api; feature-specific external services still need integration testing. */
export const allApiRuntimeTables = Object.freeze([
  'app_account_invitations', 'app_agent_customer_assignments', 'app_api_request_logs',
  'app_booking_cancellation_requests','app_booking_change_requests','app_booking_drafts',
  'app_concierge_requests','app_conversation_participants','app_conversations',
  'app_documents','app_driver_locations','app_idempotency_keys','app_masked_calls',
  'app_messages','app_mobile_assignment_ids','app_mobile_expense_ids','app_mobile_status_event_ids',
  'app_notifications','app_password_reset_tokens','app_payment_transactions',
  'app_payment_webhook_events','app_push_delivery_jobs','app_push_delivery_tickets',
  'app_quote_snapshots','app_refresh_tokens','app_schema_migrations',
  'app_telnyx_call_routes','app_telnyx_webhook_events','app_user_devices',
  'app_user_oauth_accounts','app_vip_requests',
]);
