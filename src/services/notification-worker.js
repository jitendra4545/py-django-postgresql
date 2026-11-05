import crypto from 'node:crypto';
import { query, transaction } from '../db/pool.js';
import { getExpoPushReceipts, sendPushToUser } from './push.js';

const MAX_ATTEMPTS = 5;
const JOB_BATCH = 25;
const RECEIPT_BATCH = 100;
const errorCode = (error) =>
  String(error?.code || error?.name || 'EXPO_DELIVERY_FAILED').slice(0, 120);
const asJson = (value) => (typeof value === 'string' ? JSON.parse(value) : (value ?? {}));

// Atomic single-statement claim. A crashed worker's lease expires after two minutes.
export const claimPushJobs = async (limit = JOB_BATCH) => {
  const lock = crypto.randomUUID();
  await query(
    `UPDATE app_push_delivery_jobs
        SET status='PROCESSING',attempts=attempts+1,lock_token=?,
            locked_until=DATE_ADD(NOW(),INTERVAL 2 MINUTE),updated_at=NOW()
      WHERE ((status IN ('PENDING','RETRY') AND next_attempt_at<=NOW())
          OR (status='PROCESSING' AND locked_until<NOW()))
        AND attempts<?
      ORDER BY id LIMIT ?`,
    [lock, MAX_ATTEMPTS, limit],
  );
  return query(
    `SELECT j.id,j.user_id AS userId,j.notification_id AS notificationId,
            j.attempts,n.type,n.title,n.body,n.data
       FROM app_push_delivery_jobs j
       JOIN app_notifications n ON n.id=j.notification_id AND n.user_id=j.user_id
      WHERE j.lock_token=? AND j.status='PROCESSING'`,
    [lock],
  ).then((rows) => ({ lock, rows }));
};

export const processPushJobs = async () => {
  // A job that exhausted attempts before a crash must not remain PROCESSING forever.
  await query(
    `UPDATE app_push_delivery_jobs
        SET status='FAILED',lock_token=NULL,locked_until=NULL,last_error='MAX_ATTEMPTS',updated_at=NOW()
      WHERE status='PROCESSING' AND locked_until<NOW() AND attempts>=?`,
    [MAX_ATTEMPTS],
  );
  const { lock, rows } = await claimPushJobs();
  for (const job of rows) {
    try {
      const result = await sendPushToUser(
        job.userId,
        { title: job.title, body: job.body },
        { ...asJson(job.data), type: job.type, notificationId: job.notificationId },
      );
      await transaction(async (connection) => {
        for (const ticket of result.tickets) {
          await connection.execute(
            `INSERT INTO app_push_delivery_tickets
              (job_id,user_id,device_id,push_token_hash,receipt_id,status,created_at)
             VALUES (?,?,?,?,?,'PENDING',NOW())
             ON DUPLICATE KEY UPDATE receipt_id=VALUES(receipt_id)`,
            [job.id, job.userId, ticket.deviceId, ticket.pushTokenHash, ticket.receiptId],
          );
        }
        const status = result.sent ? 'SENT' : result.failed ? 'FAILED' : 'SKIPPED';
        await connection.execute(
          `UPDATE app_push_delivery_jobs
              SET status=?,lock_token=NULL,locked_until=NULL,
                  last_error=?,updated_at=NOW()
            WHERE id=? AND status='PROCESSING' AND lock_token=?`,
          [status, result.failed ? 'EXPO_TICKET_REJECTED' : null, job.id, lock],
        );
      });
    } catch (error) {
      const attempts = Number(job.attempts);
      await query(
        `UPDATE app_push_delivery_jobs
            SET status=?,last_error=?,lock_token=NULL,locked_until=NULL,
                next_attempt_at=DATE_ADD(NOW(),INTERVAL ? SECOND),updated_at=NOW()
          WHERE id=? AND status='PROCESSING' AND lock_token=?`,
        [
          attempts >= MAX_ATTEMPTS ? 'FAILED' : 'RETRY',
          errorCode(error),
          Math.min(60 * 2 ** Math.max(attempts - 1, 0), 1800),
          job.id,
          lock,
        ],
      );
      console.error('Expo push delivery queued for retry', {
        jobId: job.id,
        code: errorCode(error),
      });
    }
  }
  return { claimed: rows.length };
};

export const checkPushReceipts = async () => {
  // Expo deletes receipts after 24 hours. Keep ticket state bounded and auditable.
  await query(
    `UPDATE app_push_delivery_tickets
        SET status='EXPIRED',checked_at=NOW(),provider_error='RECEIPT_EXPIRED'
      WHERE status='PENDING' AND created_at<DATE_SUB(NOW(),INTERVAL 24 HOUR)`,
  );
  const tickets = await query(
    `SELECT id,user_id AS userId,device_id AS deviceId,
            push_token_hash AS pushTokenHash,receipt_id AS receiptId
       FROM app_push_delivery_tickets
      WHERE status='PENDING' AND created_at<=DATE_SUB(NOW(),INTERVAL 15 MINUTE)
      ORDER BY id LIMIT ?`,
    [RECEIPT_BATCH],
  );
  if (!tickets.length) return { checked: 0 };
  const receipts = await getExpoPushReceipts(tickets.map((ticket) => ticket.receiptId));
  let checked = 0;
  for (const ticket of tickets) {
    const receipt = receipts[ticket.receiptId];
    if (!receipt) continue; // Expo has not yet published the receipt.
    const status = receipt.status === 'ok' ? 'DELIVERED' : 'FAILED';
    const code = receipt.details?.error ?? (status === 'FAILED' ? 'EXPO_RECEIPT_ERROR' : null);
    await query(
      `UPDATE app_push_delivery_tickets
          SET status=?,provider_error=?,checked_at=NOW()
        WHERE id=? AND status='PENDING'`,
      [status, code, ticket.id],
    );
    if (code === 'DeviceNotRegistered') {
      // The hash guards against clearing a NEW token registered on this device.
      await query(
        `UPDATE app_user_devices SET push_token=NULL,updated_at=NOW()
          WHERE user_id=? AND device_id=? AND SHA2(push_token,256)=?`,
        [ticket.userId, ticket.deviceId, ticket.pushTokenHash],
      );
    }
    checked += 1;
    if (status === 'FAILED')
      console.warn('Expo push receipt failed', { receiptId: ticket.receiptId, code });
  }
  return { checked };
};
