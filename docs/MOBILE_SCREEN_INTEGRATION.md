# Mobile screen integration — backend 2.6.2

The combined release includes the Node backend and changed Laravel integration source. See LEGACY_ADAPTER_REPORT.md for the shared policy and current limitations. No React Native client or chauffeur app source was attached, so buttons, screens and their actual device behavior have not been edited or device-tested. The following calls supply the requested content without changing existing responses or the supplied database schema. Every path is relative to `/api/v1`.

## Where the website tables are used

| Native table | Website code | Use in the mobile app |
| --- | --- | --- |
| `vehicle_classes` | `VehicleClass`; service-specific classes and half/full coverage fields | Vehicle selection, class title/image, insurance choices |
| `rental_options` | `RentalOptionController`, `FrontEnd/ReservationController::rentalOptions()` and `saveRentalOption()` | Extras screen: child seats, full tank, extra driver, provider extras; labels/prices come from data |
| `rental_option_classes` | `RentalOptionController::storeRentalOptionClass()` expands selected classes or service groups into class links | Show only extras linked to the selected class, even when historical option service tags differ |
| `rental_durations` | Website closest duration selection | Hourly chauffeur and daily rental rate calculation |
| `vehicle_class_price_rates` | Class + country + season + duration rates | Backend quote; frontend displays results rather than duplicating pricing |
| `reservation_optional_costs` | Saved option label, quantity, basis, amount and total snapshots | Reserved booking payment details and later admin changes |
| `reservation_costs` | Authoritative stored billable components | Booking cost information, tax, total and remaining payment |

`rental_option_classes` is a pivot, not another vehicle catalog. Insurance choices are not child-seat rows in that pivot: the website reads `half_insurance_*` and `full_insurance_*` from the selected vehicle class.

## Extras and insurance screen

After selecting the vehicle class, call:

`GET /catalog/vehicle-classes/CLASS_ID/booking-options?serviceCode=CAR_RENTAL`

Use `CHAUFFEUR` or `TRANSFER` for the other services. The new response contains `options`, `insuranceChoices`, and `defaultInsuranceType`. Each extra keeps the existing option keys and supplies `billingUnit` (`HOUR`, `DAY`, or `BOOKING`) on this new endpoint. Keep `option.id` as the selected ID; submit the existing booking draft payload:

```json
{
  "options": [{"optionId": 12, "quantity": 1}],
  "insuranceType": "HALF"
}
```

Merge these fields into the full existing details request; that endpoint still requires its normal passenger/vehicle/leg fields. Full coverage uses `insuranceType: "FULL"`; it is not an arbitrary rental option ID. Chauffeur and transfer return an empty insurance list. A configured free half-coverage description remains the rental default, matching the prior implementation.

Keep calculations on the server. In the supplied PHP, `based_on=1` multiplies by the native service duration: chauffeur hours, rental days, or one transfer unit. The website labels some chauffeur extras “/Day” despite charging the stored hour units. This release preserves that existing calculation and exposes an accurate `billingUnit` rather than silently changing the fare. Although `rate_type=2` is named “Percentage” in the legacy model, the public PHP option-save code bills its configured amount; the backend quote remains authoritative.

## Review and payment screen

Continue creating the existing draft quote first:

`POST /bookings/drafts/DRAFT_ID/quote`

Then fetch the additional display data:

`GET /bookings/drafts/DRAFT_ID/payment-breakdown`

For a checked-out booking, receipt, or later admin expense:

`GET /bookings/RESERVATION_ID/payment-breakdown`

Both return `sections`, `summary`, and `payment`. Existing quote, booking, receipt, retry, and webhook response schemas remain unchanged.

| Display area | Fields from the new breakdown |
| --- | --- |
| Hourly / daily / transfer rate | `sections[].rate.label`, `unitAmount`, `quantityLabel`, `calculation` |
| Booking service price | `sections[].totals.baseFee` |
| Selected extras and quantities | `sections[].options[]` |
| Collection or one-way fee | Row with `key: "oneWayCharge"`; label distinguishes collection |
| Additional distance, insurance, discount | Corresponding section rows |
| VAT | `sections[].tax.ratePercent`, `amount`, `basis` and optional note |
| Rounding | Row with `key: "roundingAdjustment"` |
| Manual price adjustment | Row with `key: "priceAdjustment"` when nonzero |
| Section total | `sections[].totals.total` |
| Entire booking total | `summary.total` |
| Money already received | `summary.paid` |
| Amount still payable | `summary.amountDue` |
| Existing payment retry | `payment.paymentId` and `payment.canPay` |

Render the rate as an information row, then charge rows and the total. Do not add the hourly/daily unit rate to the charge rows. Option details explain the aggregate extras row; do not add them twice. Re-fetch after an admin change, successful payment, or returning to the screen.

For a draft, use the existing checkout action and quote validity. For an existing booking with `payment.canPay=true`, call the existing `POST /payments/PAYMENT_ID/retry`, then use the returned intent with the current Stripe flow. Do not use the total original fare as a later top-up amount. The provider initialization rechecks the actual current native balance.

The screenshot chauffeur example is represented as CHF 120 × 8 = 960, VAT 77.75, rounding +0.25 and total CHF 1,038. For the rental screenshot's base 470 and collection 1,503, the agreed base-only tax is 38.05 and total 2,011. The website screenshot's 2,133 uses tax on collection as well; that conflicts with the earlier explicit base-only requirement and has not been copied. The separate 1,501 versus 1,503 collection values must be compared using the same selected vehicle, route distances and quote inputs; the adapter does not invent a fee correction from a screenshot.

For existing admin bookings, stored amounts remain authoritative. If recorded VAT does not match base-only VAT, `tax.basis` is `RECORDED` and `tax.taxableBase` is null. The UI should display the recorded amount, not recalculate it. A large recorded price discrepancy is called a price adjustment, not disguised as rounding.

The provided screenshots cover chauffeur and rental. Transfer uses the same breakdown response with a `TRIP` rate, actual transfer fare, selected extras, VAT, rounding and total. It does not invent an hourly or daily rate for distance-tier pricing.

## Delete Account — all three app roles

Place the action in Profile / Account settings. Require explicit confirmation and reauthentication, then call:

```http
DELETE /auth/account
Authorization: Bearer ACCESS_TOKEN
Content-Type: application/json
```

```json
{"confirm": true, "password": "CURRENT_PASSWORD"}
```

For an existing Google-linked account, provide a fresh Google `idToken` instead of `password`. The backend verifies that the Google subject is linked to the signed-in user. Do not send both credentials. The target is derived from the authenticated account; a self-service request cannot supply another user's ID.

Successful response:

```json
{"userId": 123, "profileId": 456, "role": "CLIENT", "deleted": true}
```

The roles are `CLIENT`, `CHAUFFEUR`, and `AGENCY_AGENT`. Clear local access/refresh tokens, local personal caches and sockets, then navigate to Login. A 409 explains an active booking, active chauffeur assignment, or in-flight payment that must be resolved first. An agent's customer bookings and shared agency remain intact.

Deletion follows the website's native soft-delete approach. It marks `users` and the matching customer/driver/agent profile deleted, revokes refresh sessions and pending invitations, disables push tokens and queued delivery, removes chat membership, and deletes customer saved-card records. Native booking, payment, commission and audit history remains. This endpoint is account deactivation/soft deletion; it is not a claim that every historical document or personal datum has been physically erased.

Administrator management endpoints (ADMIN role only):

- `DELETE /operations/clients/CUSTOMER_PROFILE_ID`
- `DELETE /operations/chauffeurs/DRIVER_PROFILE_ID`
- `DELETE /operations/agents/AGENT_PROFILE_ID`

Each accepts `{"confirm":true,"reason":"Optional reason"}`. IDs are profile IDs from `customers`, `drivers` or `agents`, not `users.id`. Staff and agency agents cannot delete another account through these endpoints. Deleting one agent never deletes the shared `agencies` row.

## Booking chat

Use the existing REST endpoints:

1. Open Message Chauffeur / Message Customer: `POST /communication/bookings/RESERVATION_ID/conversation` with `{}`. Reuse returned `id`; concurrent opens return the same conversation.
2. Load inbox: `GET /communication/conversations?page=1&perPage=20`.
3. Load history: `GET /communication/conversations/CONVERSATION_ID/messages?page=1&perPage=20`.
4. Send: `POST /communication/conversations/CONVERSATION_ID/messages` with either `{"messageType":"TEXT","body":"Hello"}` or compatible `{"text":"Hello"}`.
5. Mark read: `POST /communication/conversations/CONVERSATION_ID/read` with `{"lastMessageId":123}`.

Responses still use `body`, `messageType`, and `documentId`; map `body` to the UI's text property. Do not expect a new `text` response key. Use native customer, chauffeur and assigned agent accounts, not separate fake chat identities. Website guest bookings without a linked app account have no authenticated customer app recipient; the backend does not fabricate an account for them.

Socket.IO connects to the API origin (not `/api/v1/communication`) at the normal `/socket.io` path. Send `auth: {token: ACCESS_TOKEN}` or `auth: {accessToken: ACCESS_TOKEN}`. After `session.ready`, emit `conversation.join` with the numeric ID or `{conversationId: ID}` and inspect the `{ok:true}` acknowledgement. Listen for existing `message.created` and `conversation.read` events. Send messages through REST; no unsupported socket send event is required. On leaving the screen, emit `conversation.leave`; on reconnect, rejoin and fetch REST history to cover missed messages.

Deduplicate optimistic messages, REST results and socket events by message ID. A receive event does not itself mean the conversation was read; call the read endpoint when the user views it. Identical-second read receipts use the message ID boundary, preventing later messages from being marked read prematurely.

The backend now reconciles current customer/driver/agent membership on inbox access, message access and socket joins. New assignments see existing chats, returning chauffeurs are restored from `left_at`, revoked assignments lose read/send/room access, and broadcasts recheck the native audience before delivery. Existing native/admin message recipients are backfilled without overwriting read receipts.

Single-instance live Socket.IO delivery was exercised in integration tests. A multiple-instance deployment still needs a shared Socket.IO adapter/routing setup; the default deployment example has one instance. REST persistence/history remains the recovery path. Actual mobile screen wiring and device/network acceptance still require the app source and runtime environment.
