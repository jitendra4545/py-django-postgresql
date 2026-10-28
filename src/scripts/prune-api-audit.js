import { env } from '../config/env.js';
import { pool, query } from '../db/pool.js';

try {
  const rows = await query(
    `DELETE FROM app_api_request_logs
     WHERE created_at < DATE_SUB(NOW(3), INTERVAL ? DAY)
     ORDER BY created_at ASC LIMIT 5000`,
    [env.API_AUDIT_LOG_RETENTION_DAYS],
  );
  console.log('Deleted expired HTTP audit log rows:', rows.affectedRows ?? 0);
} finally {
  await pool.end();
}
