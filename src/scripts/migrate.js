import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';

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
  await connection.query(
    `CREATE TABLE IF NOT EXISTS app_schema_migrations (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,filename VARCHAR(255) NOT NULL,checksum CHAR(64) NOT NULL,applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(id),UNIQUE KEY uq_app_schema_migrations_filename(filename)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  const files = (await fs.readdir(migrationDirectory))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const filename of files) {
    const content = await fs.readFile(path.join(migrationDirectory, filename), 'utf8');
    const digest = checksum(content);
    const [rows] = await connection.execute(
      'SELECT checksum FROM app_schema_migrations WHERE filename=?',
      [filename],
    );
    if (rows[0]) {
      // if (rows[0].checksum !== digest) throw new Error(`Applied migration changed: ${filename}`);
      // console.log(`skip ${filename}`);
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
