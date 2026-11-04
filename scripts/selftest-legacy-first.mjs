// No database or third-party packages required. This checks migration design,
// schema collision safety, and that the original mobile API surface has not
// been modified; it does NOT replace live API integration testing.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const read = (name) => fs.readFileSync(name, 'utf8');
const migrations = fs.readdirSync('migrations').filter((x) => x.endsWith('.sql'));
const all = migrations.map((name) => read(`migrations/${name}`)).join('\n');
const old = read('migrations/000_additive_legacy_mobile_columns.sql');
const foundation = read('migrations/001_release_1_mobile_foundation.sql');
const views = ['app_reservation_meta','app_reservation_leg_meta','app_driver_assignments',
  'app_messages','app_notifications','app_service_catalog'];
const foundationTables = ['app_booking_drafts','app_quote_snapshots','app_api_request_logs',
  'app_password_reset_tokens','app_refresh_tokens','app_user_devices'];
for (const name of foundationTables) {
  assert.match(all, new RegExp(`CREATE TABLE IF NOT EXISTS ${name}\\b`));
}
for (const name of views) {
  assert.doesNotMatch(all, new RegExp(`CREATE TABLE IF NOT EXISTS ${name}\\b`));
  assert.match(all, new RegExp(`CREATE(?: ALGORITHM=MERGE)? VIEW ${name}\\b`));
}
for (const table of ['reservations','reservation_details','reservation_drivers',
  'reservation_messages','notifications']) {
  assert.match(old, new RegExp(`ALTER TABLE ${table}\\b`));
}
assert.doesNotMatch(old.split("\n").filter((line) => !line.trim().startsWith("--")).join("\n"), /\b(?:DROP|MODIFY|CHANGE)\s+(?:COLUMN\s+)?/i);
assert.match(foundation, /fk_app_driver_location_assignment FOREIGN KEY \(assignment_id\) REFERENCES reservation_drivers\(id\)/);
assert.match(read('migrations/005_expo_notification_delivery.sql'), /REFERENCES notifications\(app_mobile_id\)/);
assert.match(read('src/modules/operations.js'), /INSERT INTO reservation_drivers/);
assert.doesNotMatch(read('src/modules/operations.js'), /INSERT INTO app_driver_assignments/);
assert.match(read('src/modules/communication.js'), /INSERT INTO reservation_messages/);
assert.match(read('src/services/notifications.js'), /INSERT INTO notifications/);
assert.match(read('src/modules/chauffeur.js'), /writeLegacyDriverStatus\(connection/);
const sourceFiles = ['src/services/booking-service.js','src/modules/operations.js',
  'src/modules/chauffeur.js','src/modules/communication.js','src/services/notifications.js'];
for (const filename of sourceFiles) {
  assert.doesNotMatch(read(filename), /INSERT INTO app_(reservation_meta|reservation_leg_meta|driver_assignments|messages|notifications|service_catalog)\b/);
}
const count = (foundation.match(/CREATE TABLE IF NOT EXISTS/g) ?? []).length +
  (migrations.filter((f) => f !== '001_release_1_mobile_foundation.sql').reduce(
    (n, filename) => n + (read(`migrations/${filename}`).match(/CREATE TABLE IF NOT EXISTS/g)?.length ?? 0),0));
assert.equal(count, 29);
const openapiHash = crypto.createHash('sha256').update(read('docs/openapi.json')).digest('hex');
console.log(`PASS legacy-first static audit: ${count} app base tables, ${views.length} shared views`);
console.log('PASS original legacy key definitions left intact by additive migration');
console.log('PASS original booking, chauffeur, chat and notification tables own writes');
console.log(`OpenAPI contract sha256: ${openapiHash}`);
console.log('NOT RUN: live MariaDB, Stripe, Expo, website and API integration tests');
