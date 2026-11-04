import { pool } from '../db/pool.js';
import { assertSharedStorageReady } from '../db/shared-schema.js';

// Kept under the existing npm command for operator compatibility. It must not
// recreate app_api_request_logs or bypass migration/checksum safety anymore.
try {
  await assertSharedStorageReady(pool);
  console.log('API audit storage is route_access_logs. Redaction and bounded batching remain enabled by the existing settings.');
} finally {
  await pool.end();
}
