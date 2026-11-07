import assert from 'node:assert/strict';
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

const expectedMobileColumns = [
  'service_code',
  'source_channel',
  'created_by_user_id',
  'created_by_agent_id',
  'lifecycle_status',
  'currency_code',
  'quote_snapshot_id',
];

test('runtime no longer references app_reservation_meta', async () => {
  for (const name of sourceFiles) {
    const text = await read(name);
    assert.doesNotMatch(text, /app_reservation_meta/i, `${name} still references the old table`);
  }
});

test('migration adds all mobile columns without changing legacy columns', async () => {
  const text = await read('migrations/008_consolidate_reservation_meta_into_reservations.sql');
  assert.match(text, /ALTER TABLE reservations/);
  for (const column of expectedMobileColumns) {
    assert.ok(text.includes(`'${column}'`), `Missing ${column}`);
  }
  assert.doesNotMatch(text, /\bDROP\s+(?:TABLE|COLUMN)\b|\bDELETE\s+FROM\s+reservations\b/i);
  assert.match(text, /information_schema\.TABLES/);
  assert.match(text, /WHERE r\.service_code IS NULL/);
});

test('new booking writes mobile fields onto the inserted reservation row', async () => {
  const text = await read('src/services/booking-service.js');
  assert.match(text, /INSERT INTO reservations\s*\(/);
  assert.match(text, /UPDATE reservations\s+SET service_code=/);
  assert.match(text, /lifecycle_status='PAYMENT_PENDING'/);
  assert.match(text, /quote_snapshot_id=\?, updated_at=NOW\(\)\s+WHERE id=\?/);
});

test('booking list/detail preserve the mobile JSON aliases', async () => {
  for (const file of ['src/services/booking-view.js', 'src/modules/bookings.js']) {
    const sql = await read(file);
    assert.match(sql, /arm\.service_code AS serviceCode/);
    assert.match(sql, /arm\.lifecycle_status AS status/);
    assert.match(sql, /arm\.currency_code AS currency/);
    assert.match(sql, /JOIN reservations arm ON arm\.id=r\.id AND arm\.service_code IS NOT NULL/);
  }
  const detail = await read('src/services/booking-view.js');
  assert.match(detail, /arm\.source_channel AS sourceChannel/);
  assert.match(detail, /arm\.created_by_agent_id AS createdByAgentId/);
});

test('legacy website numeric status stays separate from mobile lifecycle', async () => {
  const view = await read('src/services/booking-view.js');
  assert.match(view, /r\.status AS legacyStatus/);
  assert.match(view, /arm\.lifecycle_status AS status/);
  const service = await read('src/services/booking-service.js');
  assert.match(service, /LEGACY_RESERVATION_STATUS\.PENDING/);
});

test('payment, hold and chauffeur status updates use reservations.id', async () => {
  for (const file of [
    'src/modules/payments.js',
    'src/modules/chauffeur.js',
    'src/modules/operations.js',
    'src/services/payment-holds.js',
  ]) {
    const text = await read(file);
    assert.match(text, /UPDATE reservations\s+SET lifecycle_status=/);
  }
});

