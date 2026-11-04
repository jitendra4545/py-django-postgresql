// Dependency-free smoke tests for this additive database compatibility patch.
// They intentionally do not claim SQL runtime, HTTP or production validation.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { toUtcSqlDateTime } from '../src/common/utc-sql-datetime.js';
import { inspectLegacyDatabase, legacyPreflightError, requiredLegacyTables } from '../src/scripts/lib/legacy-db-preflight.js';

const read = (name) => fs.readFileSync(name, 'utf8');
const migration = read('migrations/008_correct_legacy_status_views.sql');

test('ISO-8601 with Z keeps the same instant in UTC SQL DATETIME', () => {
  assert.equal(toUtcSqlDateTime('2026-11-04T06:40:00Z'), '2026-11-04 06:40:00');
});

test('timezone offsets produce the same UTC instant as a Z timestamp', () => {
  assert.equal(toUtcSqlDateTime('2026-11-04T12:10:00+05:30'), '2026-11-04 06:40:00');
  assert.equal(toUtcSqlDateTime('2026-11-03T23:30:00-07:00'), '2026-11-04 06:30:00');
});

test('invalid timestamps fail instead of silently creating a wrong schedule', () => {
  assert.throws(() => toUtcSqlDateTime('not-a-date'), RangeError);
});

test('status views override legacy numeric status only for explicitly terminal app states', () => {
  const rejectPosition = migration.indexOf("r.lifecycle_status='REJECTED'");
  const legacyCancelPosition = migration.indexOf('WHEN r.status=3 THEN');
  assert.ok(rejectPosition > 0 && rejectPosition < legacyCancelPosition);
  const driverStatusPosition = migration.indexOf("rdv.app_assignment_status IN ('DECLINED','NO_SHOW','COMPLETED','CANCELLED')");
  const legacyInactivePosition = migration.indexOf('WHEN rdv.status=2');
  assert.ok(driverStatusPosition > legacyCancelPosition && driverStatusPosition < legacyInactivePosition);
});

test('corrective SQL only creates or replaces app views, never changes original table keys', () => {
  assert.doesNotMatch(migration, /\bALTER\s+TABLE\b|\bDROP\s+(?:TABLE|COLUMN|INDEX|KEY)\b/i);
  assert.match(migration, /CREATE OR REPLACE ALGORITHM=MERGE VIEW app_reservation_meta/);
  assert.match(migration, /CREATE OR REPLACE VIEW app_driver_assignments/);
});

test('operations, chauffeur events, and manual service timestamps do not truncate offsets', () => {
  for (const source of ['operations.js','chauffeur.js','bookings.js']) {
    const content = read(`src/modules/${source}`);
    assert.match(content, /toUtcSqlDateTime\(/);
    assert.doesNotMatch(content, /request\.(?:query|body)\.\w+\??\.slice\(0,\s*19\)/);
  }
});

test('API registration and OpenAPI contract remain identical to the supplied legacy-first ZIP', () => {
  assert.equal(
    crypto.createHash('sha256').update(read('docs/openapi.json')).digest('hex'),
    '67122cbcace01cec6e64ba7437c5806125a9290673935b14ae19abe023d5ab01',
  );
  assert.match(read('src/app.js'), /bookings/);
});


test('migration preflight requires original website messaging and trip status tables', async () => {
  const missing = new Set([
    'reservation_messages', 'notifications',
    'reservation_driver_statuses', 'reservation_statuses',
  ]);
  const fakeConnection = {
    query: async (sql) => {
      if (sql.includes('SELECT DATABASE()')) {
        return [[{
          databaseName: 'staging_incomplete', serverHost: 'test-db',
          serverPort: 3306, serverVersion: '10.6-test',
        }]];
      }
      if (sql.includes('information_schema.TABLES')) {
        return [requiredLegacyTables.filter((name) => !missing.has(name))
          .map((name) => ({ name, type: 'BASE TABLE' }))];
      }
      throw new Error(`Unexpected read-only preflight query: ${sql}`);
    },
  };
  const report = await inspectLegacyDatabase(fakeConnection);
  assert.equal(report.valid, false);
  assert.deepEqual(report.missing, [...missing].sort((a,b) =>
    requiredLegacyTables.indexOf(a) - requiredLegacyTables.indexOf(b)));
  assert.match(legacyPreflightError(report), /BEFORE changes/);
  assert.match(legacyPreflightError(report), /staging_incomplete/);
});

test('migration preflight accepts a complete legacy base-table schema', async () => {
  const fakeConnection = {
    query: async (sql) => sql.includes('SELECT DATABASE()')
      ? [[{ databaseName: 'staging_complete', serverHost: 'test-db', serverPort: 3306 }]]
      : [requiredLegacyTables.map((name) => ({ name, type: 'BASE TABLE' }))],
  };
  const result = await inspectLegacyDatabase(fakeConnection);
  assert.equal(result.valid, true);
  assert.equal(result.missing.length, 0);
});
