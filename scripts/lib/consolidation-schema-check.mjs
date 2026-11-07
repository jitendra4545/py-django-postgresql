import {
  additiveColumns,
  extraRequiredTables,
  requiredIndexes,
  requiredIncidentForeignKeys,
  idAllocatorTables,
  mustBeUnsignedBigint, allApiRuntimeTables,
} from './consolidation-schema-spec.mjs';

/** A read-only structural verification of the schema used by the mobile booking flow. */
export const compareConsolidationMetadata = ({ tables = [], columns = [], indexes = [], foreignKeys = [] }, { allApi = false } = {}) => {
  const errors = [];
  const warnings = [];
  const tableByName = new Map(tables.map((row) => [row.TABLE_NAME, row]));
  const columnByName = new Map(columns.map((row) => [`${row.TABLE_NAME}.${row.COLUMN_NAME}`, row]));
  const indexByName = new Map();
  for (const row of indexes) {
    const key = `${row.TABLE_NAME}.${row.INDEX_NAME}`;
    const list = indexByName.get(key) ?? [];
    list.push(row);
    indexByName.set(key, list);
  }
  for (const [name, row] of tableByName) {
    if (row.TABLE_TYPE && row.TABLE_TYPE !== 'BASE TABLE') {
      if (name in extraRequiredTables || name in additiveColumns) {
        errors.push(`table ${name} is ${row.TABLE_TYPE}; a BASE TABLE is required`);
      }
    }
  }
  const allRequired = new Map();
  for (const [table, names] of Object.entries(extraRequiredTables)) {
    allRequired.set(table, new Set(names));
  }
  for (const [table, columns] of Object.entries(additiveColumns)) {
    const names = allRequired.get(table) ?? new Set();
    Object.keys(columns).forEach((name) => names.add(name));
    allRequired.set(table, names);
  }
  for (const [table, names] of allRequired) {
    if (!tableByName.has(table)) {
      errors.push(`missing table ${table}`);
      continue;
    }
    for (const name of names) {
      if (!columnByName.has(`${table}.${name}`)) errors.push(`missing column ${table}.${name}`);
    }
  }
  for (const [table, definitions] of Object.entries(additiveColumns)) {
    for (const [name] of Object.entries(definitions)) {
      const row = columnByName.get(`${table}.${name}`);
      if (row && row.IS_NULLABLE !== 'YES') {
        errors.push(`incompatible column ${table}.${name}: must be NULLABLE for PHP website inserts`);
      }
    }
  }
  // Preserve website semantics: its reservation and per-leg statuses are numeric,
  // while mobile lifecycle/status fields are stored in additional text columns.
  for (const [table, name] of [
    ['reservations', 'status'],
    ['reservation_details', 'status'],
    ['reservation_drivers', 'status'],
  ]) {
    const row = columnByName.get(`${table}.${name}`);
    const type = String(row?.DATA_TYPE ?? row?.COLUMN_TYPE ?? '').toLowerCase();
    if (row && !/^(tinyint|smallint|mediumint|int|bigint)\b/.test(type)) {
      errors.push(`incompatible legacy website status ${table}.${name}: expected numeric, found ${row.COLUMN_TYPE}`);
    }
  }
  for (const [table, name] of mustBeUnsignedBigint) {
    const col = columnByName.get(`${table}.${name}`);
    if (!col) continue;
    const columnType = String(col.COLUMN_TYPE ?? '').toLowerCase();
    if (!/^bigint\b/.test(columnType) || !columnType.includes('unsigned')) {
      errors.push(`incompatible column ${table}.${name}: expected BIGINT UNSIGNED, actual ${col.COLUMN_TYPE}`);
    }
  }
  for (const table of idAllocatorTables) {
    const col = columnByName.get(`${table}.id`);
    if (col && !String(col.EXTRA ?? '').includes('auto_increment')) {
      errors.push(`incompatible allocator ${table}.id: AUTO_INCREMENT is required`);
    }
  }
  for (const [table, expectedIndexes] of Object.entries(requiredIndexes)) {
    if (!tableByName.has(table)) continue;
    for (const [name, wanted] of Object.entries(expectedIndexes)) {
      const items = (indexByName.get(`${table}.${name}`) ?? []).sort(
        (a, b) => Number(a.SEQ_IN_INDEX) - Number(b.SEQ_IN_INDEX),
      );
      if (!items.length) {
        errors.push(`missing index ${table}.${name} (${wanted.columns.join(', ')})`);
        continue;
      }
      const actual = items.map((row) => row.COLUMN_NAME);
      const isUnique = Number(items[0].NON_UNIQUE) === 0;
      if (actual.join(',') !== wanted.columns.join(',') || isUnique !== wanted.unique) {
        errors.push(`incompatible index ${table}.${name}: expected ${wanted.unique ? 'UNIQUE' : 'INDEX'} (${wanted.columns.join(', ')})`);
      }
    }
  }
  if (tableByName.has('reservation_service_incidents')) {
    for (const [column, [targetTable, targetColumn]] of Object.entries(requiredIncidentForeignKeys)) {
      const matching = foreignKeys.filter((row) =>
        row.TABLE_NAME === 'reservation_service_incidents' &&
        row.COLUMN_NAME === column &&
        row.REFERENCED_TABLE_NAME === targetTable &&
        row.REFERENCED_COLUMN_NAME === targetColumn,
      );
      if (!matching.length) errors.push(`missing foreign key reservation_service_incidents.${column} -> ${targetTable}.${targetColumn}`);
    }
  }
  if (allApi) {
    for (const table of allApiRuntimeTables) {
      if (!tableByName.has(table)) errors.push(`missing mobile API table ${table} (all-api inventory)`);
    }
  }
  for (const table of ['app_reservation_meta', 'app_reservation_leg_meta', 'app_driver_assignments', 'app_booking_status_events', 'app_driver_expenses', 'app_incidents']) {
    if (tableByName.has(table)) {
      warnings.push(`archived source ${table} exists: do not drop until backfill verified`);
    }
  }
  return { ok: errors.length === 0, errors, warnings,
    checkedTables: allRequired.size, checkedColumns: [...allRequired.values()].reduce((n, s) => n + s.size, 0),
    checkedIndexes: Object.values(requiredIndexes).reduce((n, i) => n + Object.keys(i).length, 0),
  };
};

export const inspectConsolidationSchema = async (db, options = {}) => {
  // All operations here are SELECT from information_schema; no schema mutations.
  const [[tables], [columns], [indexes], [foreignKeys], [schema]] = await Promise.all([
    db.query('SELECT TABLE_NAME,TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE()'),
    db.query('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE,DATA_TYPE,IS_NULLABLE,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()'),
    db.query('SELECT TABLE_NAME,INDEX_NAME,COLUMN_NAME,SEQ_IN_INDEX,NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE()'),
    db.query('SELECT TABLE_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL'),
    db.query('SELECT DATABASE() AS database_name'),
  ]);
  const report = compareConsolidationMetadata({ tables, columns, indexes, foreignKeys }, options);
  report.database = schema[0]?.database_name ?? null;
  report.tables = tables.map((row) => row.TABLE_NAME);
  return report;
};

/** Optional expensive historical backfill checks; never edits records. */
export const inspectHistoricalBackfill = async (db, report) => {
  if (!report.ok) return { skipped: 'Resolve structural errors before checking historical rows', checks: [] };
  const names = new Set(report.tables);
  const checks = [];
  const audit = async (name, sql) => {
    const [rows] = await db.query(sql);
    checks.push({ name, missing: Number(rows[0]?.missing ?? 0) });
  };
  if (names.has('app_reservation_meta')) {
    await audit('reservation header migration (008)', `SELECT COUNT(*) AS missing FROM app_reservation_meta src LEFT JOIN reservations dest ON dest.id=src.reservation_id WHERE dest.id IS NULL OR dest.service_code IS NULL`);
  }
  if (names.has('app_reservation_leg_meta')) {
    await audit('reservation leg migration (009)', `SELECT COUNT(*) AS missing FROM app_reservation_leg_meta src LEFT JOIN reservation_details dest ON dest.id=src.reservation_details_id WHERE dest.id IS NULL OR dest.sequence_no IS NULL`);
  }
  if (names.has('app_driver_assignments')) {
    await audit('chauffeur assignment migration (009)', `SELECT COUNT(*) AS missing FROM app_driver_assignments src LEFT JOIN reservation_drivers dest ON dest.mobile_assignment_id=src.id WHERE dest.id IS NULL`);
  }
  if (names.has('app_booking_status_events')) {
    await audit('booking status history migration (010)', `SELECT COUNT(*) AS missing FROM app_booking_status_events src LEFT JOIN activity_logs dest ON dest.mobile_event_id=src.id WHERE dest.id IS NULL`);
    await audit('chauffeur status mirror (010)', `SELECT COUNT(*) AS missing FROM app_booking_status_events src LEFT JOIN reservation_driver_statuses dest ON dest.mobile_event_id=src.id WHERE src.assignment_id IS NOT NULL AND src.reservation_details_id IS NOT NULL AND dest.id IS NULL`);
  }
  if (names.has('app_driver_expenses')) {
    await audit('chauffeur expense migration (010)', `SELECT COUNT(*) AS missing FROM app_driver_expenses src LEFT JOIN reservation_other_costs dest ON dest.mobile_expense_id=src.id WHERE dest.id IS NULL`);
  }
  if (names.has('app_incidents')) {
    await audit('service incident migration (010)', `SELECT COUNT(*) AS missing FROM app_incidents src LEFT JOIN reservation_service_incidents dest ON dest.id=src.id WHERE dest.id IS NULL`);
  }
  await audit('mobile expenses causing legacy double-charge', `SELECT COUNT(*) AS missing FROM reservation_other_costs WHERE type='MOBILE_DRIVER_EXPENSE' AND amount<>0`);
  return { skipped: null, ok: checks.every((check) => check.missing === 0), checks };
};
