# Drive Luxury — Expo push notifications and inbox

**Source reviewed:** `drive-luxury-backend-js(3).zip` supplied on 22 October 2026. This patch is backend-only. The Expo TypeScript example in `examples/expo/driveLuxuryNotifications.ts` is a copyable integration helper, **not** a modification to your actual React Native application, which was not supplied in this turn.

## 1. What was implemented before this patch

The backend already stored in-app alerts in `app_notifications`, stored Expo tokens in `app_user_devices` at email/password and Google login, sent push via `expo-server-sdk`, emitted authenticated Socket.IO event `notification.created`, and exposed `GET /notifications`, `POST /notifications/{id}/read`, and `POST /notifications/read-all`.

The following events already created notifications from existing backend handlers:

| Type | Producing action | Recipient and app destination |
| --- | --- | --- |
| `PAYMENT` | Signed Stripe webhook/payment-status change | Client, assigned agents, relevant chauffeur; booking/payment details |
| `BOOKING_DECISION` | Operations confirms/rejects a booking | Booking audience; booking details |
| `NEW_ASSIGNMENT` | Operations assigns a chauffeur | That chauffeur; assignment details |
| `CHAUFFEUR_ASSIGNED` | Operations assigns a chauffeur | Client and agents; booking details (this patch avoids redundant second alert to the assigned chauffeur) |
| `RIDE_STATUS` | Chauffeur changes the assignment state | Booking audience; booking/tracking |
| `CHANGE_REQUEST` | Operations resolves a booking change | Booking audience; booking/change request |
| `CANCELLATION_REQUEST` | Operations reviews cancellation | Booking audience; cancellation/booking |
| `INCIDENT` | Chauffeur submits an incident | Booking audience; booking/incident |
| `NEW_MESSAGE` | A participant posts booking chat text/document | Other active conversation participants; booking chat |

**Added event triggers in this patch:**

| Type | Producing action | Recipient |
| --- | --- | --- |
| `EXPENSE_REVIEW` | Operations updates chauffeur expense status | Expense owner's chauffeur user |
| `INCIDENT_REVIEW` | Operations updates an incident status | Original incident reporter |
| `AIRPORT_VIP_UPDATE` | Operations updates a VIP request | Customer and requesting Agent, deduplicated |
| `CONCIERGE_UPDATE` | Operations updates a Concierge request | Customer and requesting Agent, deduplicated |

Normal draft creation and GPS packets do **not** send push notifications: drafts are not confirmed bookings, and location updates can happen every few seconds. Time-based pickup reminders, promotions, price-drop alerts, new manual-request submission alerts to Operations, and notification category preferences are **not implemented** in this patch.

## 2. Added backend API endpoints

All endpoints below require `Authorization: Bearer <accessToken>` with the **user's own** access token.

### Register/refresh a device token

`PUT /api/v1/notifications/devices`

```json
{
  "deviceId": "ea8af4d3-8e6c-4ce1-a12a-5678941d22e2",
  "platform": "ANDROID",
  "pushToken": "ExponentPushToken[REAL_TOKEN_FROM_EXPO]",
  "appVersion": "1.0.0"
}
```

Returns `200 {"registered":true,"deviceId":"..."}`. The token must be an actual valid Expo token; native FCM/APNs tokens cannot be used here. A device previously associated with another user may only transfer ownership during a successful **login** carrying the same device ID, not via this endpoint.

**Important:** On a shared device, always include `{ device: { deviceId, platform } }` in `POST /auth/login` or `POST /auth/google` before attempting to register the push token for a different account. The existing login `device.pushToken` is still supported; the new endpoint is also useful for permission changes and token refresh without reauthenticating.

`GET /api/v1/notifications/devices` lists device IDs, platforms and `pushEnabled` without exposing their tokens.

`DELETE /api/v1/notifications/devices/{deviceId}` returns `204`. Call when user disables push or signs out. The existing `POST /api/v1/auth/logout` also deletes the device when the `deviceId` is included.

### Inbox and unread badge

- `GET /api/v1/notifications?page=1&perPage=20` — paginated inbox, newest first.
- `GET /api/v1/notifications?unreadOnly=true` — only items not marked read.
- `GET /api/v1/notifications/unread-count` — `{ "count": 4 }`.
- `POST /api/v1/notifications/123/read` — mark this user's notification read, `204`.
- `POST /api/v1/notifications/read-all` — mark all read, `204`.

Every push `data` now contains the existing target IDs plus `type` and `notificationId` so the Expo app can route safely and reconcile the badge. On a tap, **fetch the authoritative booking/assignment/payment state from the API** instead of treating the push as proof of confirmation or payment.

## 3. Database implementation and durability

Existing tables remain unchanged:

- `app_user_devices`: owning user, device ID, platform, token, app version.
- `app_notifications`: user inbox entry, type, title, body, JSON data, read timestamp.

Migration `005_expo_notification_delivery.sql` **adds only**:

- `app_push_delivery_jobs`: one durable queued push job for each new notification, retry state/attempts and lease.
- `app_push_delivery_tickets`: Expo ticket/receipt ID, device ID, SHA-256 token hash, provider outcome.

The notification + queue job are inserted in one database transaction. The server worker sends queued messages in small batches, retries transient exceptions up to five times using backoff, checks receipts after 15 minutes, expires unresolved receipts after 24 hours, and clears a device token when Expo returns `DeviceNotRegistered`. Tickets mean acceptance by Expo; a successful receipt means acceptance by FCM/APNs, **not confirmation that a user saw the notification**.

Workers can run on more than one API replica using atomic claims and a timeout-based lease; delivery is **at least once**, not exactly once. In rare post-send DB/network failures, duplicate system notifications remain possible; client navigation should be idempotent using `notificationId`.

Run your normal migration command **before deploying new code** against a backed-up staging database. The notification enqueuing code expects the new tables to exist. No legacy tables or prior migrations are changed.

## 4. Backend deployment

`npm run migrate` (after staging review and backup), then `npm start`.

On Render/DigitalOcean set:

```dotenv
EXPO_ACCESS_TOKEN=                   # needed if Expo push security is enabled in your account
EXPO_PUSH_WORKER_ENABLED=true
EXPO_PUSH_WORKER_INTERVAL_SECONDS=10
EXPO_PUSH_RECEIPT_INTERVAL_SECONDS=300
```

The existing dependency is `expo-server-sdk@^7.2.0`, which requires Node **22.12+**. Configure your deployment runtime accordingly; this patch updates the backend `package.json` engine requirement to `>=22.12.0` and the lockfile metadata to match.

`EXPO_ACCESS_TOKEN` is a backend secret; never embed it in the Expo React Native app. No Stripe, Twilio, or Maps keys belong in mobile notification code.

## 5. Expo React Native setup

From your **mobile app folder**, not the backend folder:

```bash
npx expo install expo-notifications expo-constants expo-crypto expo-secure-store
```

Add the `expo-notifications` config plugin in your app config and make sure `extra.eas.projectId` is set. Configure Android **FCM v1** credentials and Apple **APNs** credentials with EAS. Build/install an Expo development build (or release build) — do not rely on Expo Go for remote push support.

Copy `examples/expo/driveLuxuryNotifications.ts` into the Expo app and:

1. Call `installNotificationForegroundHandler()` once during app startup.
2. Get the stable `deviceId` using `getPersistentDeviceId()` and include it in the login `device` object.
3. After a successful login, call `registerExpoNotifications({apiOrigin, accessToken, deviceId})` after the user opts in. It asks for OS permission, obtains a project-specific Expo token, and registers it with the backend.
4. On app resume or permission changes, re-register if necessary. Never hardcode an Expo token.
5. Subscribe using `listenForDriveLuxuryNotifications({ onOpened, onReceived })` to refresh inbox/unread count. Route tap data via `notificationDestination(data)` to your **actual app navigation screens**; route names in the example are only placeholders.
6. On sign out, unregister or send the same `deviceId` in `/auth/logout` and delete securely stored access/refresh tokens.

**Android notification channel:** the backend uses `channelId: 'drive-luxury'`; the Expo helper creates that channel before obtaining the token. A mismatched/missing Android channel can affect visibility and sound.

**One shared device:** refresh the device registration for the newly authenticated user; otherwise the old user could keep receiving alerts. Token validation and backend ownership checks are added to reduce this risk.

## 6. Test checklist

1. Run migration 005, start the backend and inspect `app_push_delivery_jobs` and `app_push_delivery_tickets`.
2. Install an EAS development build on real Android/iOS (or a supported simulator with push credentials).
3. Log in as Client and Chauffeur separately with distinct device IDs and register Expo tokens.
4. In the test database, assign a Chauffeur to a confirmed booking; inspect `NEW_ASSIGNMENT` in the chauffeur inbox and push on their device.
5. Change assignment status to `ON_THE_WAY`; verify client `RIDE_STATUS` and booking tracking state.
6. Send a booking chat message; verify `NEW_MESSAGE` for the other participant (not the sender).
7. Use a Stripe test webhook for payment state change; verify exactly one new payment notification when its status actually changes.
8. Verify `GET /notifications/unread-count`, read one item and mark-all.
9. Disable notifications or log out; verify that the device no longer receives push for the previous account.
10. Check queued job state `SENT`, Expo tickets and later `DELIVERED`/`FAILED` receipts. A receipt does not prove device display.

**Before production rollout:** test FCM/APNs delivery on both platforms, app foreground/background/terminated behaviors, webhook duplicates, multiple devices, token refresh, shared-device switching and network outage retries. DB migrations and live push calls were not executed against your environment in this build.

Official docs:
- https://docs.expo.dev/push-notifications/push-notifications-setup/
- https://docs.expo.dev/push-notifications/sending-notifications/
- https://docs.expo.dev/push-notifications/receiving-notifications/
