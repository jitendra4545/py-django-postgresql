import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { URL, fileURLToPath } from 'node:url';
import { pool } from '../db/pool.js';

// Explicitly install ONLY migration 007, to support clients whose existing
// legacy schema has a different historical 001 checksum. Do not bypass 001.
const filename = '007_api_request_audit_logs.sql';
const migrationUrl = new URL(`../../migrations/${filename}`, import.meta.url);
const content = await readFile(fileURLToPath(migrationUrl), 'utf8');
const checksum = createHash('sha256').update(content).digest('hex');
const requiredColumns = [
  'id', 'request_id', 'method', 'request_path', 'access_line', 'http_status',
  'duration_ms', 'request_query', 'request_body', 'response_body',
  'actor_user_id', 'actor_role', 'client_ip', 'user_agent',
  'response_content_type', 'response_bytes', 'error_code', 'created_at',
];

const connection = await pool.getConnection();
try {
  await connection.query(content.trim().replace(/;\s*$/, ''));
  const [columns] = await connection.query(
    `SELECT column_name AS name, data_type AS type FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = 'app_api_request_logs'`,
  );
  const existing = new Set(columns.map((row) => row.name));
  const missing = requiredColumns.filter((name) => !existing.has(name));
  if (missing.length) {
    throw new Error(`app_api_request_logs exists but has missing columns: ${missing.join(', ')}`);
  }
  for (const column of ['request_query', 'request_body', 'response_body']) {
    if (columns.find((item) => item.name === column)?.type?.toLowerCase() !== 'json') {
      throw new Error(`app_api_request_logs.${column} must be a MySQL JSON column`);
    }
  }

  const [history] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = 'app_schema_migrations'`,
  );
  if (Number(history[0]?.count) > 0) {
    const [rows] = await connection.execute(
      'SELECT checksum FROM app_schema_migrations WHERE filename = ?',
      [filename],
    );
    if (rows.length && rows[0].checksum !== checksum) {
      throw new Error(`Already applied audit migration has different checksum: ${filename}`);
    }
    if (!rows.length) {
      await connection.execute(
        'INSERT INTO app_schema_migrations (filename, checksum) VALUES (?, ?)',
        [filename, checksum],
      );
    }
    console.log(`Audit table verified and ${filename} recorded in migration history.`);
  } else {
    console.log('Audit table verified. Migration history table was not present and was not modified.');
  }
  console.log('Now set API_AUDIT_LOG_ENABLED=true and restart the backend.');
} finally {
  connection.release();
  await pool.end();
}
