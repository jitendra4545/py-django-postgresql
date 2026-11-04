import { createHash } from 'node:crypto';

// Immutable migration. Do not edit after applying it: migrate.js validates its
// checksum. SQL DDL implicitly commits; every step is independently resumable.
// An external database snapshot and a write-maintenance window for BOTH apps
// are mandatory. No original client column/index/table is removed or renamed.
export const migrationName = '008_shared_client_storage.js';
export const retiredTables = Object.freeze([
  'app_reservation_meta', 'app_reservation_leg_meta', 'app_driver_assignments',
  'app_messages', 'app_notifications', 'app_api_request_logs',
  'app_vip_requests', 'app_concierge_requests',
]);

export const addedColumns = Object.freeze({
  reservations: {
    mobile_service_code: 'VARCHAR(40) NULL', mobile_source_channel: 'VARCHAR(30) NULL',
    mobile_created_by_user_id: 'INT UNSIGNED NULL', mobile_created_by_agent_id: 'INT UNSIGNED NULL',
    mobile_lifecycle_status: 'VARCHAR(40) NULL', mobile_currency_code: 'CHAR(3) NULL',
    mobile_quote_snapshot_id: 'BIGINT UNSIGNED NULL', mobile_legacy_status: 'INT NULL',
    mobile_created_at: 'DATETIME NULL', mobile_updated_at: 'DATETIME NULL', mobile_storage_version: 'TINYINT UNSIGNED NULL',
  },
  reservation_details: {
    mobile_sequence_no: 'INT UNSIGNED NULL', mobile_vehicle_class_id: 'INT UNSIGNED NULL',
    mobile_passenger_count: 'INT UNSIGNED NULL', mobile_luggage_count: 'INT UNSIGNED NULL',
    mobile_pickup_details: 'JSON NULL', mobile_dropoff_details: 'JSON NULL',
    mobile_leg_status: 'VARCHAR(40) NULL', mobile_status_synced_trip_id: 'BIGINT UNSIGNED NULL',
    mobile_created_at: 'DATETIME NULL', mobile_updated_at: 'DATETIME NULL', mobile_storage_version: 'TINYINT UNSIGNED NULL',
  },
  reservation_itineraries: { mobile_full_address: 'VARCHAR(500) NULL' },
  reservation_flight_numbers: { mobile_entry_key: 'VARCHAR(80) NULL' },
  reservation_drivers: {
    mobile_assignment_id: 'BIGINT UNSIGNED NULL', mobile_assignment_status: 'VARCHAR(40) NULL',
    mobile_status_driver_id: 'INT UNSIGNED NULL',
    mobile_assigned_by_user_id: 'INT UNSIGNED NULL', mobile_acknowledged_at: 'DATETIME NULL',
    mobile_declined_at: 'DATETIME NULL', mobile_decline_reason: 'TEXT NULL',
    mobile_started_at: 'DATETIME NULL', mobile_completed_at: 'DATETIME NULL',
    mobile_created_at: 'DATETIME NULL', mobile_updated_at: 'DATETIME NULL',
  },
  reservation_messages: {
    mobile_message_id: 'BIGINT UNSIGNED NULL', mobile_message_type: 'VARCHAR(16) NULL',
    mobile_document_id: 'BIGINT UNSIGNED NULL',
  },
  notifications: { mobile_id: 'BIGINT UNSIGNED NULL', mobile_origin: 'VARCHAR(20) NULL' },
  contacts: {
    mobile_request_type: 'VARCHAR(30) NULL', mobile_request_id: 'BIGINT UNSIGNED NULL',
    mobile_customer_id: 'INT UNSIGNED NULL', mobile_agency_id: 'INT UNSIGNED NULL',
    mobile_created_by_user_id: 'INT UNSIGNED NULL', mobile_terminal: 'VARCHAR(100) NULL',
    mobile_category: 'VARCHAR(100) NULL', mobile_request_text_null: 'TINYINT(1) NOT NULL DEFAULT 0',
    mobile_request_status: 'VARCHAR(30) NULL', mobile_operations_note: 'TEXT NULL',
  },
  route_access_logs: {
    mobile_request_id: 'CHAR(36) NULL', mobile_request_path: 'VARCHAR(512) NULL',
    mobile_access_line: 'VARCHAR(800) NULL', mobile_duration_ms: 'DECIMAL(12,3) NULL',
    mobile_response_body: 'JSON NULL', mobile_actor_user_id: 'BIGINT UNSIGNED NULL', mobile_actor_role: 'SMALLINT NULL',
    mobile_response_content_type: 'VARCHAR(120) NULL', mobile_response_bytes: 'BIGINT UNSIGNED NULL',
    mobile_error_code: 'VARCHAR(120) NULL', mobile_source: 'VARCHAR(30) NULL',
    mobile_created_at: 'DATETIME(3) NULL',
  },
});

export const addedIndexes = Object.freeze([
  ['reservation_drivers', 'uq_dl_mobile_assignment', '(mobile_assignment_id)', true],
  ['reservation_messages', 'uq_dl_mobile_message', '(mobile_message_id)', true],
  ['notifications', 'uq_dl_mobile_notification', '(mobile_id)', true],
  ['reservation_flight_numbers', 'uq_dl_mobile_flight', '(mobile_entry_key)', true],
  ['contacts', 'uq_dl_mobile_request', '(mobile_request_type,mobile_request_id)', true],
  ['route_access_logs', 'uq_dl_mobile_request_log', '(mobile_request_id)', true],
  ['route_access_logs', 'idx_dl_mobile_log_retention', '(mobile_source,created_at)', false],
  ['reservations', 'idx_dl_mobile_reservation_status', '(mobile_lifecycle_status,mobile_service_code)', false],
  ['reservation_details', 'idx_dl_mobile_leg_order', '(reservation_id,deleted_at,id)', false],
  ['reservation_drivers', 'idx_dl_mobile_pickup_schedule', '(pick_up_driver_id,status,pick_up_date)', false],
  ['reservation_drivers', 'idx_dl_mobile_dropoff_schedule', '(drop_off_driver_id,status,drop_off_date)', false],
]);

const ident = (name) => {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`);
  return `\`${name}\``;
};
const rows = async (db, sql, params = []) => (await db.query(sql, params))[0];
const scalar = async (db, sql, params = []) => Number(Object.values((await rows(db, sql, params))[0] ?? { value: 0 })[0] ?? 0);
const tableExists = async (db, name) => (await scalar(db,
  'SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?', [name])) > 0;
const columnInfo = async (db, table, column) => (await rows(db,
  `SELECT DATA_TYPE AS dataType,COLUMN_TYPE AS columnType,IS_NULLABLE AS nullable,EXTRA AS extra
     FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?`,
  [table, column]))[0];

export const stableNotificationUuid = (id) => {
  const hash = createHash('sha256').update(`drive-luxury/shared-notification/v1/${id}`).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
};

export const chooseNotificationModel = (types, explicit = '') => {
  if (explicit) {
    if (!/^[A-Za-z_][A-Za-z0-9_\\]{0,190}$/.test(explicit)) throw new Error('Invalid LEGACY_NOTIFICATION_NOTIFIABLE_TYPE');
    return explicit;
  }
  const unique = [...new Set(types)].filter((value) => /(?:^|\\)User$/.test(value));
  if (unique.length === 1) return unique[0];
  throw new Error('Set LEGACY_NOTIFICATION_NOTIFIABLE_TYPE to the client User model morph name (for example App\\Models\\User). No unambiguous existing User discriminator was found.');
};

export const compatibleExtensionColumn = (existing, definition, table, name) => {
  const expected = definition.split(/[ (]/)[0].toLowerCase();
  if (existing.dataType !== expected && !(expected === 'json' && existing.dataType === 'longtext')) return false;
  const width = /^(?:VAR)?CHAR\((\d+)\)/i.exec(definition);
  const actualWidth = /^(?:var)?char\((\d+)\)/i.exec(existing.columnType);
  if (width && (!actualWidth || Number(actualWidth[1]) < Number(width[1]))) return false;
  if (['int', 'bigint', 'smallint', 'tinyint'].includes(expected) &&
      /unsigned/i.test(definition) !== /unsigned/i.test(existing.columnType)) return false;
  if (/ NULL$/.test(definition) && existing.nullable !== 'YES' &&
      !(table === 'notifications' && name === 'mobile_id' && String(existing.extra).includes('auto_increment'))) return false;
  return true;
};

export const preflight = async (db, options = {}) => {
  const report = { migration: migrationName, blockers: [], warnings: [], sourceRows: {}, notificationModel: null };
  const required = [...Object.keys(addedColumns), 'app_settings', 'reservation_statuses',
    'reservation_message_recipients', 'reservation_message_attachments', 'reservation_driver_statuses',
    'app_conversations', 'app_conversation_participants', 'app_push_delivery_jobs', ...retiredTables];
  for (const name of required) {
    if (!(await tableExists(db, name))) report.blockers.push(`Required table is missing: ${name}. Run migrations 001-007 first.`);
  }
  if (report.blockers.length) return report;
  const [engines] = await db.query(`SELECT TABLE_NAME AS name,ENGINE AS engine FROM information_schema.tables
    WHERE table_schema=DATABASE() AND TABLE_NAME IN (${Object.keys(addedColumns).map(() => '?').join(',')})`, Object.keys(addedColumns));
  for (const row of engines) if (row.engine !== 'InnoDB') report.blockers.push(`Canonical table ${row.name} must use InnoDB; found ${row.engine}`);
  for (const [table, definitions] of Object.entries(addedColumns)) {
    for (const [name, definition] of Object.entries(definitions)) {
      const existing = await columnInfo(db, table, name);
      if (existing && !compatibleExtensionColumn(existing, definition, table, name))
        report.blockers.push(`Existing extension column conflicts with the migration: ${table}.${name} (${existing.columnType})`);
    }
  }
  for (const source of retiredTables) report.sourceRows[source] = await scalar(db, `SELECT COUNT(*) FROM ${ident(source)}`);
  const [settings] = await db.query("SELECT option_value FROM app_settings WHERE option_key='dl.mobile.notification_model' ORDER BY id");
  if (settings.length > 1) report.blockers.push('Duplicate dl.mobile.notification_model settings require manual reconciliation.');
  try {
    const types = (await rows(db, 'SELECT DISTINCT notifiable_type FROM notifications')).map((row) => row.notifiable_type);
    const explicit = options.notificationModel || settings[0]?.option_value || '';
    report.notificationModel = chooseNotificationModel(types, explicit);
    if (settings[0] && settings[0].option_value !== report.notificationModel) report.blockers.push('The previously persisted notification discriminator must not change during a retry.');
    if (!types.includes(report.notificationModel)) report.warnings.push('The notification morph name has no existing row in this dump; confirm it against the client User model before deployment.');
  } catch (error) { report.blockers.push(error.message); }
  const hasAssignmentAlias = Boolean(await columnInfo(db, 'reservation_drivers', 'mobile_assignment_id'));
  const retryAssignmentGuard = hasAssignmentAlias ? ' AND COALESCE(d.mobile_assignment_id,0)<>a.id' : '';
  const checks = [
    ['Orphan reservation metadata', `SELECT COUNT(*) FROM app_reservation_meta a LEFT JOIN reservations r ON r.id=a.reservation_id WHERE r.id IS NULL`],
    ['Orphan or mismatched leg metadata', `SELECT COUNT(*) FROM app_reservation_leg_meta a LEFT JOIN reservation_details d ON d.id=a.reservation_details_id WHERE d.id IS NULL OR d.reservation_id<>a.reservation_id`],
    ['Multiple mobile assignments point to one legacy driver row', `SELECT COUNT(*) FROM (SELECT legacy_reservation_driver_id FROM app_driver_assignments WHERE legacy_reservation_driver_id IS NOT NULL GROUP BY legacy_reservation_driver_id HAVING COUNT(*)>1) duplicates`],
    ['Assignment mapping contradicts the client row', `SELECT COUNT(*) FROM app_driver_assignments a LEFT JOIN reservation_drivers d ON d.id=a.legacy_reservation_driver_id WHERE a.legacy_reservation_driver_id IS NOT NULL AND (d.id IS NULL OR d.reservation_id<>a.reservation_id OR d.reservation_details_id<>a.reservation_details_id OR COALESCE(d.pick_up_driver_id,d.drop_off_driver_id,0)<>a.driver_id)`],
    ['Assignment without a legacy mapping overlaps an existing matching legacy row', `SELECT COUNT(*) FROM app_driver_assignments a WHERE a.legacy_reservation_driver_id IS NULL AND EXISTS (SELECT 1 FROM reservation_drivers d WHERE d.reservation_id=a.reservation_id AND d.reservation_details_id=a.reservation_details_id AND (d.pick_up_driver_id=a.driver_id OR d.drop_off_driver_id=a.driver_id)${retryAssignmentGuard})`],
    ['Mobile and legacy assignment start times disagree', `SELECT COUNT(*) FROM app_driver_assignments a JOIN reservation_drivers d ON d.id=a.legacy_reservation_driver_id WHERE d.pick_up_date IS NOT NULL AND d.pick_up_time IS NOT NULL AND TIMESTAMP(d.pick_up_date,d.pick_up_time)<>a.scheduled_start_at`],
    ['Mobile and legacy assignment end times disagree', `SELECT COUNT(*) FROM app_driver_assignments a JOIN reservation_drivers d ON d.id=a.legacy_reservation_driver_id WHERE d.drop_off_date IS NOT NULL AND d.drop_off_time IS NOT NULL AND TIMESTAMP(d.drop_off_date,d.drop_off_time)<>a.scheduled_end_at`],
    ['Messages have no reservation conversation', `SELECT COUNT(*) FROM app_messages m LEFT JOIN app_conversations c ON c.id=m.conversation_id LEFT JOIN reservations r ON r.id=c.reservation_id WHERE c.id IS NULL OR r.id IS NULL`],
    ['Native notification data is not valid JSON', `SELECT COUNT(*) FROM notifications WHERE NOT JSON_VALID(data)`],
    ['Native driver rows have no valid leg', `SELECT COUNT(*) FROM reservation_drivers d LEFT JOIN reservation_details l ON l.id=d.reservation_details_id WHERE l.id IS NULL AND d.deleted_at IS NULL AND d.status=1`],
  ];
  for (const [label, sql] of checks) {
    const count = await scalar(db, sql);
    if (count) report.blockers.push(`${label}: ${count} row(s). Resolve explicitly; this migration will not guess.`);
  }
  for (const table of ['app_driver_assignments', 'app_messages', 'app_notifications', 'app_vip_requests', 'app_concierge_requests']) {
    const maximum = await scalar(db, `SELECT COALESCE(MAX(id),0) FROM ${ident(table)}`);
    if (!Number.isSafeInteger(maximum)) report.blockers.push(`${table} contains an ID outside JavaScript's safe numeric API range.`);
  }
  // These are existing public identifiers. They are never reused or renumbered.
  const reservations = await scalar(db, 'SELECT COUNT(*) FROM reservations');
  const bothDrivers = await scalar(db, 'SELECT COUNT(*) FROM reservation_drivers WHERE pick_up_driver_id IS NOT NULL AND drop_off_driver_id IS NOT NULL AND pick_up_driver_id<>drop_off_driver_id AND deleted_at IS NULL');
  if (bothDrivers) report.warnings.push(`${bothDrivers} legacy rows contain distinct pickup/dropoff drivers. Both block availability; the existing mobile single-assignment screen represents the primary driver only.`);
  report.warnings.push(`${reservations} existing reservations will be readable through projections, subject to unchanged authorization checks.`);
  report.warnings.push('The PHP writer must honor the same reservation/driver locks for cross-application race protection; this backend cannot change unprovided PHP code.');
  report.warnings.push('Retired app tables are retained as inactive migration snapshots. Do not write to them or run the old backend after cutover.');
  return report;
};

const addColumn = async (db, table, name, definition) => {
  const existing = await columnInfo(db, table, name);
  if (!existing) {
    await db.query(`ALTER TABLE ${ident(table)} ADD COLUMN ${ident(name)} ${definition}`);
    return;
  }
  if (!compatibleExtensionColumn(existing, definition, table, name)) {
    throw new Error(`Refusing to overwrite incompatible ${table}.${name}: ${existing.columnType}`);
  }
};
const addIndex = async (db, [table, name, columns, unique]) => {
  const existing = await rows(db, `SELECT COLUMN_NAME AS name,NON_UNIQUE AS nonUnique FROM information_schema.statistics
    WHERE table_schema=DATABASE() AND table_name=? AND index_name=? ORDER BY seq_in_index`, [table, name]);
  if (existing.length) {
    const expected = columns.slice(1, -1).split(',');
    if (existing.map((row) => row.name).join(',') !== expected.join(',') || Boolean(existing[0].nonUnique) === unique) {
      throw new Error(`Conflicting index ${table}.${name}`);
    }
    return;
  }
  await db.query(`ALTER TABLE ${ident(table)} ADD ${unique ? 'UNIQUE ' : ''}INDEX ${ident(name)} ${columns}`);
};

const reserveNativeIdRange = async (db, table, publicColumn, unsignedInt = false) => {
  const maximum = await scalar(db, `SELECT GREATEST(COALESCE(MAX(id),0),COALESCE(MAX(${ident(publicColumn)}),0)) FROM ${ident(table)}`);
  if (!Number.isSafeInteger(maximum) || (unsignedInt && maximum >= 4294967294)) {
    throw new Error(`Cannot reserve an unchanged numeric ID range for ${table}; manual ID mapping is required.`);
  }
  await db.query(`ALTER TABLE ${ident(table)} AUTO_INCREMENT=${maximum + 1}`);
};

const assignMissingPublicIds = async (db, table, idColumn, publicColumn, minimum = 0) => {
  let maximum = Math.max(minimum, await scalar(db, `SELECT COALESCE(MAX(${ident(publicColumn)}),0) FROM ${ident(table)}`));
  // Keyset batches avoid loading the client's complete table into Node memory.
  while (true) {
    const batch = await rows(db, `SELECT ${ident(idColumn)} AS id FROM ${ident(table)} WHERE ${ident(publicColumn)} IS NULL ORDER BY ${ident(idColumn)} LIMIT 500`);
    if (!batch.length) break;
    for (const row of batch) {
      maximum += 1;
      if (!Number.isSafeInteger(maximum)) throw new Error(`Unsafe API identifier in ${table}`);
      await db.execute(`UPDATE ${ident(table)} SET ${ident(publicColumn)}=? WHERE ${ident(idColumn)}=? AND ${ident(publicColumn)} IS NULL`, [maximum, row.id]);
    }
  }
};

const copyHeaderAndLegMetadata = async (db) => {
  await db.query(`UPDATE reservations r JOIN app_reservation_meta a ON a.reservation_id=r.id
    SET r.mobile_service_code=a.service_code,r.mobile_source_channel=a.source_channel,
        r.mobile_created_by_user_id=a.created_by_user_id,r.mobile_created_by_agent_id=a.created_by_agent_id,
        r.mobile_lifecycle_status=a.lifecycle_status,r.mobile_currency_code=a.currency_code,
        r.mobile_quote_snapshot_id=a.quote_snapshot_id,r.mobile_legacy_status=r.status,
        r.mobile_created_at=a.created_at,r.mobile_updated_at=a.updated_at,r.mobile_storage_version=1
    WHERE r.mobile_storage_version IS NULL`);
  await db.query(`UPDATE reservation_details d JOIN app_reservation_leg_meta a ON a.reservation_details_id=d.id
    SET d.mobile_sequence_no=a.sequence_no,d.mobile_vehicle_class_id=a.vehicle_class_id,
        d.mobile_passenger_count=a.passenger_count,d.mobile_luggage_count=a.luggage_count,
        d.mobile_pickup_details=a.pickup_details,d.mobile_dropoff_details=a.dropoff_details,
        d.mobile_leg_status=a.status,d.mobile_status_synced_trip_id=d.trip_status_id,
        d.mobile_created_at=a.created_at,d.mobile_updated_at=a.updated_at,d.mobile_storage_version=1
    WHERE d.mobile_storage_version IS NULL`);
  await db.query(`INSERT INTO reservation_flight_numbers
      (reservation_id,reservation_details_id,flight_number,mobile_entry_key,created_at,updated_at)
    SELECT a.reservation_id,a.reservation_details_id,a.flight_number,
           CONCAT('mobile-leg:',a.reservation_details_id),a.created_at,a.updated_at
      FROM app_reservation_leg_meta a
     WHERE a.flight_number IS NOT NULL AND NOT EXISTS (SELECT 1 FROM reservation_flight_numbers f WHERE f.mobile_entry_key=CONCAT('mobile-leg:',a.reservation_details_id))`);
};

const copyAssignments = async (db) => {
  // Existing client primary keys are never changed. The old public ID is a new,
  // unique alias, so GPS/incident/expense/status references remain unchanged.
  await db.query(`UPDATE reservation_drivers d JOIN app_driver_assignments a ON a.legacy_reservation_driver_id=d.id
    SET d.mobile_assignment_id=a.id,d.mobile_assignment_status=a.status,d.mobile_status_driver_id=a.driver_id,
        d.mobile_assigned_by_user_id=a.assigned_by_user_id,d.mobile_acknowledged_at=a.acknowledged_at,
        d.mobile_declined_at=a.declined_at,d.mobile_decline_reason=a.decline_reason,
        d.mobile_started_at=a.started_at,d.mobile_completed_at=a.completed_at,
        d.mobile_created_at=a.created_at,d.mobile_updated_at=a.updated_at,
        d.pick_up_date=COALESCE(d.pick_up_date,DATE(a.scheduled_start_at)),
        d.pick_up_time=COALESCE(d.pick_up_time,TIME(a.scheduled_start_at)),
        d.drop_off_date=COALESCE(d.drop_off_date,DATE(a.scheduled_end_at)),
        d.drop_off_time=COALESCE(d.drop_off_time,TIME(a.scheduled_end_at)),
        d.status=CASE WHEN a.status IN ('CANCELLED','DECLINED') THEN 2 ELSE d.status END
    WHERE d.mobile_assignment_id IS NULL`);
  await db.query(`INSERT INTO reservation_drivers
      (reservation_id,reservation_details_id,pick_up_date,pick_up_time,pick_up_driver_id,
       drop_off_date,drop_off_time,user_id,status,mobile_assignment_id,mobile_assignment_status,mobile_status_driver_id,
       mobile_assigned_by_user_id,mobile_acknowledged_at,mobile_declined_at,mobile_decline_reason,
       mobile_started_at,mobile_completed_at,mobile_created_at,mobile_updated_at,created_at,updated_at)
    SELECT a.reservation_id,a.reservation_details_id,DATE(a.scheduled_start_at),TIME(a.scheduled_start_at),a.driver_id,
           DATE(a.scheduled_end_at),TIME(a.scheduled_end_at),a.assigned_by_user_id,
           IF(a.status IN ('CANCELLED','DECLINED'),2,1),a.id,a.status,a.driver_id,a.assigned_by_user_id,
           a.acknowledged_at,a.declined_at,a.decline_reason,a.started_at,a.completed_at,
           a.created_at,a.updated_at,a.created_at,a.updated_at
      FROM app_driver_assignments a WHERE a.legacy_reservation_driver_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM reservation_drivers d WHERE d.mobile_assignment_id=a.id)`);
  const oldMaximum = await scalar(db, 'SELECT COALESCE(MAX(id),0) FROM app_driver_assignments');
  await assignMissingPublicIds(db, 'reservation_drivers', 'id', 'mobile_assignment_id', oldMaximum);
  await reserveNativeIdRange(db, 'reservation_drivers', 'mobile_assignment_id', true);
};

const copyMessages = async (db) => {
  await db.query(`INSERT INTO reservation_messages
      (reservation_id,sender_id,body,mobile_message_id,mobile_message_type,mobile_document_id,created_at,updated_at,deleted_at)
    SELECT c.reservation_id,m.sender_user_id,m.body,m.id,m.message_type,m.document_id,m.created_at,m.created_at,m.deleted_at
      FROM app_messages m JOIN app_conversations c ON c.id=m.conversation_id
     WHERE NOT EXISTS (SELECT 1 FROM reservation_messages r WHERE r.mobile_message_id=m.id)`);
  const oldMaximum = await scalar(db, 'SELECT COALESCE(MAX(id),0) FROM app_messages');
  await assignMissingPublicIds(db, 'reservation_messages', 'id', 'mobile_message_id', oldMaximum);
  await reserveNativeIdRange(db, 'reservation_messages', 'mobile_message_id');
  await db.query(`INSERT INTO reservation_message_recipients
      (reservation_message_id,user_id,read_at,created_at,updated_at)
    SELECT rm.id,p.user_id,IF(p.last_read_at>=am.created_at,p.last_read_at,NULL),am.created_at,am.created_at
      FROM app_messages am JOIN reservation_messages rm ON rm.mobile_message_id=am.id
      JOIN app_conversation_participants p ON p.conversation_id=am.conversation_id
     WHERE p.user_id<>am.sender_user_id AND p.joined_at<=am.created_at
       AND (p.left_at IS NULL OR p.left_at>am.created_at)
       AND NOT EXISTS (SELECT 1 FROM reservation_message_recipients mr WHERE mr.reservation_message_id=rm.id AND mr.user_id=p.user_id)`);
  await db.query(`INSERT INTO reservation_message_attachments
      (reservation_message_id,disk,path,original_name,mime_type,size,created_at,updated_at)
    SELECT rm.id,d.storage_disk,d.storage_key,LEFT(d.original_name,191),d.mime_type,d.size_bytes,rm.created_at,rm.updated_at
      FROM reservation_messages rm JOIN app_documents d ON d.id=rm.mobile_document_id
     WHERE d.storage_disk='spaces' AND d.deleted_at IS NULL AND CHAR_LENGTH(d.storage_key)<=191
       AND NOT EXISTS (SELECT 1 FROM reservation_message_attachments a WHERE a.reservation_message_id=rm.id AND a.disk=d.storage_disk AND a.path=d.storage_key)`);
};

const copyNotifications = async (db, model) => {
  let lastId = 0;
  while (true) {
    const batch = await rows(db, 'SELECT * FROM app_notifications WHERE id>? ORDER BY id LIMIT 500', [lastId]);
    if (!batch.length) break;
    for (const item of batch) {
      const exists = await scalar(db, 'SELECT COUNT(*) FROM notifications WHERE mobile_id=?', [item.id]);
      if (!exists) {
        const data = typeof item.data === 'string' ? JSON.parse(item.data) : item.data;
        await db.execute(`INSERT INTO notifications
          (id,type,notifiable_type,notifiable_id,data,read_at,created_at,updated_at,mobile_id,mobile_origin)
          VALUES (?,?,?,?,?,?,?,?,?,'MOBILE_API')`,
        [stableNotificationUuid(item.id), item.type, model, item.user_id,
          JSON.stringify({ title: item.title, body: item.body, data }), item.read_at,
          item.created_at, item.created_at, item.id]);
      }
      lastId = item.id;
    }
  }
  const oldMaximum = await scalar(db, 'SELECT COALESCE(MAX(id),0) FROM app_notifications');
  await assignMissingPublicIds(db, 'notifications', 'id', 'mobile_id', oldMaximum);
  const info = await columnInfo(db, 'notifications', 'mobile_id');
  if (!String(info.extra).includes('auto_increment')) {
    await db.query('ALTER TABLE notifications MODIFY COLUMN mobile_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT');
  }
};

const copyManualRequests = async (db) => {
  await db.query(`INSERT INTO contacts
      (first_name,last_name,email,phone,subject,message_details,service_type,pickup_location,pickup_date,pickup_time,
       number_of_passengers,flight_train_number,mobile_request_type,mobile_request_id,mobile_customer_id,
       mobile_agency_id,mobile_created_by_user_id,mobile_terminal,mobile_request_text_null,
       mobile_request_status,mobile_operations_note,created_at,updated_at)
    SELECT c.full_name,LEFT(c.last_name,191),COALESCE(c.email,''),c.phone_no,'Airport VIP request',COALESCE(a.request_text,''),
           'AIRPORT_VIP',a.airport,DATE(a.service_at),TIME(a.service_at),a.passenger_count,a.flight_number,
           'AIRPORT_VIP',a.id,a.customer_id,a.agency_id,a.created_by_user_id,a.terminal,
           IF(a.request_text IS NULL,1,0),a.status,a.operations_note,a.created_at,a.updated_at
      FROM app_vip_requests a JOIN customers c ON c.id=a.customer_id
     WHERE NOT EXISTS (SELECT 1 FROM contacts x WHERE x.mobile_request_type='AIRPORT_VIP' AND x.mobile_request_id=a.id)`);
  await db.query(`INSERT INTO contacts
      (first_name,last_name,email,phone,subject,message_details,service_type,pickup_date,pickup_time,pick_up_city,
       mobile_request_type,mobile_request_id,mobile_customer_id,mobile_agency_id,mobile_created_by_user_id,
       mobile_category,mobile_request_status,mobile_operations_note,created_at,updated_at)
    SELECT c.full_name,LEFT(c.last_name,191),COALESCE(c.email,''),c.phone_no,'Concierge request',a.request_text,
           'CONCIERGE',DATE(a.requested_for),TIME(a.requested_for),a.city,
           'CONCIERGE',a.id,a.customer_id,a.agency_id,a.created_by_user_id,a.category,
           a.status,a.operations_note,a.created_at,a.updated_at
      FROM app_concierge_requests a JOIN customers c ON c.id=a.customer_id
     WHERE NOT EXISTS (SELECT 1 FROM contacts x WHERE x.mobile_request_type='CONCIERGE' AND x.mobile_request_id=a.id)`);
  await reserveNativeIdRange(db, 'contacts', 'mobile_request_id', true);
};

const copyAuditLogs = async (db) => {
  await db.query(`INSERT INTO route_access_logs
      (user_id,feature_name,method,uri,query_params,request_body,ip_address,user_agent,status_code,duration_ms,created_at,
       mobile_request_id,mobile_request_path,mobile_access_line,mobile_duration_ms,mobile_response_body,mobile_actor_user_id,mobile_actor_role,
       mobile_response_content_type,mobile_response_bytes,mobile_error_code,mobile_source,mobile_created_at)
    SELECT u.id,'mobile_api',a.method,LEFT(a.request_path,500),a.request_query,a.request_body,a.client_ip,a.user_agent,
           a.http_status,ROUND(a.duration_ms),a.created_at,a.request_id,a.request_path,a.access_line,a.duration_ms,
           a.response_body,a.actor_user_id,a.actor_role,a.response_content_type,a.response_bytes,a.error_code,'MOBILE_API',a.created_at
      FROM app_api_request_logs a LEFT JOIN users u ON u.id=a.actor_user_id
     WHERE NOT EXISTS (SELECT 1 FROM route_access_logs l WHERE l.mobile_request_id=a.request_id)`);
};

const rebindForeignKeys = async (db, source, target, targetColumn) => {
  const constraints = await rows(db, `SELECT k.TABLE_NAME AS tableName,k.CONSTRAINT_NAME AS constraintName,
      k.COLUMN_NAME AS columnName,r.UPDATE_RULE AS onUpdate,r.DELETE_RULE AS onDelete
    FROM information_schema.KEY_COLUMN_USAGE k
    JOIN information_schema.REFERENTIAL_CONSTRAINTS r
      ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.TABLE_NAME=k.TABLE_NAME AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME
    WHERE k.CONSTRAINT_SCHEMA=DATABASE() AND k.REFERENCED_TABLE_NAME=?`, [source]);
  for (const constraint of constraints) {
    if (!constraint.tableName.startsWith('app_')) {
      throw new Error(`Unexpected client foreign key ${constraint.tableName}.${constraint.constraintName}; manual review required`);
    }
    const rules = new Set(['CASCADE', 'RESTRICT', 'NO ACTION', 'SET NULL']);
    if (!rules.has(constraint.onUpdate) || !rules.has(constraint.onDelete)) throw new Error('Unsupported foreign-key action');
    await db.query(`ALTER TABLE ${ident(constraint.tableName)} DROP FOREIGN KEY ${ident(constraint.constraintName)},
      ADD CONSTRAINT ${ident(constraint.constraintName)} FOREIGN KEY (${ident(constraint.columnName)})
      REFERENCES ${ident(target)} (${ident(targetColumn)}) ON UPDATE ${constraint.onUpdate} ON DELETE ${constraint.onDelete}`);
  }
};

// Every projection keeps the original mobile SQL column names. These views
// contain no independently stored booking/message/notification records.
export const viewDefinitions = (notificationModel) => {
  // A hex literal is independent of NO_BACKSLASH_ESCAPES, and cannot inject SQL.
  const model = `CONVERT(0x${Buffer.from(notificationModel, 'utf8').toString('hex')} USING utf8mb4)`;
  const legacyStatus = "CASE r.status WHEN 1 THEN 'CONFIRMED' WHEN 2 THEN 'COMPLETED' WHEN 3 THEN 'CANCELLED' ELSE 'PENDING_CONFIRMATION' END";
  const tripStatuses = "'PENDING','OFFERED','ACKNOWLEDGED','PREPARING','ON_THE_WAY','ARRIVED','WAITING','PASSENGER_ONBOARD','IN_SERVICE','AT_STOP','DROPOFF_REACHED','COMPLETED','NO_SHOW','DECLINED','CANCELLED'";
  const pickup = `CASE
    WHEN d.mobile_pickup_details IS NOT NULL
     AND LEFT(JSON_UNQUOTE(JSON_EXTRACT(d.mobile_pickup_details,'$.address')),191)=d.pick_up_location
     AND CAST(JSON_UNQUOTE(JSON_EXTRACT(d.mobile_pickup_details,'$.countryId')) AS UNSIGNED)=d.pick_up_country_id
     AND COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.mobile_pickup_details,'$.cityId')) AS UNSIGNED),0)=d.pick_up_city_id
    THEN d.mobile_pickup_details
    ELSE JSON_OBJECT('address',d.pick_up_location,'countryId',d.pick_up_country_id,
                     'cityId',d.pick_up_city_id,'city',d.pick_up_city) END`;
  const dropoff = `CASE
    WHEN d.mobile_dropoff_details IS NOT NULL AND (
      (d.drop_off_location IS NULL AND JSON_LENGTH(d.mobile_dropoff_details)=0) OR
      (LEFT(JSON_UNQUOTE(JSON_EXTRACT(d.mobile_dropoff_details,'$.address')),191)=d.drop_off_location
       AND CAST(JSON_UNQUOTE(JSON_EXTRACT(d.mobile_dropoff_details,'$.countryId')) AS UNSIGNED)=d.drop_off_country_id
       AND COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.mobile_dropoff_details,'$.cityId')) AS UNSIGNED),0)=d.drop_off_city_id))
    THEN d.mobile_dropoff_details
    WHEN d.drop_off_location IS NULL THEN JSON_OBJECT()
    ELSE JSON_OBJECT('address',d.drop_off_location,'countryId',d.drop_off_country_id,
                     'cityId',d.drop_off_city_id,'city',d.drop_off_city) END`;
  return {
    dl_mobile_reservation_meta: `SELECT r.id,r.id AS reservation_id,
      COALESCE(r.mobile_service_code,CASE r.service_type WHEN 1 THEN 'CHAUFFEUR' WHEN 2 THEN 'CAR_RENTAL' WHEN 3 THEN 'TRANSFER' ELSE NULL END) AS service_code,
      COALESCE(r.mobile_source_channel,'BACK_OFFICE') AS source_channel,
      COALESCE(r.mobile_created_by_user_id,r.user_id) AS created_by_user_id,
      r.mobile_created_by_agent_id AS created_by_agent_id,
      CASE WHEN r.mobile_lifecycle_status IS NOT NULL AND (r.mobile_legacy_status IS NULL OR r.mobile_legacy_status=r.status)
        THEN r.mobile_lifecycle_status ELSE ${legacyStatus} END AS lifecycle_status,
      COALESCE(r.mobile_currency_code,CASE WHEN TRIM(r.currency)='\u20ac' THEN 'EUR'
        WHEN CHAR_LENGTH(TRIM(r.currency))=3 THEN UPPER(TRIM(r.currency)) ELSE NULL END) AS currency_code,
      r.mobile_quote_snapshot_id AS quote_snapshot_id,
      COALESCE(r.mobile_created_at,r.created_at) AS created_at,
      COALESCE(r.mobile_updated_at,r.updated_at) AS updated_at FROM reservations r`,
    dl_mobile_reservation_leg_meta: `SELECT d.id,d.reservation_id,d.id AS reservation_details_id,
      COALESCE(d.mobile_sequence_no,(SELECT COUNT(*) FROM reservation_details p
        WHERE p.reservation_id=d.reservation_id AND p.id<=d.id AND p.deleted_at IS NULL)) AS sequence_no,
      COALESCE(d.mobile_vehicle_class_id,(SELECT v.vehicle_class_id FROM reservation_vehicles rv JOIN vehicles v ON v.id=rv.vehicle_id
        WHERE rv.reservation_details_id=d.id AND rv.status=1 AND rv.deleted_at IS NULL ORDER BY rv.id DESC LIMIT 1)) AS vehicle_class_id,
      COALESCE(d.mobile_passenger_count,1) AS passenger_count,COALESCE(d.mobile_luggage_count,0) AS luggage_count,
      ${pickup} AS pickup_details,${dropoff} AS dropoff_details,
      (SELECT f.flight_number FROM reservation_flight_numbers f
        WHERE f.reservation_id=d.reservation_id AND (f.reservation_details_id=d.id OR f.reservation_details_id IS NULL)
        ORDER BY (f.reservation_details_id=d.id) DESC,COALESCE(f.updated_at,f.created_at) DESC,f.id DESC LIMIT 1) AS flight_number,
      CASE WHEN d.trip_status_id IS NOT NULL AND NOT (d.trip_status_id<=>d.mobile_status_synced_trip_id)
             AND UPPER(REPLACE(s.slug,'-','_')) IN (${tripStatuses}) THEN UPPER(REPLACE(s.slug,'-','_'))
        ELSE COALESCE(d.mobile_leg_status,'PENDING') END AS status,
      COALESCE(d.mobile_created_at,d.created_at) AS created_at,COALESCE(d.mobile_updated_at,d.updated_at) AS updated_at
      FROM reservation_details d LEFT JOIN reservation_statuses s ON s.id=d.trip_status_id`,
    dl_mobile_driver_assignments: `SELECT COALESCE(d.mobile_assignment_id,d.id) AS id,
      d.reservation_id,d.reservation_details_id,d.id AS legacy_reservation_driver_id,
      COALESCE(d.pick_up_driver_id,d.drop_off_driver_id) AS driver_id,
      CASE WHEN r.status=3 THEN 'CANCELLED'
        WHEN d.status<>1 THEN COALESCE(CASE WHEN d.mobile_assignment_status IN ('DECLINED','CANCELLED') THEN d.mobile_assignment_status END,'CANCELLED')
        WHEN r.status=2 THEN COALESCE(CASE WHEN d.mobile_assignment_status IN ('COMPLETED','NO_SHOW','DECLINED','CANCELLED') THEN d.mobile_assignment_status END,'COMPLETED')
        WHEN d.mobile_status_driver_id IS NOT NULL AND NOT(d.mobile_status_driver_id<=>COALESCE(d.pick_up_driver_id,d.drop_off_driver_id)) THEN 'OFFERED'
        ELSE COALESCE(d.mobile_assignment_status,'OFFERED') END AS status,
      TIMESTAMP(COALESCE(d.pick_up_date,l.pick_up_date),COALESCE(d.pick_up_time,l.pick_up_time)) AS scheduled_start_at,
      TIMESTAMP(COALESCE(d.drop_off_date,l.drop_off_date),COALESCE(d.drop_off_time,l.drop_off_time)) AS scheduled_end_at,
      CASE WHEN d.mobile_status_driver_id IS NULL OR d.mobile_status_driver_id=COALESCE(d.pick_up_driver_id,d.drop_off_driver_id) THEN d.mobile_acknowledged_at ELSE NULL END AS acknowledged_at,CASE WHEN d.mobile_status_driver_id IS NULL OR d.mobile_status_driver_id=COALESCE(d.pick_up_driver_id,d.drop_off_driver_id) THEN d.mobile_declined_at ELSE NULL END AS declined_at,CASE WHEN d.mobile_status_driver_id IS NULL OR d.mobile_status_driver_id=COALESCE(d.pick_up_driver_id,d.drop_off_driver_id) THEN d.mobile_decline_reason ELSE NULL END AS decline_reason,
      CASE WHEN d.mobile_status_driver_id IS NULL OR d.mobile_status_driver_id=COALESCE(d.pick_up_driver_id,d.drop_off_driver_id) THEN d.mobile_started_at ELSE NULL END AS started_at,CASE WHEN d.mobile_status_driver_id IS NULL OR d.mobile_status_driver_id=COALESCE(d.pick_up_driver_id,d.drop_off_driver_id) THEN d.mobile_completed_at ELSE NULL END AS completed_at,
      COALESCE(d.mobile_assigned_by_user_id,d.user_id) AS assigned_by_user_id,
      COALESCE(d.mobile_created_at,d.created_at) AS created_at,COALESCE(d.mobile_updated_at,d.updated_at) AS updated_at
      FROM reservation_drivers d JOIN reservation_details l ON l.id=d.reservation_details_id
      JOIN reservations r ON r.id=d.reservation_id
      WHERE d.deleted_at IS NULL AND l.deleted_at IS NULL AND r.deleted_at IS NULL
        AND COALESCE(d.pick_up_driver_id,d.drop_off_driver_id) IS NOT NULL`,
    dl_mobile_messages: `SELECT COALESCE(m.mobile_message_id,m.id) AS id,c.id AS conversation_id,
      m.sender_id AS sender_user_id,COALESCE(m.mobile_message_type,'TEXT') AS message_type,m.body,
      m.mobile_document_id AS document_id,m.created_at,m.deleted_at,m.id AS legacy_message_id,
      IF(m.mobile_message_type IS NULL,0,1) AS is_mobile
      FROM reservation_messages m JOIN app_conversations c ON c.reservation_id=m.reservation_id`,
    dl_mobile_notifications: `SELECT n.mobile_id AS id,n.notifiable_id AS user_id,n.type,
      COALESCE(JSON_UNQUOTE(JSON_EXTRACT(n.data,'$.title')),'') AS title,
      COALESCE(JSON_UNQUOTE(JSON_EXTRACT(n.data,'$.body')),JSON_UNQUOTE(JSON_EXTRACT(n.data,'$.message')),'') AS body,
      CASE WHEN n.mobile_origin='MOBILE_API' THEN JSON_EXTRACT(n.data,'$.data') ELSE n.data END AS data,
      n.read_at,n.created_at FROM notifications n WHERE n.notifiable_type=${model}`,
    dl_mobile_vip_requests: `SELECT COALESCE(c.mobile_request_id,c.id) AS id,c.mobile_customer_id AS customer_id,
      c.mobile_agency_id AS agency_id,c.mobile_created_by_user_id AS created_by_user_id,c.pickup_location AS airport,
      c.mobile_terminal AS terminal,TIMESTAMP(c.pickup_date,c.pickup_time) AS service_at,
      c.number_of_passengers AS passenger_count,c.flight_train_number AS flight_number,
      CASE WHEN c.mobile_request_text_null=1 THEN NULL ELSE c.message_details END AS request_text,
      c.mobile_request_status AS status,c.mobile_operations_note AS operations_note,c.created_at,c.updated_at
      FROM contacts c WHERE c.mobile_request_type='AIRPORT_VIP'`,
    dl_mobile_concierge_requests: `SELECT COALESCE(c.mobile_request_id,c.id) AS id,c.mobile_customer_id AS customer_id,
      c.mobile_agency_id AS agency_id,c.mobile_created_by_user_id AS created_by_user_id,c.mobile_category AS category,
      TIMESTAMP(c.pickup_date,c.pickup_time) AS requested_for,c.pick_up_city AS city,c.message_details AS request_text,
      c.mobile_request_status AS status,c.mobile_operations_note AS operations_note,c.created_at,c.updated_at
      FROM contacts c WHERE c.mobile_request_type='CONCIERGE'`,
  };
};

export const verify = async (db) => {
  const checks = [
    ['booking metadata', `SELECT COUNT(*) FROM app_reservation_meta a LEFT JOIN reservations r ON r.id=a.reservation_id
       WHERE r.mobile_storage_version IS NULL OR NOT(r.mobile_service_code<=>a.service_code) OR NOT(r.mobile_lifecycle_status<=>a.lifecycle_status)
          OR NOT(r.mobile_created_by_user_id<=>a.created_by_user_id) OR NOT(r.mobile_created_by_agent_id<=>a.created_by_agent_id)
          OR NOT(r.mobile_source_channel<=>a.source_channel) OR NOT(r.mobile_currency_code<=>a.currency_code)
          OR NOT(r.mobile_quote_snapshot_id<=>a.quote_snapshot_id)`],
    ['leg metadata', `SELECT COUNT(*) FROM app_reservation_leg_meta a LEFT JOIN reservation_details d ON d.id=a.reservation_details_id
       WHERE d.mobile_storage_version IS NULL OR NOT(d.mobile_sequence_no<=>a.sequence_no) OR NOT(d.mobile_vehicle_class_id<=>a.vehicle_class_id)
          OR NOT(d.mobile_passenger_count<=>a.passenger_count) OR NOT(d.mobile_luggage_count<=>a.luggage_count)
          OR NOT(CAST(d.mobile_pickup_details AS CHAR)<=>CAST(a.pickup_details AS CHAR))
          OR NOT(CAST(d.mobile_dropoff_details AS CHAR)<=>CAST(a.dropoff_details AS CHAR)) OR NOT(d.mobile_leg_status<=>a.status)`],
    ['assignment identifiers', `SELECT COUNT(*) FROM app_driver_assignments a LEFT JOIN reservation_drivers d ON d.mobile_assignment_id=a.id
       WHERE d.id IS NULL OR d.reservation_id<>a.reservation_id OR d.reservation_details_id<>a.reservation_details_id
          OR NOT(d.mobile_assignment_status<=>a.status)
          OR NOT(COALESCE(d.pick_up_driver_id,d.drop_off_driver_id)<=>a.driver_id)
          OR NOT(d.mobile_assigned_by_user_id<=>a.assigned_by_user_id) OR NOT(d.mobile_status_driver_id<=>a.driver_id)
          OR NOT(TIMESTAMP(d.pick_up_date,d.pick_up_time)<=>a.scheduled_start_at)
          OR NOT(TIMESTAMP(d.drop_off_date,d.drop_off_time)<=>a.scheduled_end_at)
          OR NOT(d.mobile_acknowledged_at<=>a.acknowledged_at) OR NOT(d.mobile_declined_at<=>a.declined_at)
          OR NOT(d.mobile_decline_reason<=>a.decline_reason) OR NOT(d.mobile_completed_at<=>a.completed_at)`],
    ['messages', `SELECT COUNT(*) FROM app_messages a LEFT JOIN reservation_messages m ON m.mobile_message_id=a.id
       WHERE m.id IS NULL OR NOT(m.body<=>a.body) OR NOT(m.sender_id<=>a.sender_user_id) OR NOT(m.mobile_document_id<=>a.document_id) OR NOT(m.mobile_message_type<=>a.message_type) OR NOT(m.deleted_at<=>a.deleted_at)`],
    ['notifications', `SELECT COUNT(*) FROM app_notifications a LEFT JOIN notifications n ON n.mobile_id=a.id
       WHERE n.id IS NULL OR n.notifiable_id<>a.user_id OR NOT(n.read_at<=>a.read_at) OR n.mobile_origin<>'MOBILE_API'
          OR NOT(n.type<=>a.type) OR NOT(JSON_UNQUOTE(JSON_EXTRACT(n.data,'$.title'))<=>a.title)
          OR NOT(JSON_UNQUOTE(JSON_EXTRACT(n.data,'$.body'))<=>a.body)`],
    ['VIP requests', `SELECT COUNT(*) FROM app_vip_requests a LEFT JOIN contacts c ON c.mobile_request_type='AIRPORT_VIP' AND c.mobile_request_id=a.id
       WHERE c.id IS NULL OR c.mobile_customer_id<>a.customer_id OR c.mobile_request_status<>a.status
          OR NOT(c.mobile_agency_id<=>a.agency_id) OR NOT(c.mobile_created_by_user_id<=>a.created_by_user_id)
          OR NOT(c.pickup_location<=>a.airport) OR NOT(TIMESTAMP(c.pickup_date,c.pickup_time)<=>a.service_at)
          OR NOT(c.number_of_passengers<=>a.passenger_count) OR NOT(c.flight_train_number<=>a.flight_number)
          OR NOT((CASE WHEN c.mobile_request_text_null=1 THEN NULL ELSE c.message_details END)<=>a.request_text)`],
    ['concierge requests', `SELECT COUNT(*) FROM app_concierge_requests a LEFT JOIN contacts c ON c.mobile_request_type='CONCIERGE' AND c.mobile_request_id=a.id
       WHERE c.id IS NULL OR c.mobile_customer_id<>a.customer_id OR c.mobile_request_status<>a.status
          OR NOT(c.mobile_agency_id<=>a.agency_id) OR NOT(c.mobile_created_by_user_id<=>a.created_by_user_id)
          OR NOT(c.mobile_category<=>a.category) OR NOT(c.pick_up_city<=>a.city)
          OR NOT(TIMESTAMP(c.pickup_date,c.pickup_time)<=>a.requested_for) OR NOT(c.message_details<=>a.request_text)`],
    ['request logs', `SELECT COUNT(*) FROM app_api_request_logs a LEFT JOIN route_access_logs l ON l.mobile_request_id=a.request_id WHERE l.id IS NULL OR NOT(l.mobile_request_path<=>a.request_path) OR NOT(l.status_code<=>a.http_status) OR NOT(l.mobile_actor_user_id<=>a.actor_user_id)`],
  ];
  const result = [];
  for (const [name, sql] of checks) {
    const missingOrDifferent = await scalar(db, sql);
    result.push({ name, missingOrDifferent });
    if (missingOrDifferent) throw new Error(`Migration verification failed: ${name}: ${missingOrDifferent} row(s)`);
  }
  for (const name of Object.keys(viewDefinitions('App\\Models\\User'))) await db.query(`SELECT * FROM ${ident(name)} LIMIT 0`);
  const remainingForeignKeys = await scalar(db, `SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IN ('app_driver_assignments','app_notifications')`);
  if (remainingForeignKeys) throw new Error('Some foreign keys still reference retired storage');
  return result;
};

export const up = async (db, options = {}) => {
  if (!options.allowSharedSchema) throw new Error('Migration 008 requires --allow-shared-schema after taking a snapshot and stopping writes in BOTH applications.');
  const report = await preflight(db, options);
  if (report.blockers.length) throw new Error(`Shared storage preflight blocked:\n${report.blockers.join('\n')}`);
  const log = options.log ?? console.log;
  for (const warning of report.warnings) log(`WARNING: ${warning}`);
  for (const [table, definitions] of Object.entries(addedColumns)) {
    for (const [name, definition] of Object.entries(definitions)) await addColumn(db, table, name, definition);
  }
  for (const index of addedIndexes) await addIndex(db, index);
  log('Added extension columns and namespaced indexes; all original client definitions are retained.');
  await db.query(`INSERT INTO app_settings (option_key,option_value,created_at,updated_at)
    SELECT 'dl.mobile.notification_model',?,NOW(),NOW() FROM DUAL
     WHERE NOT EXISTS (SELECT 1 FROM app_settings WHERE option_key='dl.mobile.notification_model')`, [report.notificationModel]);
  // Each DML group commits independently. An interrupted run resumes by unique
  // public aliases / storage_version, never by INSERT IGNORE or guessed IDs.
  for (const [name, run] of [
    ['booking metadata', copyHeaderAndLegMetadata], ['assignments', copyAssignments],
    ['messages', copyMessages], ['notifications', (executor) => copyNotifications(executor, report.notificationModel)],
    ['manual requests', copyManualRequests], ['request diagnostics', copyAuditLogs],
  ]) {
    log(`Migrating ${name}...`);
    await run(db);
  }
  await rebindForeignKeys(db, 'app_driver_assignments', 'reservation_drivers', 'mobile_assignment_id');
  await rebindForeignKeys(db, 'app_notifications', 'notifications', 'mobile_id');
  for (const [name, sql] of Object.entries(viewDefinitions(report.notificationModel))) {
    await db.query(`CREATE OR REPLACE ALGORITHM=UNDEFINED SQL SECURITY INVOKER VIEW ${ident(name)} AS ${sql}`);
  }
  const verified = await verify(db);
  for (const [table, count] of Object.entries(report.sourceRows)) {
    if ((await scalar(db, `SELECT COUNT(*) FROM ${ident(table)}`)) !== count) {
      throw new Error(`Source row count changed during migration: ${table}. Stop all writers and reconcile before restarting.`);
    }
  }
  log('Migration verified. The eight old app tables remain intact as inactive rollback snapshots.');
  return { ...report, verified };
};
