import { Expo } from 'expo-server-sdk';
import { AppError, conflict } from '../common/errors.js';
import { query, transaction } from '../db/pool.js';

// The Expo token is a routing identifier, not proof of which user is logged in.
// Only a successful authenticated login may transfer an existing device/token owner.
export const assertExpoDeviceToken = ({ platform, pushToken }) => {
  if (pushToken == null || pushToken === '') return;
  if (platform === 'WEB' || !Expo.isExpoPushToken(pushToken)) {
    throw new AppError(
      422,
      'EXPO_PUSH_TOKEN_INVALID',
      'A valid Expo iOS/Android push token is required',
    );
  }
};

export const registerPushDevice = async (userId, device, { allowTransfer = false } = {}) => {
  assertExpoDeviceToken(device);
  const pushToken = device.pushToken || null;
  return transaction(async (connection) => {
    const [existing] = await connection.execute(
      'SELECT id,user_id FROM app_user_devices WHERE device_id=? FOR UPDATE',
      [device.deviceId],
    );
    if (existing[0] && Number(existing[0].user_id) !== Number(userId) && !allowTransfer) {
      throw conflict('This device ID belongs to another account; register it after login');
    }
    if (pushToken) {
      const [owners] = await connection.execute(
        'SELECT id,user_id FROM app_user_devices WHERE push_token=? FOR UPDATE',
        [pushToken],
      );
      if (owners.some((owner) => Number(owner.user_id) !== Number(userId)) && !allowTransfer) {
        throw conflict('This Expo push token is registered to another account');
      }
      // Token refreshes and shared-device logins must not notify the previous user.
      await connection.execute(
        'UPDATE app_user_devices SET push_token=NULL,updated_at=NOW() WHERE push_token=? AND device_id<>?',
        [pushToken, device.deviceId],
      );
    }
    await connection.execute(
      `INSERT INTO app_user_devices
         (user_id,device_id,platform,push_token,app_version,last_seen_at,created_at,updated_at)
       VALUES (?,?,?,?,?,NOW(),NOW(),NOW())
       ON DUPLICATE KEY UPDATE
         user_id=VALUES(user_id),platform=VALUES(platform),push_token=VALUES(push_token),
         app_version=VALUES(app_version),last_seen_at=NOW(),updated_at=NOW()`,
      [userId, device.deviceId, device.platform, pushToken, device.appVersion ?? null],
    );
  });
};

export const unregisterPushDevice = async (userId, deviceId) => {
  await query('DELETE FROM app_user_devices WHERE user_id=? AND device_id=?', [userId, deviceId]);
};
