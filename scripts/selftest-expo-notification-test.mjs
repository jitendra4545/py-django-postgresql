// Zero-network / zero-database test for QA-only notification API business logic.
// Run: node --experimental-test-module-mocks scripts/selftest-expo-notification-test.mjs
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { fileURLToPath, URL } from 'node:url';

const env = { EXPO_NOTIFICATION_TEST_ENABLED: true };
let devices = 1;
let recent = 0;
let selectedNotification = null;
let receiptRows = [];
const notifications = [];

const dbModule = fileURLToPath(new URL('../src/db/pool.js', import.meta.url));
const envModule = fileURLToPath(new URL('../src/config/env.js', import.meta.url));
const notifyModule = fileURLToPath(new URL('../src/services/notifications.js', import.meta.url));
mock.module(envModule, { namedExports: { env } });
mock.module(dbModule, {
  namedExports: {
    one: async (sql, params) => {
      if (sql.includes('FROM app_user_devices')) {
        assert.equal(params[0], 71);
        return { total: devices };
      }
      if (sql.includes('LEFT JOIN app_push_delivery_jobs')) return selectedNotification;
      if (sql.includes('SELECT COUNT(*)') && sql.includes("type='TEST_PUSH'")) return { total: recent };
      throw new Error(`Unexpected database query ${sql}`);
    },
    query: async (sql, params) => {
      assert.ok(sql.includes('FROM app_push_delivery_tickets'));
      assert.equal(params[0], 42);
      return receiptRows;
    },
  },
});
mock.module(notifyModule, {
  namedExports: {
    notifyUser: async (payload) => {
      notifications.push(payload);
      return 120;
    },
  },
});

const { enqueueSelfTestNotification, getSelfTestNotificationStatus } =
  await import('../src/services/notification-testing.js');

const queued = await enqueueSelfTestNotification(71, {
  title: 'My test',
  body: 'My own phone',
});
assert.deepEqual(queued, {
  notificationId: 120,
  queued: true,
  deliveryStatusPath: '/notifications/test/120/status',
});
assert.equal(notifications[0].userId, 71);
assert.equal(notifications[0].type, 'TEST_PUSH');
assert.deepEqual(notifications[0].data, { screen: 'Notifications', test: true });
assert.equal(notifications.length, 1);

devices = 0;
await assert.rejects(enqueueSelfTestNotification(71), (error) => error.code === 'EXPO_DEVICE_NOT_REGISTERED' && error.status === 409);
assert.equal(notifications.length, 1);

devices = 1;
recent = 3;
await assert.rejects(enqueueSelfTestNotification(71), (error) => error.code === 'EXPO_TEST_RATE_LIMITED' && error.status === 429);
assert.equal(notifications.length, 1);

selectedNotification = {
  notificationId: 120,
  createdAt: '2026-10-22T09:00:00.000Z',
  jobId: 42,
  jobStatus: 'SENT',
  attempts: 1,
  lastError: null,
};
receiptRows = [
  { status: 'PENDING', total: '1' },
  { status: 'DELIVERED', total: '2' },
];
const status = await getSelfTestNotificationStatus(71, 120);
assert.equal(status.jobStatus, 'SENT');
assert.deepEqual(status.receipts, { pending: 1, delivered: 2, failed: 0, expired: 0 });
assert.equal(status.deliveredToDeviceNotGuaranteed, true);

selectedNotification = null;
await assert.rejects(getSelfTestNotificationStatus(71, 999), (error) => error.status === 404);

env.EXPO_NOTIFICATION_TEST_ENABLED = false;
await assert.rejects(enqueueSelfTestNotification(71), (error) => error.status === 404);
await assert.rejects(getSelfTestNotificationStatus(71, 120), (error) => error.status === 404);

console.log('PASS: self-user routing, registered device requirement, rate limit, delivery status and disabled gate');
