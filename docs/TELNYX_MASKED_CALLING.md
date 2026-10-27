# Drive Luxury — Telnyx masked calling integration (latest backend)

## What is included

- Uses the existing authenticated `POST /api/v1/communication/bookings/{reservationId}/masked-call` endpoint.
- Booking access, recipient-role restrictions, active-booking checks, rate limit (5 calls / 10 minutes), and real registered E.164 caller/recipient numbers.
- The API prepares a **time-limited routing session** and returns the **configured Telnyx-owned phone number**. It **does not initiate** a call or return a user's private phone number.
- Expo React Native invokes `Linking.openURL('tel:' + dialNumber)`; this is a normal PSTN call, **not** in-app VoIP.
- Signed webhook `POST /api/v1/communication/telnyx/webhook` accepts incoming-call events, matches a verified registered caller to exactly one unexpired authorized route, answers, and dials the recipient.
- Outbound dial request uses `link_to` and `bridge_on_answer: true` and explicitly sets `from` to the Telnyx-owned DID. **Do not use `bridge_intent: true` without reviewing Telnyx's caller-ID behavior**: it can replace the outbound From field with the inbound caller's private number.
- Duplicate Telnyx webhooks are ignored via the new event table. The route cannot silently switch recipients during another active call from the same user.
- Direct chauffeur phone is no longer part of the client tracking response.
- All preexisting Expo notification/login, Stripe, booking, and routing files are preserved except the listed mask-call patches.

## Client's current Telnyx trial limitation

The client provided a v2 API key **via a one-time link**, and one verified Bahrain number. A verified test destination is NOT an owned Telnyx inbound number. This package does not include or fetch the API key. A live two-party masked call needs ALL of:

1. Telnyx Voice API / Call Control **Connection ID** with an outbound voice profile authorized for target destinations.
2. A **Telnyx-owned, voice-enabled DID** assigned to that connection and configured for inbound Call Control.
3. Telnyx **webhook signature verification public key** (not the private API key).
4. Telnyx account approval/upgrade for all countries/numbers needed in a two-party call. The current trial may allow only one verified outbound destination.
5. The calling user and recipient each have different valid E.164 phone numbers in Drive Luxury database. The calling user must actually dial from their registered number.

Do **not** place a one-time link, raw API key, private caller numbers, or the existing local `.env` inside the ZIP, frontend app, version control, or a ticket.

## Environment variables

```dotenv
MASKED_CALL_PROVIDER=disabled
MASKED_CALL_TTL_SECONDS=600
TELNYX_API_KEY=
TELNYX_CONNECTION_ID=
TELNYX_MASKED_NUMBER=
TELNYX_PUBLIC_KEY=
TELNYX_ALLOWED_DESTINATIONS=+973XXXXXXXX
SUPPORT_PHONE=
```

Set `MASKED_CALL_PROVIDER=telnyx` only once all required config and SQL tables exist, then put the **private** Telnyx API key into the hosting provider's secret environment configuration. `TELNYX_ALLOWED_DESTINATIONS` is an **additional backend restriction** for the trial; it does not bypass Telnyx carrier/trial restrictions. Keep disabled in production until a genuine call is verified.

Configure the Voice API webhook in Telnyx Mission Control:

`https://api.drive-luxury.com/api/v1/communication/telnyx/webhook`

Ensure the app proxy forwards HTTP POST intact and that TLS works. Only Telnyx should POST to this public endpoint. It uses the `telnyx-signature-ed25519` and `telnyx-timestamp` headers, verifies over the raw body, and rejects replay timestamps > 5 minutes away. Mobile apps do NOT send bearer tokens to the webhook.

## Database migration

**New file:** `migrations/006_telnyx_masked_call_routes.sql`.

The uploaded ZIP already has `005_expo_notification_delivery.sql`. Do not reuse migration version `005`. The new migration creates:

- `app_telnyx_call_routes`: booking-authorized caller/recipient and Telnyx call-control IDs.
- `app_telnyx_webhook_events`: deduplicate provider webhooks.

Prerequisite: `app_masked_calls` table exists. **Do not recreate the client's existing MySQL database.** Your past `001_release_1_mobile_foundation.sql` checksum mismatch must be reconciled before using `npm run migrate` against a shared database. Compare the client's DB with the new migration, back it up, and apply the reviewed incremental SQL in staging first. MySQL DDL is not rolled back automatically by transactions.

## Flow & request examples

Client calls assigned chauffeur:

```http
POST /api/v1/communication/bookings/11898/masked-call
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

```json
{ "recipientRole": "CHAUFFEUR" }
```

Possible success response (**example data**):

```json
{
  "id": 42,
  "status": "READY",
  "dialNumber": "+14155550100",
  "expiresInSeconds": 600,
  "reused": false
}
```

- `201` new route; `200` reused route.
- `401/403` missing auth or booking access; `404` missing booking or assigned chauffeur; `409` inactive booking or already active different masked route; `422` invalid participant number; `503` disabled/unconfigured telecom provider.
- Chauffeur to client: `{ "recipientRole": "CLIENT" }`; client/agent to support: `{ "recipientRole": "SUPPORT" }` (subject to user role). For admin/staff, outbound calls use the configured `SUPPORT_PHONE` as the authenticated caller, so that actual company number must place the call.
- Private user numbers **never appear in this API response**; caller/recipient E.164 numbers are stored in backend MySQL for call routing and should have restricted access and retention policies.

React Native Expo example:

```js
import { Linking } from 'react-native';
const response = await fetch(
  `${API_URL}/api/v1/communication/bookings/${reservationId}/masked-call`,
  {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipientRole: 'CHAUFFEUR' }),
  },
);
const result = await response.json();
if (!response.ok) throw new Error(result.error?.message ?? 'Unable to prepare masked call');
if (!/^\+[1-9]\d{7,14}$/.test(result.dialNumber)) throw new Error('Invalid Telnyx dial number');
await Linking.openURL(`tel:${result.dialNumber}`);
```

## Test without live Telnyx credentials

```bash
npm ci
npm run syntax:check
npm run telnyx:check
npm test
```

The `telnyx:check` script tests E.164 parsing, Ed25519 webhook authentication and replay detection, allowlist enforcement, and outbound caller-ID preservation without making network calls. Full payment, booking, notification, and GPS regression tests should be run in your deployment/staging environment.

## Testing and operational caveats

- **Live calls cannot be confirmed until a Telnyx-owned DID, connection ID, public verification key and an eligible outbound destination are configured.** A successful REST response only confirms a route was prepared; it does not prove telecom setup or deliverability.
- `bridge_on_answer` requests the provider to connect the legs after the callee answers. Verify in Telnyx call logs and on both phones that only the masked DID appears as caller ID before declaring privacy guaranteed.
- **Security**: caller-ID lookup is helpful but not a strong proof against spoofed PSTN caller IDs. For high-assurance use add phone verification/DTMF authorization and review all other legacy endpoints for unmasked number disclosure.
- Keep just one active call per initiating user to prevent an ambiguous route if the same user repeatedly calls the shared DID for different bookings.
- A persistent route table stores telephone numbers. Restrict DB access and implement retention/deletion policies.
- No native React Native SDK or new npm dependency is required for this PSTN/dialer-based integration.
