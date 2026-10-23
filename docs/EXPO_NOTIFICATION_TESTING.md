# Drive Luxury — Expo notification QA (Client, Agent and Chauffeur)

This guide applies to the **latest notification-enabled Node.js backend**. The original payment, pricing, booking, Twilio and tracking code is preserved. The existing production notification service already sends backend-generated payloads for booking/payments/chauffeur/chat events; the two endpoints below are **only for validating the Expo integration without first creating a booking**.

## 1. Backend environment and database

Use **Node 22.12+**, a separate staging MySQL database, and your own existing `.env`.

```dotenv
EXPO_PUSH_WORKER_ENABLED=true
EXPO_PUSH_WORKER_INTERVAL_SECONDS=10
EXPO_PUSH_RECEIPT_INTERVAL_SECONDS=300
EXPO_ACCESS_TOKEN=                  # only when Expo push security is enabled
EXPO_NOTIFICATION_TEST_ENABLED=true # staging/QA only, disable afterward
```

After backing up staging DB:

```bash
npm ci
npm run migrate
npm run syntax:check
node --experimental-test-module-mocks scripts/selftest-expo-notification-test.mjs
npm run notifications:selftest
npm start
```

The previous notification migration `005_expo_notification_delivery.sql` creates `app_push_delivery_jobs` and `app_push_delivery_tickets`. The QA endpoints do not add or alter database tables. **Migrate before launching the API worker.**

## 2. Mobile Expo setup (React Native)

```bash
npx expo install expo-notifications expo-constants expo-crypto expo-secure-store
```

Use an **EAS development build or production build on a real physical Android/iOS device**; do not rely on Expo Go for remote push on Android. Configure Firebase Cloud Messaging (FCM v1) credentials for Android, Apple APNs for iOS, and your EAS project ID (`expo.extra.eas.projectId`). Give the app permission to display notifications. The `drive-luxury` Android channel is established by the provided helper and matches the backend message channel.

Copy `examples/expo/driveLuxuryNotifications.ts` to your app, and optionally mount `examples/expo/NotificationTestScreen.tsx` inside a debug-only authenticated screen. Pass `apiOrigin` (e.g. `https://YOUR-RENDER-HOST`) and an authenticated `accessToken` from your existing login screen. **Do not put Stripe, Twilio, Expo access token or JWT secrets in the frontend.**

The app creates a stable `deviceId` with `getPersistentDeviceId()` and gets the real Expo token via `getExpoPushTokenAsync({projectId})`.

## 3. Frontend → backend: register the device

`PUT /api/v1/notifications/devices` (Bearer token)

```json
{
  "deviceId": "ea8af4d3-8e6c-4ce1-a12a-5678941d22e2",
  "platform": "ANDROID",
  "pushToken": "ExponentPushToken[REAL_TOKEN_FROM_EXPO]",
  "appVersion": "1.0.0"
}
```

The phone must generate the actual token; the token in this sample is not usable. Expected: `200 {"registered":true,"deviceId":"..."}`. The backend associates the device with the signed-in user. Use `GET /api/v1/notifications/devices` to confirm `pushEnabled=true`; tokens are not returned to the app by that API. For a shared phone, include `{ "device": {"deviceId": "...", "platform": "ANDROID" } }` in `POST /auth/login` so the login can transfer a previously registered device from the prior account. On logout, call `DELETE /api/v1/notifications/devices/{deviceId}` or include `deviceId` with `/auth/logout`.

## 4. QA push to your own account (no booking required)

Only available when **`EXPO_NOTIFICATION_TEST_ENABLED=true`**; it accepts no `userId`, target phone number or recipient Expo token. The backend verifies that the authenticated user has a registered device and rate-limits tests to **3 per 10 minutes per account**.

`POST /api/v1/notifications/test`

```json
{
  "title": "Drive Luxury push test",
  "body": "Notification integration is working!"
}
```

Expected: `202 Accepted`:

```json
{
  "notificationId": 102,
  "queued": true,
  "deliveryStatusPath": "/notifications/test/102/status"
}
```

`202` means **queued**, not delivered. The delivery worker picks up jobs periodically and the Expo receipt worker checks provider receipts later. If enabled but no registered token: HTTP `409 EXPO_DEVICE_NOT_REGISTERED`. If disabled: `404`. If over the test quota: `429 EXPO_TEST_RATE_LIMITED`. If authentication is missing: `401`.

`GET /api/v1/notifications/test/102/status`:

```json
{
  "notificationId": 102,
  "createdAt": "2026-10-22T09:00:00.000Z",
  "jobStatus": "SENT",
  "attempts": 1,
  "lastError": null,
  "receipts": { "pending": 1, "delivered": 0, "failed": 0, "expired": 0 },
  "deliveredToDeviceNotGuaranteed": true
}
```

Queue statuses: `PENDING`, `PROCESSING`, `RETRY`, `SENT`, `SKIPPED`, `FAILED`. `SENT` means Expo accepted a ticket; `DELIVERED` receipt means FCM/APNs accepted it, **not that the device displayed it**. Most receipts are checked once the ticket is at least 15 minutes old.

Then verify inbox/badge endpoints:

```http
GET /api/v1/notifications?page=1&perPage=20
GET /api/v1/notifications/unread-count
POST /api/v1/notifications/{notificationId}/read
POST /api/v1/notifications/read-all
```

## 5. PowerShell example (Windows / Postman alternative)

```powershell
$base = 'http://localhost:3000'
$token = 'PASTE_YOUR_LOGGED_IN_ACCESS_TOKEN'
$headers = @{ Authorization = "Bearer $token" }

# Register token from the actual EAS development build first, NOT a fake value.
# Test only the current logged-in user's device:
$body = @{ title = 'Drive Luxury QA'; body = 'Test notification from backend' } | ConvertTo-Json
$created = Invoke-RestMethod -Method Post -Uri "$base/api/v1/notifications/test" -Headers $headers -ContentType 'application/json' -Body $body
$created
Invoke-RestMethod -Method Get -Uri "$base/api/v1/notifications/test/$($created.notificationId)/status" -Headers $headers
Invoke-RestMethod -Method Get -Uri "$base/api/v1/notifications/unread-count" -Headers $headers
```

## 6. Existing business events (no test API required)

- Client / Agent: `PAYMENT`, `BOOKING_DECISION`, `CHAUFFEUR_ASSIGNED`, `RIDE_STATUS`, `CHANGE_REQUEST`, `CANCELLATION_REQUEST`, `NEW_MESSAGE`, `AIRPORT_VIP_UPDATE`, `CONCIERGE_UPDATE`.
- Chauffeur: `NEW_ASSIGNMENT`, relevant `RIDE_STATUS` and `NEW_MESSAGE`, `EXPENSE_REVIEW`, `INCIDENT_REVIEW`.

The production backend decides who to notify and builds the `title`, `body`, and `data` JSON itself. The frontend **does not** send notification message bodies for normal bookings. On receiving a push, it navigates using IDs such as `reservationId`, `assignmentId`, and `conversationId`, then fetches current state from the authenticated API. Test with real Client and Chauffeur accounts on separate devices.

## 7. Database check (staging only)

```sql
SELECT id, user_id, type, title, created_at FROM app_notifications
ORDER BY id DESC LIMIT 20;
SELECT id, notification_id, user_id, status, attempts, last_error
FROM app_push_delivery_jobs ORDER BY id DESC LIMIT 20;
SELECT id, job_id, status, provider_error, checked_at
FROM app_push_delivery_tickets ORDER BY id DESC LIMIT 20;
```

If inbox entry exists but no push: check device registration and `EXPO_PUSH_WORKER_ENABLED`. If job is `FAILED`, check network, Expo credentials and provider errors. A push queued with no response on device may be an Android notification-channel or iOS permissions/credentials issue. Do not log push tokens or secrets in production logs.

## 8. Finish the QA session

Set `EXPO_NOTIFICATION_TEST_ENABLED=false` and redeploy. The QA endpoints return 404 when disabled. The actual notification delivery and existing booking/payment features continue working regardless of this flag. Never keep the QA endpoint enabled in your customer-facing production deployment.
