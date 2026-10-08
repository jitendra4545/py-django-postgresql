import { Expo } from 'expo-server-sdk';
import { env } from '../config/env.js';
import { query } from '../db/pool.js';

const expo = new Expo({ accessToken: env.EXPO_ACCESS_TOKEN || undefined });

export const sendPushToUser = async (userId, notification, data = {}) => {
  const devices = await query(
    'SELECT push_token FROM app_user_devices WHERE user_id=? AND push_token IS NOT NULL',
    [userId],
  );
  const tokens = devices
    .map((item) => item.push_token)
    .filter((token) => Expo.isExpoPushToken(token));
  if (!tokens.length) return { sent: 0, invalid: devices.length };

  const messages = tokens.map((to) => ({
    to,
    sound: 'default',
    title: notification.title,
    body: notification.body,
    data,
  }));
  const tickets = [];
  for (const chunk of expo.chunkPushNotifications(messages)) {
    tickets.push(...(await expo.sendPushNotificationsAsync(chunk)));
  }
  return {
    sent: tickets.filter((ticket) => ticket.status === 'ok').length,
    failed: tickets.filter((ticket) => ticket.status === 'error').length,
    invalid: devices.length - tokens.length,
  };
};
