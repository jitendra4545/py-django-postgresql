// Read-only database check. Safe to run before migration; it never alters SQL.
import { pool } from '../db/pool.js';
import { inspectLegacyDatabase, legacyPreflightError } from './lib/legacy-db-preflight.js';

try {
  const connection = await pool.getConnection();
  try {
    const report = await inspectLegacyDatabase(connection);
    console.log(`Database: ${report.databaseName ?? '(none)'}`);
    console.log(`Server: ${report.serverHost ?? '(unknown)'}:${report.serverPort ?? '?'}`);
    console.log(`Server version: ${report.serverVersion ?? '(unknown)'}`);
    console.log(`Existing base tables: ${report.tableCount}`);
    if (!report.valid) throw new Error(legacyPreflightError(report));
    console.log('PASS: required website tables are present; this was a READ-ONLY check.');
    console.log('NEXT: use npm run migrate ONLY on a verified staging database backup.');
  } finally {
    connection.release();
  }
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
