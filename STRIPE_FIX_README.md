# Drive Luxury backend v2.3.1 - Stripe connectivity and payment recovery

This is the **complete backend source code** from the provided `drive-luxury-backend-v2.3.1-reservation-pricing(1).zip`, with a targeted Stripe integration update. It does not include your database, local `.env`, or installed `node_modules`.

## What these changes solve

- Stripe's default ~80-second connection timeout is replaced with a configurable timeout (default 12 seconds) and at most one automatic network retry. You get an informative `503 STRIPE_UNREACHABLE` response on retried payment setup instead of a generic HTTP 500.
- Adds optional `STRIPE_PROXY_URL` support for an **authorized**, working HTTP(S) proxy. Stripe's HTTPS destination and TLS verification remain unchanged; no mock responses are substituted for real payments.
- Reuses the same `drive-luxury-payment-<paymentId>` idempotency key if checkout initially timed out before saving the Stripe reference. Automatic retries are blocked after 23 hours without a reference: investigate the matching Stripe PaymentIntent first.
- When an existing PaymentIntent reference exists, the retry endpoint **retrieves** that intent instead of creating another; paid/processing/canceled intents cannot be charged again.
- Retry requires an active reservation hold and an unexpired quote.
- Expired hold cleanup no longer overlaps itself within one process; it waits during temporary Stripe outages instead of repeatedly blocking backend calls. It never frees a hold while Stripe's status is uncertain.
- Fixes the previous `JSON.parse("[object Object]")` idempotency replay crash and adds `Cache-Control: no-store` on payment GET.
- Includes `npm run stripe:check`: a diagnostic HTTPS request that does **not use or expose your Stripe API key**.

## Critical: your Windows machine currently cannot access Stripe

You already showed:

```
Test-NetConnection api.stripe.com -Port 443 => TcpTestSucceeded: False
curl.exe -4 ... https://api.stripe.com/v1/balance => timed out
```

**No code update can make real Stripe charges work over a blocked network.** Use a different network such as an approved mobile hotspot, ask your network administrator to allow outbound HTTPS to `api.stripe.com:443`, or configure an approved HTTPS CONNECT proxy using `STRIPE_PROXY_URL`.

Do not bypass your network's security policies or disable HTTPS certificate validation.

## Install on Windows (preserve existing DB and secrets)

1. Back up your existing `drive-luxury-backend-js` directory, especially `.env`, uploaded files and other local changes. **Do not replace your `.env`** with the example template.
2. Extract this ZIP. If your local backend has newer code than the uploaded v2.3.1, compare changes before replacing the whole directory. For a manual patch, copy only the file changes in the accompanying patch ZIP.
3. Open PowerShell in `drive-luxury-backend-js`.
4. If dependencies already exist, run `npm install` to ensure `https-proxy-agent` is installed. Otherwise run `npm ci` when npm registry access is available. `https-proxy-agent@7.0.6` already existed in the original package lock as a transitive dependency; this update declares it as a direct dependency.
5. Keep your existing MySQL connection settings and JWT secrets. In your local `.env`, use test-mode Stripe keys:

```dotenv
PAYMENT_PROVIDER=stripe
STRIPE_SECRET_KEY=sk_test_YOUR_REAL_TEST_SECRET
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_REAL_TEST_PUBLISHABLE
STRIPE_WEBHOOK_SECRET=whsec_FROM_CURRENT_STRIPE_CLI_LISTENER
STRIPE_TIMEOUT_MS=12000
STRIPE_MAX_NETWORK_RETRIES=1
STRIPE_PROXY_URL=
```

If **and only if** your workplace has an authorized functioning HTTPS CONNECT proxy, use a URL like `STRIPE_PROXY_URL=http://your-proxy-host:8080` instead of leaving it blank. Avoid putting credentials into logs.

6. Restart the backend after editing `.env`:

```powershell
npm run stripe:check
npm run dev
```

The diagnostic should report HTTP **401** from Stripe (expected because it deliberately sends no API key). Any HTTP reply from Stripe proves that HTTPS reached the endpoint. If it times out, fix network routing/proxy before attempting checkout.

## Test signed Stripe webhooks

While the backend is running and the computer can reach Stripe, start another PowerShell terminal:

```powershell
stripe listen --events payment_intent.succeeded,payment_intent.payment_failed,payment_intent.processing,payment_intent.canceled --forward-to http://localhost:3000/api/v1/payments/webhook
```

Copy the new `whsec_...` from **this running listener** into `.env`, then restart your backend. It is not your `sk_test` and is not interchangeable with webhook secrets created in the Stripe Dashboard.

With your React frontend and the backend running, make one **new test booking with an active quote**, then use Stripe's test card `4242 4242 4242 4242`, a future expiry and any CVC. Only display `CONFIRMED` after the **signed** webhook has updated the booking. Use `4000 0000 0000 9995` to test a decline, and `4000 0025 0000 3155` to test 3D Secure.

Important: `stripe trigger payment_intent.succeeded` creates **another** test PaymentIntent. The backend correctly ignores webhook events whose Stripe intent ID does not match an existing `app_payment_transactions.provider_reference`. Thus `stripe trigger` alone will not confirm reservation DL15521 or Payment #59.

## Check Payments #57, #58 and #59 before retrying

Use MySQL, not a new checkout key to recover ambiguous payments:

```sql
SELECT p.id, p.reservation_id, p.status AS payment_status,
       p.provider_reference, p.created_at,
       arm.lifecycle_status, q.valid_until
  FROM app_payment_transactions p
  JOIN app_reservation_meta arm ON arm.reservation_id=p.reservation_id
  LEFT JOIN app_quote_snapshots q ON q.id=arm.quote_snapshot_id
 WHERE p.id IN (57, 58, 59);
```

If a PaymentIntent reference starts with `pi_`, inspect it in the Stripe Dashboard. If Stripe says `succeeded`, **never retry the charge**; check signed webhook delivery and reservation reconciliation. Expired/canceled holds require manual review, not a forced payment rerun.

The retry endpoint `POST /api/v1/payments/:paymentId/retry` requires a valid access token. If Stripe was unreachable during checkout and the payment is `FAILED` with **no reference**, this endpoint safely attempts recovery with the **same payment ID/idempotency key**, provided its quote is still valid and it is less than 23 hours old. If Stripe says succeeded/processing, the retry endpoint responds 409 and never presents a card form.

## Files changed

- `src/config/env.js` - Stripe credentials and optional proxy / timeouts validation
- `src/services/payment-provider.js` - Stripe client configuration and retrieve-existing-intent support
- `src/services/stripe-network.js` - classify network errors vs Stripe configuration/card errors
- `src/services/payment-holds.js` - temporary backoff and non-overlapping cleanup
- `src/modules/payments.js` - safe retry/recovery and no-store payment polling
- `src/modules/bookings.js` - informative checkout failure handling
- `src/common/idempotency.js` - fix JSON response replay
- `.env.example`, `package.json`, `package-lock.json`
- `scripts/check-stripe-connection.js`, `scripts/test-stripe-network.js`

## Validation limits

Passed in the container: `npm run syntax:check` (68 JS source files and 88 OpenAPI operations), `npm run test:stripe-network`, and ZIP integrity validation. A full `npm ci`/Vitest suite and live test Stripe payment **could not be completed** because package registry access was unavailable and no configured MySQL / Stripe account was available. Deploy only after local end-to-end verification.
