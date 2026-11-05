import { setInterval, clearInterval } from 'node:timers';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { createAuditQueue } from './api-audit-queue.js';

const COLUMNS = [
  'request_id', 'method', 'request_path', 'access_line', 'http_status', 'duration_ms',
  'request_query', 'request_body', 'response_body', 'actor_user_id', 'actor_role',
  'client_ip', 'user_agent', 'response_content_type', 'response_bytes', 'error_code',
];
const toJson = (value) => (value === undefined || value === null ? null : JSON.stringify(value));

const writeBatch = async (entries) => {
  if (!entries.length) return;
  const row = `(${COLUMNS.map(() => '?').join(',')})`;
  const sql = `INSERT INTO app_api_request_logs (${COLUMNS.map((column) => `\`${column}\``).join(',')}) VALUES ${entries.map(() => row).join(',')}`;
  const values = entries.flatMap((entry) => [
    entry.requestId,
    entry.method,
    entry.path,
    entry.accessLine,
    entry.statusCode,
    entry.durationMs,
    toJson(entry.requestQuery),
    toJson(entry.requestBody),
    toJson(entry.responseBody),
    entry.userId,
    entry.userRole,
    entry.ipAddress,
    entry.userAgent,
    entry.contentType,
    entry.responseBytes,
    entry.errorCode,
  ]);
  await query(sql, values);
};

let lastWarning = 0;
const warnThrottled = (error, dropped = 0) => {
  if (Date.now() - lastWarning < 60_000) return;
  lastWarning = Date.now();
  console.warn('API audit logs could not be saved (HTTP response unaffected)', {
    code: error?.code ?? 'DB_WRITE_ERROR',
    dropped,
  });
};

const auditQueue = createAuditQueue({
  writeBatch,
  maxQueue: env.API_AUDIT_LOG_MAX_QUEUE,
  batchSize: env.API_AUDIT_LOG_BATCH_SIZE,
  onError: warnThrottled,
});

export const enqueueApiAuditLog = (entry) => {
  if (!env.API_AUDIT_LOG_ENABLED) return false;
  return auditQueue.enqueue(entry);
};

export const flushApiAuditLogs = () => auditQueue.flush();

export const purgeOldApiAuditLogs = async () => {
  if (!env.API_AUDIT_LOG_ENABLED) return;
  await query(
    `DELETE FROM app_api_request_logs
      WHERE created_at < DATE_SUB(NOW(3), INTERVAL ? DAY)
      ORDER BY created_at ASC LIMIT 5000`,
    [env.API_AUDIT_LOG_RETENTION_DAYS],
  );
};

let flushTimer = null;
let cleanupTimer = null;
export const startApiAuditLogWriter = () => {
  if (!env.API_AUDIT_LOG_ENABLED || flushTimer) return;
  flushTimer = setInterval(() => {
    void auditQueue.flush();
  }, env.API_AUDIT_LOG_FLUSH_MS);
  flushTimer.unref?.();
  cleanupTimer = setInterval(() => {
    purgeOldApiAuditLogs().catch((error) => warnThrottled(error, auditQueue.stats().dropped));
  }, 5 * 60_000);
  cleanupTimer.unref?.();
};

export const stopApiAuditLogWriter = async () => {
  if (flushTimer) clearInterval(flushTimer);
  if (cleanupTimer) clearInterval(cleanupTimer);
  flushTimer = null;
  cleanupTimer = null;
  return auditQueue.drain(2000);
};
