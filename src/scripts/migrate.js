import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pool } from '../db/pool.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const directory = path.join(root, 'migrations');
const checksum = (content) => crypto.createHash('sha256').update(content).digest('hex');
const splitStatements = (sql) => sql.split(/;\s*(?:\r?\n|$)/).map((item) => item.trim()).filter(Boolean);
const options = {
  allowSharedSchema: process.argv.includes('--allow-shared-schema'),
  foundationOnly: process.argv.includes('--foundation-only'),
  notificationModel: process.env.LEGACY_NOTIFICATION_NOTIFIABLE_TYPE ?? '',
};
const connection = await pool.getConnection();
let locked = false;
try {
  const [locks] = await connection.query("SELECT GET_LOCK(CONCAT('dl_migrate_',MD5(DATABASE())),10) AS acquired");
  if (Number(locks[0]?.acquired) !== 1) throw new Error('Another database migration is running');
  locked = true;
  await connection.query(`CREATE TABLE IF NOT EXISTS app_schema_migrations (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,filename VARCHAR(255) NOT NULL,checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id),UNIQUE KEY uq_app_schema_migrations_filename(filename)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  const files = (await fs.readdir(directory)).filter((name) => /^\d+_.*\.(sql|js)$/.test(name)).sort();
  for (const filename of files) {
    if (options.foundationOnly && filename >= '008_') continue;
    const content = await fs.readFile(path.join(directory, filename), 'utf8');
    const digest = checksum(content);
    const [history] = await connection.execute('SELECT checksum FROM app_schema_migrations WHERE filename=?', [filename]);
    if (history[0]) {
      if (history[0].checksum !== digest) throw new Error(`Applied migration changed: ${filename}. Restore the applied file; do not edit its stored checksum.`);
      console.log(`skip ${filename}`);
      continue;
    }
    if (filename.endsWith('.js')) {
      // JavaScript migrations own their resumable DDL/DML sequence. A rollback
      // claim would be false here: MySQL/MariaDB DDL implicitly commits.
      const migration = await import(pathToFileURL(path.join(directory, filename)).href);
      await migration.up(connection, options);
    } else {
      // Historical files are byte-for-byte unchanged. Their CREATE IF NOT EXISTS
      // statements make retries possible; SQL DDL is not wrapped in a fake transaction.
      for (const statement of splitStatements(content)) await connection.query(statement);
    }
    await connection.execute('INSERT INTO app_schema_migrations (filename,checksum) VALUES (?,?)', [filename, digest]);
    console.log(`applied ${filename}`);
  }
} finally {
  if (locked) await connection.query("SELECT RELEASE_LOCK(CONCAT('dl_migrate_',MD5(DATABASE())))").catch(() => {});
  connection.release();
  await pool.end();
}
