// Read-only post-migration check. Does not alter the database.
import { pool } from '../db/pool.js';

const originalTables = [
  'reservations','reservation_details','reservation_drivers','reservation_messages',
  'notifications','users','customers','agents','drivers','vehicles','services',
  'reservation_payments','reservation_driver_statuses','reservation_statuses',
];
const requiredViews = [
  'app_service_catalog','app_reservation_meta','app_reservation_leg_meta',
  'app_driver_assignments','app_messages','app_notifications',
];
const essentialTables = [
  'app_booking_drafts','app_quote_snapshots','app_api_request_logs',
  'app_password_reset_tokens','app_refresh_tokens','app_user_devices',
  'app_payment_transactions','app_booking_status_events',
  'app_driver_locations','app_booking_change_requests','app_booking_cancellation_requests',
  'app_push_delivery_jobs','app_push_delivery_tickets',
];
const additiveColumns = {
  reservations: ['service_code','source_channel','lifecycle_status','quote_snapshot_id'],
  reservation_details: ['vehicle_class_id','passenger_count','app_leg_status'],
  reservation_drivers: ['app_assignment_status','scheduled_start_at','scheduled_end_at'],
  reservation_messages: ['message_type','document_id'],
  notifications: ['app_mobile_id','app_type','app_title','app_body'],
};
const connection = await pool.getConnection();
try {
  const [objects] = await connection.query(
    `SELECT table_name AS name,table_type AS type FROM information_schema.tables
     WHERE table_schema=DATABASE()`,
  );
  const objectMap = new Map(objects.map(({ name, type }) => [name, type]));
  const problems = [];
  for (const name of [...originalTables,...essentialTables]) {
    if (objectMap.get(name) !== 'BASE TABLE') problems.push(`Missing base table: ${name}`);
  }
  for (const name of requiredViews) {
    if (objectMap.get(name) !== 'VIEW') problems.push(`Required legacy compatibility VIEW missing: ${name}`);
  }
  const [cols] = await connection.query(
    `SELECT table_name AS tableName,column_name AS columnName,extra
       FROM information_schema.columns WHERE table_schema=DATABASE()`,
  );
  const columns = new Set(cols.map((c) => `${c.tableName}.${c.columnName}`));
  for (const [table, names] of Object.entries(additiveColumns)) {
    for (const name of names) {
      if (!columns.has(`${table}.${name}`)) problems.push(`Missing additive column: ${table}.${name}`);
    }
  }
  const mobileId = cols.find((c) => c.tableName === 'notifications' && c.columnName === 'app_mobile_id');
  if (!/auto_increment/i.test(mobileId?.extra || '')) {
    problems.push('notifications.app_mobile_id must be AUTO_INCREMENT');
  }
  const [keys] = await connection.query(
    `SELECT table_name AS tableName, column_name AS columnName,
            constraint_name AS keyName
       FROM information_schema.key_column_usage
      WHERE table_schema=DATABASE() AND constraint_name='PRIMARY'`,
  );
  for (const [table, name] of [
    ['reservations','id'],['reservation_details','id'],
    ['reservation_drivers','id'],['reservation_messages','id'],['notifications','id'],
  ]) {
    if (!keys.some((k) => k.tableName === table && k.columnName === name)) {
      problems.push(`Original primary key missing: ${table}.${name}`);
    }
  }
  // Ensure the views compile and have their expected legacy lookup identity.
  for (const name of requiredViews) {
    if (objectMap.get(name) === 'VIEW') {
      try { await connection.query(`SELECT * FROM \`${name}\` LIMIT 0`); }
      catch (error) { problems.push(`View ${name} cannot be selected: ${error.message}`); }
    }
  }
  if (problems.length) {
    for (const problem of problems) console.error(`FAIL: ${problem}`);
    process.exitCode = 1;
  } else {
    console.log('PASS: required legacy tables, mobile extensions and compatibility views present');
    console.log('PASS: original five primary keys retain their original columns');
    console.log('NOTE: live booking/payment/API tests are still required on staging');
  }
} finally {
  connection.release();
  await pool.end();
}
