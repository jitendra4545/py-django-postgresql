# Applying the Pay Now / Pay Later backend update

## Work in your existing VS Code project

1. Make a copy of the existing project folder and database backup before changing anything.
2. Extract the **patch-only ZIP** into the root of the backend project (the folder containing `package.json`). Keep your existing `.env`; the patch deliberately contains no actual `.env` file.
3. Run:

   ```powershell
   npm ci
   npm run syntax:check
   npm run payment-options:selftest
   npm start
   ```

4. Sign in to your local backend and create a test draft/quote using your existing test data.
5. Checkout once with `{ "paymentOption":"PAY_LATER" }`. Confirm `201`, booking list, booking details, and payment ID.
6. Call `POST /api/v1/payments/{paymentId}/retry` to get a Stripe sandbox client secret; confirm payment using a test card. The successful signed webhook should mark the **same booking** `CONFIRMED` / `PAID`.
7. Separately test a failed payment, then confirm the booking remains in the list with `canRetryPayment: true`. Test invalid options, duplicate requests, and expired quotes.

## Infomaniak

- Deploy only after SSH access and the managed Node.js startup configuration are verified.
- Stage the update in a new release directory; don't overwrite `backend/.env` or production database credentials.
- Restart the **managed** Node.js service, not a separate background `npm start` process.
- Verify API `/health`, booking creation, list, retry, and Stripe webhook on `https://beta.drive-luxury.com` using sandbox credentials before production go-live.
- If the site says *Stopped* but still responds, first establish which Node.js process serves the domain.

## Cautions

- This patch does not fix your earlier `app_refresh_tokens.id` BIGINT-vs-UUID mismatch. Login must already work against your database, or your client-approved auth schema/code change must be applied separately.
- No SQL migration is part of this patch. Confirm the client's existing `reservations.lifecycle_status` and `app_payment_transactions.status` are VARCHAR fields that accept the new string values. See `PAY_LATER_AND_FAILED_PAYMENT_FLOW.md`.
- Pay Later and failed-payment reservations reserve inventory until explicitly canceled/handled; the business team should set a payment due/cancellation policy.
- Stripe webhook signatures and hosting startup issues are separate prerequisites for reliable payment confirmation.
