# Pay Now / Pay Later — Booking & Payment Retry

## User experience and API integration

1. Create a draft (`POST /api/v1/bookings/drafts`), save trip details, request a quote as before.
2. Checkout with `POST /api/v1/bookings/drafts/{draftId}/checkout`, `Authorization: Bearer <token>`, and a *new* `Idempotency-Key`.
3. Choose the checkout JSON body:

```json
{ "paymentOption": "PAY_NOW" }
```

or:

```json
{ "paymentOption": "PAY_LATER" }
```

For backwards compatibility, omitted `paymentOption` means `PAY_NOW`. Invalid choices return HTTP 422.

### Pay Now

- The booking and physical vehicle allocation are committed before the Stripe PaymentIntent is created.
- If Stripe initialization fails, checkout still returns HTTP 201 with `bookingId`, `reservationNo`, `status: PAYMENT_FAILED` and `payment.id`, and `canRetryPayment: true`. The booking remains visible in `GET /bookings` / `GET /bookings/{reservationId}`.
- If the customer abandons a checkout before any failure, `PAYMENT_PENDING` remains a temporary hold and is eligible for the existing quote-expiry sweep. A *genuine failed payment* becomes `PAYMENT_FAILED` and is retained.

### Pay Later

- Checkout returns HTTP 201 with a persisted booking, `status: PAYMENT_DUE`, and `payment: {id, status: DEFERRED}`. No Stripe Intent is created at checkout.
- The vehicle remains reserved, and the booking remains visible to the customer even after quote validity ends.
- To pay, call `POST /api/v1/payments/{paymentId}/retry` for the provided payment ID; use the returned `clientSecret` with Stripe's normal client confirmation flow. **Do not create a second booking or use checkout again.**
- A signed Stripe success webhook updates the existing reservation to `CONFIRMED` and its paid flags. Mock payments may use `/payments/{paymentId}/mock-confirm` in a non-production sandbox.

### Booking list / detail

`GET /api/v1/bookings` and `GET /api/v1/bookings/{reservationId}` add:

```json
{
  "paymentId": 77,
  "paymentState": "DEFERRED",
  "paymentOption": "PAY_LATER",
  "canRetryPayment": true
}
```

Show a **Pay Now / Retry Payment** button when `canRetryPayment` is true; call the existing retry endpoint with `paymentId` to continue. The existing booking detail `payments` list is preserved.

## State matrix

| Checkout choice / event | Booking lifecycle | Payment transaction | Visible in list | Pay button |
| --- | --- | --- | --- | --- |
| PAY_LATER checkout | PAYMENT_DUE | DEFERRED | Yes | Yes |
| PAY_NOW checkout, Stripe pending | PAYMENT_PENDING | CREATED / REQUIRES_ACTION | Yes until hold expiry | Yes while quote valid |
| Initial Stripe setup failure | PAYMENT_FAILED | FAILED | Yes | Yes if safe to retry |
| Stripe payment failure event | PAYMENT_FAILED | FAILED | Yes | Yes if safe to retry |
| Signed Stripe success | CONFIRMED | PAID | Yes | No |
| Abandoned PAY_NOW after quote expiry | CANCELLED | CANCELLED | Yes as canceled | No |

## Safeguards and constraints

- This is **not** a free or paid booking: `reservations.payment_status` remains 0 and the legacy status remains 0 until actual payment success.
- `PAYMENT_DUE` and `PAYMENT_FAILED` keep inventory reserved without automatic expiry. Decide an operations policy (payment deadline, manual cancellation, release inventory) before enabling Pay Later in production; this implementation does not implement a payment-deadline worker.
- Retrying uses the existing payment transaction to avoid accidental duplicate charges. Existing older Stripe attempts without a reference cannot be recreated after 23 hours without reconciliation.
- Signed webhooks are still required for real Stripe settlement. A payment status of `REQUIRES_ACTION` does not mean paid.
- Already-cancelled bookings cannot be automatically revived by late success events.
- A retry with an existing canceled Stripe intent still requires manual reconciliation or a separately designed safe new-attempt flow.
- Don't use the mock payment provider in production.

## Client DBA change register — impact of this feature

**New tables: 0. New columns: 0. Modified column definitions: 0. New indexes: 0. Data migrations: 0.**

Uses previously documented columns/tables:

- `app_booking_drafts`: `status`, `reservation_id`.
- `app_quote_snapshots`: `quote_data`, `valid_until`.
- `reservations`: `lifecycle_status VARCHAR(40)`, existing legacy `status` and `payment_status`, `quote_snapshot_id`.
- `app_payment_transactions`: `status VARCHAR(30)` (**must accept `DEFERRED`**), existing `provider_payload JSON` (**stores `checkoutPaymentOption`**), `provider_reference`, `reservation_id`, `amount`, `currency`.
- `activity_logs` / `app_mobile_status_event_ids` for booking status events, plus existing vehicle reservation tables.

The `PAYMENT_DUE` and `PAYMENT_FAILED` values fit the existing `VARCHAR(40)` field; `DEFERRED` fits `VARCHAR(30)`. If the client's live schema uses stricter enum/constraint values or lacks existing mobile columns, DBA review/approval is needed **before** deployment; do not apply production DDL automatically.

DBA verification (read only):

```sql
SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE, DATA_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA=DATABASE() AND (
  (TABLE_NAME='reservations' AND COLUMN_NAME IN ('lifecycle_status','status','payment_status','quote_snapshot_id'))
  OR (TABLE_NAME='app_payment_transactions' AND COLUMN_NAME IN ('status','provider_payload','provider_reference','reservation_id'))
) ORDER BY TABLE_NAME,COLUMN_NAME;
```

## Test commands

```bash
npm run syntax:check
npm run payment-options:selftest
```

The self-tests run without making actual bookings/charges. Live acceptance tests against a migrated test database and Stripe sandbox are still required.
