# Release verification 10 November 2026

Result: automated checks pass for this release candidate. The actual client local/hosted database and PHP admin runtime were not accessed.

| Check | Result |
| --- | --- |
| JavaScript syntax | 139 files passed |
| Existing routes and OpenAPI snapshot | Unchanged contract gate passed |
| OpenAPI coverage | 97 operations passed including the existing staff workspace |
| Unit suite | 125 tests in 20 files passed |
| Payment policy tests | 12 passed |
| Payment HTTP tests with provider mocks | 11 passed |
| Native MySQL workflow assertions | 67 core/tax plus 25 balance/availability assertions passed |
| Upgrade rerun after workflow data | Passed |
| Final schema verification | Passed |

MySQL setup imported all 165 tables from the supplied client schema and initialized a disposable fixture for the reported three ID tables, 51 columns and 11 indexes. The guarded upgrade then installed the complete cumulative target. The integration script inserts generated local fixtures; it must not be run on a populated client copy.

The native MySQL assertions cover native admin booking reads, inactive legs, refreshed locations, independent pickup/dropoff driver IDs, status progress, partial completion, reassignment/removal, push job deduplication, agent customer creation and booking, native flight data, chat/read receipts and attachments, managed private files, VIP review, reset/login, visible/hidden extras, unchanged option fields, actual hourly extra calculation, VAT and coupon totals, native coupon redemption/cap, commission, preserving admin extras during booking changes, payment balance guards/concurrent settlement, transfer-only pricing discovery, physical capacity, directional city fares, concurrent direct native allocations and cancellation/reopen conflicts.

Pricing regression example exercised the real quote endpoint and native DB rates without Google network calls: two chauffeur hours at 100, extra quantity 2 at 10 per hour, 10 percent discount and 20 percent VAT produce extra total 40, discount 24, base-only VAT 35.20 and rounded payable 251. Internal snapshot metadata does not appear in the public response.

The payment HTTP suite checks Pay Later persistence/listing/retry, failure recovery, normal success, stale fare rejection, and a late successful webhook requiring reconciliation. Providers are mocked; real signature verification and network delivery require Stripe staging acceptance.

No real Google, Stripe, Expo, SMTP, Telnyx, storage, Zoho or Odoo delivery was executed. No load test or populated production migration was executed. The supplied PHP source was reviewed statically; its archive lacks a complete runnable dependency/application setup. See PRODUCTION_RELEASE_GUIDE.md for the remaining production acceptance steps.

Detailed local command output is included in docs/verification. The contract gate verifies original declarations and OpenAPI bytes; representative HTTP tests verify existing field shapes, but it is not an exhaustive proof of every possible response value.
