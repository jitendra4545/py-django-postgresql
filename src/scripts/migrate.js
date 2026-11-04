import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';
import { inspectLegacyDatabase, legacyPreflightError } from './lib/legacy-db-preflight.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const migrationDirectory = path.join(root, 'migrations');
const checksum = (content) => crypto.createHash('sha256').update(content).digest('hex');

const splitStatements = (sql) =>
  sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((item) => item.trim())
    .filter(Boolean);

const connection = await pool.getConnection();
try {
  // Fail before creating even app_schema_migrations if this is the wrong or
  // incomplete legacy database. The four communication/status tables are
  // website-owned; the mobile migrations must not invent them.
  const legacyReport = await inspectLegacyDatabase(connection);
  if (!legacyReport.valid) throw new Error(legacyPreflightError(legacyReport));
  console.log(`Preflight OK: ${legacyReport.databaseName} on ${legacyReport.serverHost} (${legacyReport.tableCount} original/app base tables found)`);

  await connection.query(
    `CREATE TABLE IF NOT EXISTS app_schema_migrations (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,filename VARCHAR(255) NOT NULL,checksum CHAR(64) NOT NULL,applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id),UNIQUE KEY uq_app_schema_migrations_filename(filename)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  const files = (await fs.readdir(migrationDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  // Fail closed BEFORE executing the additive ALTER TABLE statements. Without
  // this guard, an existing installation of the old 001 could receive the new
  // 000 changes before the checksum mismatch was discovered.
  const [applied] = await connection.query(
    'SELECT filename,checksum FROM app_schema_migrations',
  );
  const expected = new Map();
  for (const filename of files) {
    const content = await fs.readFile(path.join(migrationDirectory, filename), 'utf8');
    expected.set(filename, checksum(content));
  }
  for (const row of applied) {
    if (expected.has(row.filename) && expected.get(row.filename) !== row.checksum) {
      throw new Error(
        `Migration checksum mismatch before any new schema changes: ${row.filename}. ` +
        'Use the documented existing-app upgrade procedure; do not replay a modified 001.',
      );
    }
  }
  const [conflicting] = await connection.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema=DATABASE() AND table_type='BASE TABLE'
       AND table_name IN ('app_reservation_meta','app_reservation_leg_meta',
         'app_driver_assignments','app_messages','app_notifications','app_service_catalog')`,
  );
  if (conflicting.length) {
    throw new Error(
      'Older shadow app tables already exist (' + conflicting.map((r) => r.table_name).join(', ') +
      '). Stop: do not overwrite or drop them in production. Follow the staged upgrade guide.',
    );
  }
  for (const filename of files) {
    const content = await fs.readFile(path.join(migrationDirectory, filename), 'utf8');
    const digest = checksum(content);
    const [rows] = await connection.execute(
      'SELECT checksum FROM app_schema_migrations WHERE filename=?',
      [filename],
    );
    if (rows[0]) {
      if (rows[0].checksum !== digest) throw new Error(`Applied migration changed: ${filename}`);
      console.log(`skip ${filename}`);
      continue;
    }
    await connection.beginTransaction();
    try {
      for (const statement of splitStatements(content)) await connection.query(statement);
      await connection.execute(
        'INSERT INTO app_schema_migrations (filename,checksum) VALUES (?,?)',
        [filename, digest],
      );
      await connection.commit();
      console.log(`applied ${filename}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  }
} finally {
  connection.release();
  await pool.end();
}
