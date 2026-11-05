// Zero-network, zero-database integration smoke test.
// Run: node --experimental-test-module-mocks scripts/selftest-expo-notifications.mjs
import assert from 'node:assert/strict';
import console from 'node:console';
import process from 'node:process';
import { mock } from 'node:test';
import { fileURLToPath, URL } from 'node:url';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-characters';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-characters';

let writes = [];
let job = null;
let ticket = null;
let nextNotificationId = 0;
let transactionCount = 0;
let pushed = [];
const execute = async (sql, params = []) => {
  writes.push({ sql, params });
  if (sql.includes('INSERT INTO app_notifications')) return [{ insertId: ++nextNotificationId }];
  if (sql.includes('INSERT INTO app_push_delivery_jobs')) return [{ insertId: 30 }];
  if (sql.includes('SELECT DISTINCT u.id AS userId')) {
    return [[{ userId: 11 }, { userId: 12 }]];
  }
  if (sql.includes('SELECT id,user_id FROM app_user_devices WHERE device_id=?')) return [[]];
  if (sql.includes('SELECT id,user_id FROM app_user_devices WHERE push_token=?')) return [[]];
  return [{ affectedRows: 1 }];
};
const fakeQuery = async (sql, params = []) => {
  writes.push({ sql, params });
  if (sql.includes('FROM app_push_delivery_jobs j')) return job ? [job] : [];
  if (sql.includes('FROM app_push_delivery_tickets') && sql.includes('SELECT id')) {
    return ticket ? [ticket] : [];
  }
  if (sql.includes('SELECT DISTINCT u.id AS userId')) return [{ userId: 11 }, { userId: 12 }];
  return { affectedRows: 1 };
};
const fakeTransaction = async (fn) => {
  transactionCount += 1;
  return fn({ execute });
};
const db = fileURLToPath(new URL('../src/db/pool.js', import.meta.url));
const rt = fileURLToPath(new URL('../src/services/realtime.js', import.meta.url));
const push = fileURLToPath(new URL('../src/services/push.js', import.meta.url));
mock.module(db, {
  namedExports: { query: fakeQuery, transaction: fakeTransaction, one: async () => null },
});
mock.module(rt, {
  namedExports: { emitToUser: (id, event, payload) => pushed.push({ id, event, payload }) },
});
mock.module(push, {
  namedExports: {
    sendPushToUser: async () => ({
      sent: 1,
      failed: 0,
      invalid: 0,
      tickets: [
        { receiptId: 'receipt-aaa', deviceId: 'device-abc', pushTokenHash: 'a'.repeat(64) },
      ],
    }),
    getExpoPushReceipts: async () => ({
      'receipt-aaa': { status: 'error', details: { error: 'DeviceNotRegistered' } },
    }),
  },
});

const { notifyUser, notifyBookingAudience } = await import('../src/services/notifications.js');
const id = await notifyUser({
  userId: 11,
  type: 'NEW_ASSIGNMENT',
  title: 'Assignment',
  body: 'You have a job',
  data: { assignmentId: 900 },
});
assert.equal(id, 1);
assert.equal(transactionCount, 1, 'notification and job must share a transaction');
assert.ok(
  writes.some(
    (call) => call.sql.includes('INSERT INTO app_push_delivery_jobs') && call.params[0] === id,
  ),
);
assert.equal(pushed[0].event, 'notification.created');

writes = [];
await notifyBookingAudience(
  25,
  { type: 'CHAUFFEUR_ASSIGNED', title: 'Assigned', body: 'Driver assigned' },
  null,
  {
    excludeUserIds: [12],
  },
);
assert.equal(writes.filter((call) => call.sql.includes('INSERT INTO app_notifications')).length, 1);
assert.equal(
  writes.find((call) => call.sql.includes('INSERT INTO app_notifications')).params[0],
  11,
);

const { processPushJobs, checkPushReceipts } =
  await import('../src/services/notification-worker.js');
job = {
  id: 55,
  userId: 11,
  notificationId: 1,
  attempts: 1,
  type: 'NEW_ASSIGNMENT',
  title: 'Assignment',
  body: 'You have a job',
  data: JSON.stringify({ assignmentId: 900 }),
};
writes = [];
const delivered = await processPushJobs();
assert.deepEqual(delivered, { claimed: 1 });
assert.ok(writes.some((call) => call.sql.includes('INSERT INTO app_push_delivery_tickets')));
assert.ok(
  writes.some(
    (call) => call.sql.includes('SET status=?,lock_token=NULL') && call.params[0] === 'SENT',
  ),
);

ticket = {
  id: 51,
  userId: 11,
  deviceId: 'device-abc',
  pushTokenHash: 'a'.repeat(64),
  receiptId: 'receipt-aaa',
};
writes = [];
const checked = await checkPushReceipts();
assert.deepEqual(checked, { checked: 1 });
assert.ok(writes.some((call) => call.sql.includes('SHA2(push_token,256)=?')));
console.log('PASS: inbox/outbox atomicity, recipient exclusion, job ticket, receipt invalidation');
