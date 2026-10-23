import crypto from 'node:crypto';
import { Expo } from 'expo-server-sdk';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';

const expo = new Expo({ accessToken: env.EXPO_ACCESS_TOKEN || undefined });
export const hashExpoPushToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// An Expo ticket only means that Expo accepted the message for forwarding.
// Receipts are checked separately by the persistent notification worker.
export const sendPushToUser = async (userId, notification, data = {}) => {
  const devices = await query(
    `SELECT device_id AS deviceId,push_token AS pushToken
       FROM app_user_devices
      WHERE user_id=? AND platform IN ('IOS','ANDROID') AND push_token IS NOT NULL`,
    [userId],
  );
  const eligible = devices.filter((item) => Expo.isExpoPushToken(item.pushToken));
  const invalid = devices.filter((item) => !Expo.isExpoPushToken(item.pushToken));
  for (const device of invalid) {
    await query(
      'UPDATE app_user_devices SET push_token=NULL,updated_at=NOW() WHERE user_id=? AND device_id=? AND push_token=?',
      [userId, device.deviceId, device.pushToken],
    );
  }
  if (!eligible.length) return { sent: 0, failed: 0, invalid: invalid.length, tickets: [] };

  const messages = eligible.map((item) => ({
    to: item.pushToken,
    title: notification.title,
    body: notification.body,
    sound: 'default',
    channelId: 'drive-luxury',
    priority: 'high',
    data,
  }));

  const tickets = [];
  let sent = 0;
  let failed = 0;
  let offset = 0;
  for (const chunk of expo.chunkPushNotifications(messages)) {
    const results = await expo.sendPushNotificationsAsync(chunk);
    for (let index = 0; index < results.length; index += 1) {
      const ticket = results[index];
      const device = eligible[offset + index];
      if (ticket.status === 'ok' && ticket.id) {
        sent += 1;
        tickets.push({
          receiptId: ticket.id,
          deviceId: device.deviceId,
          pushTokenHash: hashExpoPushToken(device.pushToken),
        });
      } else {
        failed += 1;
        const code = ticket.details?.error || 'EXPO_TICKET_REJECTED';
        console.warn('Expo push ticket rejected', { userId, code });
        if (code === 'DeviceNotRegistered') {
          await query(
            'UPDATE app_user_devices SET push_token=NULL,updated_at=NOW() WHERE user_id=? AND device_id=? AND push_token=?',
            [userId, device.deviceId, device.pushToken],
          );
        }
      }
    }
    offset += chunk.length;
  }
  return { sent, failed, invalid: invalid.length, tickets };
};

export const getExpoPushReceipts = async (receiptIds) => {
  const result = {};
  for (const chunk of expo.chunkPushNotificationReceiptIds(receiptIds)) {
    Object.assign(result, await expo.getPushNotificationReceiptsAsync(chunk));
  }
  return result;
};
