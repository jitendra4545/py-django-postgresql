/**
 * OPTIONAL QA SCREEN -- copy alongside driveLuxuryNotifications.ts into your
 * React Native Expo app. This is not mounted in the real Drive Luxury frontend.
 * Receive apiOrigin and accessToken from your existing authenticated session.
 * Requires EXPO_NOTIFICATION_TEST_ENABLED=true only on your staging backend.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  getPersistentDeviceId,
  registerExpoNotifications,
  sendExpoTestNotification,
  getExpoTestNotificationStatus,
  getExpoUnreadNotificationCount,
  installNotificationForegroundHandler,
  listenForDriveLuxuryNotifications,
  type ExpoTestPushStatus,
} from './driveLuxuryNotifications';

type Props = { apiOrigin: string; accessToken: string };

export default function NotificationTestScreen({ apiOrigin, accessToken }: Props) {
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [notificationId, setNotificationId] = useState<number | null>(null);
  const [delivery, setDelivery] = useState<ExpoTestPushStatus | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [message, setMessage] = useState('Register an Expo push token before sending.');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    installNotificationForegroundHandler();
    const unsubscribe = listenForDriveLuxuryNotifications({
      onOpened: () => setMessage('Push opened. You can now navigate using notificationDestination().'),
      onReceived: () => setMessage('Expo notification received while app is open.'),
    });
    return unsubscribe;
  }, []);

  async function doTask(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.heading}>Drive Luxury · Expo Push QA</Text>
      <Text style={styles.text}>Use an installed EAS development build, not Expo Go. Sign in first.</Text>

      <Action label="1. Register this device" disabled={busy} onPress={() => doTask(async () => {
        const id = await getPersistentDeviceId();
        const result = await registerExpoNotifications({ apiOrigin, accessToken, deviceId: id });
        setDeviceId(id);
        setMessage(result.registered ? `Registered device ${id}` : `Not registered: ${result.reason}`);
      })} />

      <Action label="2. Send test notification" disabled={busy || !deviceId} onPress={() => doTask(async () => {
        const created = await sendExpoTestNotification({ apiOrigin, accessToken });
        setNotificationId(created.notificationId);
        setDelivery(null);
        setMessage(`Queued notification ${created.notificationId}. Check its delivery status next.`);
      })} />

      <Action label="3. Check delivery status" disabled={busy || !notificationId} onPress={() => doTask(async () => {
        if (notificationId === null) return;
        const status = await getExpoTestNotificationStatus({ apiOrigin, accessToken, notificationId });
        setDelivery(status);
        setMessage(`Queue: ${status.jobStatus}; Expo receipt results may take at least 15 minutes.`);
      })} />

      <Action label="4. Check unread inbox count" disabled={busy} onPress={() => doTask(async () => {
        const count = await getExpoUnreadNotificationCount({ apiOrigin, accessToken });
        setUnread(count);
        setMessage(`Unread notifications: ${count}`);
      })} />

      {busy && <ActivityIndicator />}
      <Text style={styles.result}>{message}</Text>
      {unread !== null && <Text style={styles.text}>Unread: {unread}</Text>}
      {delivery && <Text selectable style={styles.json}>{JSON.stringify(delivery, null, 2)}</Text>}
      <Text style={styles.hint}>
        A QUEUED or SENT response is not proof of phone delivery. You must test with a real Expo
        development build and valid Android FCM / iOS APNs credentials.
      </Text>
    </ScrollView>
  );
}

function Action({ label, disabled, onPress }: { label: string; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.action, disabled && styles.disabled]}
    >
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flexGrow: 1, padding: 20, gap: 14, backgroundColor: '#121826' },
  heading: { fontSize: 21, fontWeight: '700', color: '#fff' },
  text: { color: '#d8e0ef' },
  action: { borderRadius: 12, backgroundColor: '#3067be', padding: 14 },
  actionText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  disabled: { opacity: 0.45 },
  result: { color: '#d8e0ef', fontWeight: '600', marginTop: 6 },
  json: { color: '#eaf1fb', backgroundColor: '#26344b', padding: 12, borderRadius: 8 },
  hint: { color: '#a7b5cb', fontSize: 12, marginTop: 12 },
});
