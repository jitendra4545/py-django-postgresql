import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (name) => readFile(path.join(root, name), 'utf8');
const sourceFiles = [];
async function walk(folder) {
  for (const entry of await readdir(path.join(root, folder), { withFileTypes: true })) {
    const next = path.join(folder, entry.name);
    if (entry.isDirectory()) await walk(next);
    else if (next.endsWith('.js')) sourceFiles.push(next);
  }
}
await walk('src');

const migrationFile = 'migrations/009_consolidate_reservation_legs_and_driver_assignments.sql';

test('the runtime no longer queries any of the three retired app_* tables', async () => {
  for (const file of sourceFiles) {
    const text = await read(file);
    assert.doesNotMatch(text, /app_(?:reservation_meta|reservation_leg_meta|driver_assignments)/i, file);
  }
});

test('all mobile leg fields are additive on reservation_details', async () => {
  const sql = await read(migrationFile);
  for (const name of ['sequence_no', 'vehicle_class_id', 'passenger_count', 'luggage_count',
    'pickup_details', 'dropoff_details', 'flight_number', 'mobile_leg_status']) {
    assert.ok(sql.includes(`'${name}'`), `Missing leg column ${name}`);
  }
  assert.match(sql, /app_reservation_leg_meta m ON m\.reservation_details_id=rd\.id/);
  assert.match(sql, /ADD UNIQUE INDEX `uq_reservation_details_mobile_sequence`/);
  const create = await read('src/services/booking-service.js');
  assert.match(create, /UPDATE reservation_details\s+SET sequence_no=\?/);
  assert.match(create, /mobile_leg_status='PENDING'/);
  const view = await read('src/services/booking-view.js');
  assert.match(view, /rlm\.mobile_leg_status AS status/);
  assert.match(view, /rlm\.passenger_count AS passengerCount/);
  assert.match(view, /rlm\.luggage_count AS luggageCount/);
});

test('mobile assignments use reservation_drivers without changing PHP pickup and dropoff fields', async () => {
  const sql = await read(migrationFile);
  for (const name of ['mobile_assignment_id','mobile_legacy_reservation_driver_id',
    'mobile_driver_id','mobile_assignment_status','mobile_assignment_role',
    'scheduled_start_at','scheduled_end_at','acknowledged_at','declined_at','decline_reason',
    'started_at','completed_at','assigned_by_user_id']) {
    assert.ok(sql.includes(`'${name}'`), `Missing assignment column ${name}`);
  }
  assert.match(sql, /SET rd\.mobile_assignment_id=a\.id/);
  assert.doesNotMatch(sql, /SET\s+rd\.pick_up_driver_id\s*=|SET\s+rd\.drop_off_driver_id\s*=/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `app_mobile_assignment_ids`/);
  assert.match(sql, /INSERT IGNORE INTO app_mobile_assignment_ids \(id\) SELECT id FROM app_driver_assignments/);
  const storage = await read('src/services/driver-assignment-storage.js');
  assert.match(storage, /FROM reservation_drivers rd/);
  assert.match(storage, /rd\.mobile_assignment_id AS id/);
  assert.match(storage, /rd\.mobile_assignment_status AS status/);
  const ops = await read('src/modules/operations.js');
  assert.match(ops, /z\.enum\(\['PICKUP', 'DROPOFF'\]\)\.default\('PICKUP'\)/);
  assert.match(ops, /INSERT INTO app_mobile_assignment_ids VALUES \(NULL\)/);
  assert.match(ops, /INSERT INTO reservation_drivers/);
  assert.match(ops, /publicId\.insertId/);
  assert.match(ops, /mobile_assignment_role IN \(\?, 'BOTH'\)/);
});

test('dependent tracking, event, expense and incident IDs are preserved and rewired', async () => {
  const sql = await read(migrationFile);
  for (const child of ['app_booking_status_events','app_driver_locations',
    'app_driver_expenses','app_incidents']) {
    assert.match(sql, new RegExp(`ALTER TABLE ${child} DROP FOREIGN KEY`));
  }
  const newRefs = sql.match(/REFERENCES reservation_drivers \(mobile_assignment_id\)/g) ?? [];
  assert.equal(newRefs.length, 4);
  assert.doesNotMatch(sql, /\bDROP\s+(?:TABLE|COLUMN)\b|DELETE\s+FROM\s+reservation_(?:details|drivers)/i);
});

test('all JSON response expressions in changed route files match the previous release', async () => {
  const baseline = JSON.parse(await read('scripts/unchanged-api-response-fingerprints.json'));
  for (const [file, { count, sha256 }] of Object.entries(baseline)) {
    const text = await read(file);
    const calls = text.match(/response(?:\.status\([^)]*\))?\.json\([\s\S]*?\);/g) ?? [];
    assert.equal(calls.length, count, `${file}: response count`);
    assert.equal(crypto.createHash('sha256').update(calls.join('\n')).digest('hex'), sha256,
      `${file}: response JSON expressions changed`);
  }
});

test('every SELECT from the mobile assignment derived table has a SQL alias', async () => {
  for (const file of [...sourceFiles, 'scripts/seed-chauffeur-demo-bookings.js']) {
    const text = await read(file);
    assert.doesNotMatch(text, /FROM \${MOBILE_DRIVER_ASSIGNMENTS}(?!\s+(?:ada|mobile_assignment)\b)/,
      `${file}: MySQL requires derived-table aliases`);
  }
});

test('the existing reservation-header consolidation remains additive', async () => {
  const first = await read('migrations/008_consolidate_reservation_meta_into_reservations.sql');
  assert.match(first, /ALTER TABLE reservations/);
  assert.match(first, /lifecycle_status/);
});
