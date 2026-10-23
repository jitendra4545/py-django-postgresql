/**
 * Copy into your Expo React Native app (not compiled by the Express backend).
 * Dependencies: expo-notifications, expo-constants, expo-crypto, expo-secure-store.
 * Call only AFTER authentication; keep the bearer token in secure storage.
 */
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const DEVICE_KEY = 'drive-luxury:device-id';
const CHANNEL_ID = 'drive-luxury';

export type DriveLuxuryPushData = {
  notificationId?: number;
  type?: string;
  reservationId?: number;
  paymentId?: number;
  assignmentId?: number;
  conversationId?: number;
  requestId?: number;
  incidentId?: number;
  expenseId?: number;
  requestType?: string;
  status?: string;
  [key: string]: unknown;
};

export async function getPersistentDeviceId(): Promise<string> {
  let id = await SecureStore.getItemAsync(DEVICE_KEY);
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync(DEVICE_KEY, id);
  }
  return id;
}

export function getDevicePlatform(): 'ANDROID' | 'IOS' {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    throw new Error('Expo push registration is for iOS/Android only');
  }
  return Platform.OS === 'android' ? 'ANDROID' : 'IOS';
}

export function installNotificationForegroundHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function registerExpoNotifications({
  apiOrigin,
  accessToken,
  deviceId,
}: {
  apiOrigin: string;
  accessToken: string;
  deviceId: string;
}): Promise<{ registered: boolean; reason?: string }> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return { registered: false, reason: 'UNSUPPORTED_PLATFORM' };
  }

  // Match the channelId chosen by the backend push message.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Drive Luxury updates',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  const permission = current.granted ? current : await Notifications.requestPermissionsAsync();
  if (!permission.granted) {
    await unregisterExpoNotifications({ apiOrigin, accessToken, deviceId });
    return { registered: false, reason: 'PERMISSION_DENIED' };
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) throw new Error('Missing Expo EAS projectId in app config');

  const pushToken = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const response = await fetch(`${apiOrigin.replace(/\/$/, '')}/api/v1/notifications/devices`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      deviceId,
      platform: getDevicePlatform(),
      pushToken,
      appVersion: Constants.expoConfig?.version ?? undefined,
    }),
  });
  if (!response.ok) throw new Error(`Register push device failed: HTTP ${response.status}`);
  return { registered: true };
}

export async function unregisterExpoNotifications({
  apiOrigin,
  accessToken,
  deviceId,
}: {
  apiOrigin: string;
  accessToken: string;
  deviceId: string;
}): Promise<void> {
  const response = await fetch(
    `${apiOrigin.replace(/\/$/, '')}/api/v1/notifications/devices/${encodeURIComponent(deviceId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw new Error(`Unregister push device failed: HTTP ${response.status}`);
}

export function listenForDriveLuxuryNotifications({
  onOpened,
  onReceived,
}: {
  onOpened: (data: DriveLuxuryPushData) => void;
  onReceived?: () => void;
}): () => void {
  const foreground = Notifications.addNotificationReceivedListener(() => onReceived?.());
  const opened = Notifications.addNotificationResponseReceivedListener((response) => {
    onOpened(response.notification.request.content.data as DriveLuxuryPushData);
  });
  // If the app was terminated when the user tapped, handle the initial response too.
  Notifications.getLastNotificationResponseAsync()
    .then((response) => {
      if (response) onOpened(response.notification.request.content.data as DriveLuxuryPushData);
    })
    .catch(() => undefined);
  return () => {
    foreground.remove();
    opened.remove();
  };
}

// Never blindly navigate to a URL sent in push data. Route only via known IDs.
export function notificationDestination(
  data: DriveLuxuryPushData,
):
  | { screen: 'BookingDetails'; reservationId: number }
  | { screen: 'ChauffeurAssignment'; assignmentId: number }
  | { screen: 'BookingChat'; conversationId: number }
  | { screen: 'ManualRequest'; requestId: number; requestType: string }
  | { screen: 'ChauffeurExpense'; expenseId: number }
  | { screen: 'IncidentReport'; incidentId: number }
  | { screen: 'Notifications' } {
  if (data.type === 'NEW_ASSIGNMENT' && Number(data.assignmentId) > 0) {
    return { screen: 'ChauffeurAssignment', assignmentId: Number(data.assignmentId) };
  }
  if (data.type === 'NEW_MESSAGE' && Number(data.conversationId) > 0) {
    return { screen: 'BookingChat', conversationId: Number(data.conversationId) };
  }
  if (
    ['AIRPORT_VIP_UPDATE', 'CONCIERGE_UPDATE'].includes(String(data.type)) &&
    Number(data.requestId) > 0
  ) {
    return {
      screen: 'ManualRequest',
      requestId: Number(data.requestId),
      requestType: String(data.requestType),
    };
  }
  if (data.type === 'EXPENSE_REVIEW' && Number(data.expenseId) > 0) {
    return { screen: 'ChauffeurExpense', expenseId: Number(data.expenseId) };
  }
  if (data.type === 'INCIDENT_REVIEW' && Number(data.incidentId) > 0) {
    return { screen: 'IncidentReport', incidentId: Number(data.incidentId) };
  }
  if (Number(data.reservationId) > 0) {
    return { screen: 'BookingDetails', reservationId: Number(data.reservationId) };
  }
  return { screen: 'Notifications' };
}

/**
 * QA helper. The backend must explicitly enable EXPO_NOTIFICATION_TEST_ENABLED.
 * This sends to the signed-in account's own registered devices only.
 */
export type ExpoTestPushResult = {
  notificationId: number;
  queued: boolean;
  deliveryStatusPath: string;
};

export type ExpoTestPushStatus = {
  notificationId: number;
  createdAt: string;
  jobStatus: 'PENDING' | 'PROCESSING' | 'RETRY' | 'SENT' | 'SKIPPED' | 'FAILED' | 'NOT_QUEUED';
  attempts: number;
  lastError: string | null;
  receipts: { pending: number; delivered: number; failed: number; expired: number };
  deliveredToDeviceNotGuaranteed: boolean;
};

async function notificationApiError(response: Response): Promise<Error> {
  const result = await response.json().catch(() => null);
  const code = result?.error?.code ?? `HTTP_${response.status}`;
  const message = result?.error?.message ?? `Notification request failed (${response.status})`;
  return new Error(`${code}: ${message}`);
}

export async function sendExpoTestNotification({
  apiOrigin,
  accessToken,
  title = 'Drive Luxury test notification',
  body = 'Hello from the Drive Luxury Expo test screen!',
}: {
  apiOrigin: string;
  accessToken: string;
  title?: string;
  body?: string;
}): Promise<ExpoTestPushResult> {
  const response = await fetch(`${apiOrigin.replace(/\/$/, '')}/api/v1/notifications/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ title, body }),
  });
  if (!response.ok) throw await notificationApiError(response);
  return response.json();
}

export async function getExpoTestNotificationStatus({
  apiOrigin,
  accessToken,
  notificationId,
}: {
  apiOrigin: string;
  accessToken: string;
  notificationId: number;
}): Promise<ExpoTestPushStatus> {
  const response = await fetch(
    `${apiOrigin.replace(/\/$/, '')}/api/v1/notifications/test/${notificationId}/status`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) throw await notificationApiError(response);
  return response.json();
}

export async function getExpoUnreadNotificationCount({
  apiOrigin,
  accessToken,
}: {
  apiOrigin: string;
  accessToken: string;
}): Promise<number> {
  const response = await fetch(`${apiOrigin.replace(/\/$/, '')}/api/v1/notifications/unread-count`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw await notificationApiError(response);
  const data = await response.json();
  return Number(data.count) || 0;
}
