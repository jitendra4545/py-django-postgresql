# Production communication, tracking and storage integration

## Booking chat

1. Load `GET /communication/conversations` for the inbox. Use its `unreadCount`; do not calculate unread state only from the device cache.
2. Open/synchronize a booking chat with `POST /communication/bookings/{reservationId}/conversation`.
3. Join Socket.IO room event `conversation.join` with the returned ID, then load paginated history from `GET /communication/conversations/{conversationId}/messages`.
4. Send text or owned booking documents with `POST /communication/conversations/{conversationId}/messages`. Document messages are accepted only when the document is authorized, unexpired, and tied to the same booking when it has a reservation ID.
5. When the chat is visible, call `POST /communication/conversations/{conversationId}/read`. New messages create database notifications, Socket.IO events and Expo pushes for other participants.

On every socket connection the server emits `session.ready`. When `recovered=false`, reload the inbox/history and rejoin the visible conversation. When `recovered=true`, Socket.IO recovered the short disconnection state.

## Shared Client and Agent tracking

Use `GET /bookings/{reservationId}/tracking` in both Client and Agent applications. Authorization uses the same assigned-client rules as booking details. The response contains:

- `assignments`: every non-declined/non-cancelled chauffeur assignment and its latest location;
- `assignment` and `location`: the current compatibility view;
- `locationIsStale`: whether the latest sample is older than the configured threshold;
- `staleAfterSeconds` and `serverTime`: values for consistent UI state;
- `timeline`: append-only booking status events.

Chauffeur location submission is serialized per assignment. Samples older than the latest sample return `LOCATION_NOT_NEWER`; samples inside the minimum interval return `LOCATION_THROTTLED` with `retryAfterSeconds`.

## Storage

`POST /documents` always uses the private storage path. The database stores `visibility=PRIVATE`, and download requires application authorization before a five-minute signed Spaces URL is issued. Do not put chat, receipt, invoice, identity, expense or incident files under the public root.

Public catalog/brand media must be uploaded only through trusted backend code using the separate `storePublicFile` adapter. It uses the public root and may return a CDN URL when enabled.

## Masked calls

`MASKED_CALL_PROVIDER=disabled` is the safe default and returns `503 MASKED_CALL_NOT_CONFIGURED`. A telecom integration must register an adapter exposing `createBridge()`. Phone numbers remain server-side; the API returns only the temporary dial number. The mock adapter is limited to development/test, and production startup rejects it.

## Invitations

Operations Agent and Chauffeur creation endpoints now send branded activation email when SMTP is enabled. `POST /operations/invitations/{userId}/resend` expires all older unused links and creates one new seven-day link. In non-production with email disabled, the response includes a test token; production never returns it.

## Invoices

`GET /bookings/{reservationId}/invoices` is authorization-complete but disabled until the existing website invoice schema is confirmed. Configure the validated table and reservation-column names, then set `INVOICE_ADAPTER=legacy`. The adapter returns normalized metadata only and never exposes an unfiltered legacy row.
