import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { addedColumns, addedIndexes, viewDefinitions, migrationName } from '../../migrations/008_shared_client_storage.js';

export const assertSharedStorageReady = async (executor) => {
  const [history] = await executor.query('SELECT checksum FROM app_schema_migrations WHERE filename=?', [migrationName]);
  if (!history[0]) throw new Error('Shared storage migration 008 is missing. Back up the DB, stop both writers, then run npm run migrate -- --allow-shared-schema.');
  const local = createHash('sha256').update(await readFile(new URL('../../migrations/008_shared_client_storage.js', import.meta.url))).digest('hex');
  if (history[0].checksum !== local) throw new Error('Shared migration checksum mismatch; deploy the matching reviewed code and migration.');
  const [columns] = await executor.query(`SELECT TABLE_NAME AS tableName,COLUMN_NAME AS columnName
    FROM information_schema.columns WHERE table_schema=DATABASE() AND column_name LIKE 'mobile\\_%'`);
  const actual = new Set(columns.map((column) => `${column.tableName}.${column.columnName}`));
  const missing = Object.entries(addedColumns).flatMap(([table, definitions]) =>
    Object.keys(definitions).filter((name) => !actual.has(`${table}.${name}`)).map((name) => `${table}.${name}`));
  if (missing.length) throw new Error(`Shared storage is incomplete: ${missing.join(', ')}`);
  const [indexes] = await executor.query(`SELECT TABLE_NAME AS tableName,INDEX_NAME AS indexName,
    COLUMN_NAME AS columnName,NON_UNIQUE AS nonUnique,SEQ_IN_INDEX AS seq
    FROM information_schema.statistics WHERE table_schema=DATABASE() ORDER BY seq_in_index`);
  for (const [table, name, expected, unique] of addedIndexes) {
    const found = indexes.filter((index) => index.tableName === table && index.indexName === name);
    if (found.map((index) => index.columnName).join(',') !== expected.slice(1, -1) ||
        !found.length || Boolean(found[0].nonUnique) === unique)
      throw new Error(`Shared storage index is missing or incompatible: ${table}.${name}`);
  }
  const [notificationIds] = await executor.query(`SELECT EXTRA AS extra FROM information_schema.columns
    WHERE table_schema=DATABASE() AND table_name='notifications' AND column_name='mobile_id'`);
  if (!String(notificationIds[0]?.extra).includes('auto_increment'))
    throw new Error('Shared notification numeric ID allocator is not installed');
  const [foreignKeys] = await executor.query(`SELECT TABLE_NAME AS tableName,COLUMN_NAME AS columnName,
    REFERENCED_TABLE_NAME AS targetTable,REFERENCED_COLUMN_NAME AS targetColumn
    FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL`);
  for (const [table, column, target, targetColumn] of [
    ['app_booking_status_events','assignment_id','reservation_drivers','mobile_assignment_id'],
    ['app_driver_locations','assignment_id','reservation_drivers','mobile_assignment_id'],
    ['app_driver_expenses','assignment_id','reservation_drivers','mobile_assignment_id'],
    ['app_incidents','assignment_id','reservation_drivers','mobile_assignment_id'],
    ['app_push_delivery_jobs','notification_id','notifications','mobile_id'],
  ]) {
    if (!foreignKeys.some((fk) => fk.tableName === table && fk.columnName === column && fk.targetTable === target && fk.targetColumn === targetColumn))
      throw new Error(`Shared storage foreign key is missing: ${table}.${column}`);
  }
  const [views] = await executor.query("SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_type='VIEW'");
  const present = new Set(views.map((view) => view.name));
  const absent = Object.keys(viewDefinitions('App\\Models\\User')).filter((name) => !present.has(name));
  if (absent.length) throw new Error(`Shared storage views are missing: ${absent.join(', ')}`);
  for (const name of Object.keys(viewDefinitions('App\\Models\\User'))) await executor.query(`SELECT * FROM \`${name}\` LIMIT 0`);
  const [settings] = await executor.query("SELECT option_value FROM app_settings WHERE option_key='dl.mobile.notification_model'");
  if (settings.length !== 1 || !settings[0].option_value) throw new Error('The shared notification User model setting is missing or ambiguous');
  const [refs] = await executor.query(`SELECT COUNT(*) AS total FROM information_schema.KEY_COLUMN_USAGE
    WHERE CONSTRAINT_SCHEMA=DATABASE() AND REFERENCED_TABLE_NAME IN ('app_driver_assignments','app_notifications')`);
  if (Number(refs[0].total)) throw new Error('Foreign keys still reference retired mobile storage');
  return { ready: true, migration: migrationName, views: Object.keys(viewDefinitions(settings[0].option_value)).length, notificationModel: settings[0].option_value };
};
