#!/usr/bin/env node
/** Read-only live DB contract check before starting the backend. No DDL. */
import { pool } from '../src/db/pool.js';
import { inspectConsolidationSchema, inspectHistoricalBackfill } from './lib/consolidation-schema-check.mjs';

const args = new Set(process.argv.slice(2));
const isDeep = args.has('--deep');
const isJson = args.has('--json');
const allApi = args.has('--all-api');
let exitCode = 0;
try {
  const report = await inspectConsolidationSchema(pool,{ allApi });
  if (isDeep) report.historical = await inspectHistoricalBackfill(pool, report);
  if (isJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Drive Luxury read-only schema preflight: ${report.database ?? 'NO DATABASE SELECTED'}`);
    console.log(`${report.checkedTables} required tables; ${report.checkedColumns} columns; ${report.checkedIndexes} indexes${allApi ? "; optional all-API table inventory" : ""}`);
    for (const error of report.errors) console.error(`FAIL  ${error}`);
    for (const warning of report.warnings) console.log(`INFO  ${warning}`);
    for (const check of report.historical?.checks ?? []) {
      console.log(`${check.missing ? 'FAIL' : 'PASS'}  ${check.name}: ${check.missing} unresolved`);
    }
    if (report.historical?.skipped) console.log(`INFO  ${report.historical.skipped}`);
    console.log(report.ok && (report.historical?.ok ?? true)
      ? 'PASS: consolidated mobile schema matches requirements'
      : 'FAIL: schema is incomplete; review scripts/sql/REPAIR_008_010_STAGING.sql on a backup/staging copy before checkout');
  }
  if (!report.ok || report.historical?.ok === false) exitCode = 1;
} catch (error) {
  console.error('FAIL: unable to inspect database schema:', error.code ?? error.name, error.message);
  exitCode = 1;
} finally {
  await pool.end();
}
process.exitCode = exitCode;
