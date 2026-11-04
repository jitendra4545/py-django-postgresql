import { buildSharedAuditBatch } from './shared-audit-storage.js';
import { setInterval, clearInterval } from 'node:timers';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';
import { createAuditQueue } from './api-audit-queue.js';

const writeBatch = async (entries) => {
  const batch = buildSharedAuditBatch(entries);
  if (batch) await query(batch.sql, batch.values);
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
    `DELETE FROM route_access_logs
      WHERE mobile_source='MOBILE_API' AND created_at < DATE_SUB(NOW(3), INTERVAL ? DAY)
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
