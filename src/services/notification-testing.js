import { env } from '../config/env.js';
import { AppError, notFound } from '../common/errors.js';
import { one, query } from '../db/pool.js';
import { notifyUser } from './notifications.js';

// This opt-in QA route can only enqueue a notification for the *authenticated*
// account. It never accepts a destination user ID, phone number or push token.
// Disable EXPO_NOTIFICATION_TEST_ENABLED outside controlled staging tests.
const assertTestMode = () => {
  if (!env.EXPO_NOTIFICATION_TEST_ENABLED) throw notFound('Notification test API is disabled');
};

export const enqueueSelfTestNotification = async (userId, { title, body } = {}) => {
  assertTestMode();
  const devices = await one(
    `SELECT COUNT(*) AS total FROM app_user_devices
      WHERE user_id=? AND platform IN ('IOS','ANDROID') AND push_token IS NOT NULL`,
    [userId],
  );
  if (Number(devices?.total || 0) === 0) {
    throw new AppError(
      409,
      'EXPO_DEVICE_NOT_REGISTERED',
      'Register an Expo device token for this account before sending a test push',
    );
  }

  // A per-user database window works across multiple Render/server replicas.
  const recent = await one(
    `SELECT COUNT(*) AS total FROM app_notifications
      WHERE user_id=? AND type='TEST_PUSH'
        AND created_at > DATE_SUB(NOW(), INTERVAL 10 MINUTE)`,
    [userId],
  );
  if (Number(recent?.total || 0) >= 3) {
    throw new AppError(
      429,
      'EXPO_TEST_RATE_LIMITED',
      'At most three test notifications are allowed per account every ten minutes',
    );
  }
  const notificationId = await notifyUser({
    userId,
    type: 'TEST_PUSH',
    title: title ?? 'Drive Luxury test notification',
    body: body ?? 'Expo push notifications are connected to your Drive Luxury account.',
    data: { screen: 'Notifications', test: true },
  });
  return {
    notificationId,
    queued: true,
    deliveryStatusPath: `/notifications/test/${notificationId}/status`,
  };
};

export const getSelfTestNotificationStatus = async (userId, notificationId) => {
  assertTestMode();
  const item = await one(
    `SELECT n.id AS notificationId,n.created_at AS createdAt,
            j.id AS jobId,j.status AS jobStatus,j.attempts,
            j.last_error AS lastError
       FROM app_notifications n
       LEFT JOIN app_push_delivery_jobs j
         ON j.notification_id=n.id AND j.user_id=n.user_id
      WHERE n.id=? AND n.user_id=? AND n.type='TEST_PUSH'`,
    [notificationId, userId],
  );
  if (!item) throw notFound('Test notification does not exist for this account');

  const rows = item.jobId
    ? await query(
        `SELECT status,COUNT(*) AS total FROM app_push_delivery_tickets
          WHERE job_id=? GROUP BY status`,
        [item.jobId],
      )
    : [];
  const receipts = { pending: 0, delivered: 0, failed: 0, expired: 0 };
  for (const row of rows) {
    const key = String(row.status).toLowerCase();
    if (Object.hasOwn(receipts, key)) receipts[key] = Number(row.total);
  }
  return {
    notificationId: Number(item.notificationId),
    createdAt: item.createdAt,
    jobStatus: item.jobStatus ?? 'NOT_QUEUED',
    attempts: Number(item.attempts || 0),
    lastError: item.lastError ?? null,
    receipts,
    // An Expo/FCM/APNs receipt never proves that a person saw the alert.
    deliveredToDeviceNotGuaranteed: true,
  };
};
