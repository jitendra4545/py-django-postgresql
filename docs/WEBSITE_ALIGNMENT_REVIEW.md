# Drive Luxury Website Alignment Review

10 November 2026 | Base fee tax correction and website coverage review

The mobile backend can reuse the client website tables and preserve the existing mobile endpoints and response fields. This update fixes native balance collection, country coverage, fee-only service handling, and changes that should preserve agreed prices. It is a locally verified release candidate; complete live website parity has not been established.


## What changed in this update

- Later customer charges use active native reservation costs minus approved reservation payments. A completed ride stays completed while its remaining bill can be paid.

- An unpaid or partially paid booking pays its entire remaining balance after an approved price increase. It does not pay only the increase.

- Untouched deferred payment amounts follow native fare edits. Initialized provider attempts retain their identity and are blocked when the native balance changes.

- Country discovery accepts the same native country-code coverage as vehicle search. Duplicate class-country links do not duplicate class cards.

- Native fee-only services stay in the bill and are excluded from itinerary legs and dispatch. Notes-only and passenger-name edits preserve agreed native costs.

| Verification | Result |
| --- | --- |
| Backend unit tests | 125 passed across 20 test files |
| Payment policy and mocked HTTP tests | 23 passed |
| Core MySQL workflow and tax checks | 67 passed |
| MySQL balance and availability checks | 25 passed |
| Browser workflow against Node and MySQL | 45 API calls and 45 trace records; no JavaScript errors |
| Frontend unit checks | 29 passed; JavaScript syntax passed |
| Original API contracts | Original 96 mobile routes and OpenAPI bytes retained |

The staff workspace endpoint introduced in the preceding web package remains available. This update adds no API endpoint. Pricing checks also passed for all three priced services. External card settlement, PayEngine, Google routing, email, Expo delivery and the live Laravel admin were not exercised by these local tests.


## Confirmed tax treatment

The selected rule is tax on the base service fee only. Selected extras, collection or dropoff fees, excess kilometre charges and rental insurance remain in the payable total without adding tax. This is the client business instruction, not a statement about tax law.

| Component | Tax treatment |
| --- | --- |
| Base service fee | Taxable after the allocated discount, with a zero minimum |
| Selected extras such as child seats | Untaxed |
| Collection dropoff excess distance and insurance | Untaxed |
| Internal chauffeur or operating expenditure | Does not automatically become a customer charge |

For example, base 100 plus extras 20 at a 10 percent rate produces base tax 10 and payable 130. In the verified chauffeur flow, two hours at EUR 100 plus EUR 40 of extras gives EUR 240 before discount. The existing 10 percent coupon removes EUR 24. The taxable base becomes EUR 176; 20 percent tax is EUR 35.20; whole-total rounding gives EUR 251. Extra quantities and billing units have not changed.

The new quote, coupon recalculation, checkout and approved price-change paths use this formula. Existing response fields remain. taxableOptions is zero and nonTaxableOptions contains selected extras; catalog option taxable flags are returned as zero. The client option master flags are not overwritten. Existing native base_tax and total_tax columns store the tax.

Private quote_data JSON records the policy version BASE_FEE_ONLY_V1. Checkout rejects an older quote with QUOTE_STALE and asks for the existing quote endpoint to be called again. No new column or endpoint is needed. Existing posted charges, settled payments, agreed native prices and initialized payment attempts are not automatically repriced.

The supplied PHP archive contains mixed behavior. Initial base-cost storage uses base tax, while later option, coupon and admin repricing methods include extra components. The mobile correction cannot change the PHP calculation. The client website team must align the paths listed in backend/docs/CLIENT_WEBSITE_TAX_ALIGNMENT.md so a later native admin edit does not restore tax on extras. The rule here supersedes the earlier tax-on-extras examples in previous handovers; the cumulative SQL change list is unchanged.


## Why vehicle counts can differ

The public website and the staff admin do not run the same search. Public selectCar chooses one local vehicle or one country fallback vehicle for each class. The Vue admin can return individual vehicles; agent results are grouped by class. Seven staff vehicles can therefore represent four public classes. If both screens are public class cards, this explanation alone is insufficient.

| Rule | Supplied website code | Mobile backend |
| --- | --- | --- |
| Country coverage | VehicleCity.country matches the country code | Country through an active city or native country code; discovery mismatch fixed |
| Vehicle state | Available status 1 and online status 1 | Same requirements retained |
| Class visibility | Public query returns the website flag without filtering it; missing templates may apply it | Requires can_reservation_from_website = 1 |
| Seats | No explicit passenger capacity filter in public selectCar | Requires a numeric seating capacity sufficient for passengers |
| Fleet entry date | Public selectCar does not explicitly filter it; admin excludes future fleet dates relative to today | Checks the requested pickup date |
| Occupied dates | Public search excludes native reserved days | Also checks manual vehicle blocks and active native allocations |
| Configured prices | Public code includes a fallback rate and only appends a class when computed total is greater than 50 | Requires a configured rate; list price is indicative and final quote is authoritative |
| Search inputs | Country, service, dates, duration, route and public or admin context affect results | Compare the identical service, country, times, passenger count and database |

Keep valid capacity, fleet and conflict checks. Do not mark unavailable vehicles available or remove pricing checks simply to increase the count. A disabled class may require an enquiry flow; the existing mobile class response has no dedicated request-only flag.

The exact missing classes in the reported six or seven versus two to five result have not been identified against live rows. The new read-only diagnostic runs the actual mobile catalog handler and reports native vehicle IDs, class IDs, exclusion checks and candidate counts. Its website candidate count is before website price and template rules; it is not a simulated rendered website result.


## How later customer payments now work

The payable amount is max zero of active native reservation costs minus approved, undeleted reservation payments for the reservation. Payments associated with a separate custom invoice are excluded. The result is rounded to two decimal places before comparison with a provider transaction.

| Booking charge | Already paid | Customer now pays |
| --- | --- | --- |
| 300 plus later charge 30 | 300 | 30 |
| 300 plus later charge 30 | 0 | 330 |
| 300 plus later charge 30 | 100 | 230 |

Booking detail and booking list requests refresh the payment action from the native ledger. This can create or adjust one DEFERRED app_payment_transactions row without contacting a gateway. The existing paymentId, paymentState, paymentOption, canRetryPayment and payments fields are retained. The existing retry endpoint initializes that same transaction. The UNPAID filter includes a completed booking with a later balance.

A payment that has begun provider setup is frozen. A changed amount, currency, ambiguous settlement, refund history or missing native receipt ledger requires operations review. The app does not silently replace such an attempt or request another charge. The provider reference is retained if a native edit occurs during setup.

| Record | Business meaning | Customer bill effect |
| --- | --- | --- |
| reservation_other_costs and detail other_cost | Internal operating expenditure | None automatically |
| app_driver_expenses | Chauffeur expense claim and review | None automatically |
| rental_options and reservation_optional_costs | Configured and selected customer extras | Included through native reservation_costs |
| Extra reservation_details with is_extra_service = 1 | Native admin billable additional service | Included through its active reservation_costs |
| Standalone custom or reservation invoice | Document and invoice workflow | Not automatically added again to reservation costs |

The supplied test frontend labels available balance payments and shows total, received money, balance and review reasons to staff. Native cash and bank payments reduce the balance; they are not copied into the customer app gateway transaction history. A complete combined customer statement would need an explicit representation policy. No automatic push is sent when native staff adds a bill; the customer sees the refreshed booking payment action.


## Database storage and change requirements

This update requires zero additional SQL tables, columns, indexes, triggers or mandatory seed rows beyond the previous complete cumulative 10 November backend schema. The client reported earlier changes are not proof that the full cumulative schema is present. The included schema validator remains the source of exact outstanding database work.

| Existing table or field | Use in this update |
| --- | --- |
| reservations | Booking ownership, currency, native state and existing mobile lifecycle |
| reservation_details.is_extra_service | Separates billable fee-only services from transport legs |
| reservation_costs.total_amount | Current active customer charges across all active legs and fee rows |
| reservation_payments.payment_amount | Approved reservation collections; custom_invoices identifies separately owned payments |
| app_payment_transactions | Existing app gateway attempts; one deferred outstanding balance where safe |
| vehicle_cities.country and city_id | Native country-code coverage or linked active city coverage |
| vehicle_classes and vehicle_class_countries | Native class visibility, service type and country eligibility |
| rental_options and rental_option_classes | Service and class linked customer choices such as child seats |
| reservation_optional_costs | Selected extra quantity, agreed unit amount and computed total |

Existing app_payment_transactions.provider_payload remains JSON. The implementation stores purpose as the string NATIVE_BALANCE_DUE, nativeTotal and nativePaid as numbers, providerAttemptStartedAt as an ISO date string, and reconciliationRequired as a Boolean when applicable. These are JSON members, not new SQL columns. Existing checkoutPaymentOption is preserved when provider payloads refresh.

Use the included cumulative DBA document for the earlier schema additions. This review does not replace that document with a smaller list, and it does not claim that any hosted database was modified. A missing table, column, index, view or trigger must still be reviewed against that cumulative document.

For a local imported database, run the existing plan, review its output, apply the local upgrade if needed, and verify. No separate DDL patch is required for the changes in this review.

    cd backend
    npm ci
    npm run db:client:plan
    npm run db:client:upgrade
    npm run db:client:verify

## Website work still required before parity signoff

The mobile changes are implemented. The following issues remain material to a claim that the entire website and app behave identically in production.

- Website online payment amount: FrontEnd/PaymentController checkout sums the full reservation costs. It does not deduct earlier payments in that method. The website must request the outstanding amount for later collections, or it can ask an already paid customer for the full price again.

- Website manual payment calculation: ReservationPaymentController uses singular reservationCost when computing total_due. Multiple active legs and extra service costs must be summed consistently. The supplied mobile update does not edit or deploy the PHP application.

- Concurrent website and app payments: PayEngine and Stripe must share an operations rule for pending charges and settled receipts. The Node safeguards cannot stop the PHP website from issuing its own independent charge. Do not offer two simultaneous payment channels for the same balance without a shared reconciliation process.

- Historical paid flags and refunds: A paid flag without native payment rows is blocked from automatic rebilling. Refunds and mixed-currency history require ledger reconciliation. Native invoice-only charges must be classified before being attached to the reservation balance; do not count the same charge twice.

- Vehicle search policy: Confirm whether website cards with can_reservation_from_website disabled are displayed for enquiries. Confirm actual capacity values and which screen produced the larger count. The supplied archive lacks public templates, so that display policy remains unverified.

- Catalog search versus final quotation: The existing class discovery request does not carry every website quote input, including complete route and chosen extras. Its startingPrice remains indicative. Exact card-price parity needs the same input and pricing context; backend changes cannot reconstruct information the app never sends.

- Live integration: Test one customer booking, one agent booking, native admin allocation and reassignment, each chauffeur role, an additional service after completion, a bank payment, refund reconciliation, signed provider callbacks and notification delivery using the actual deployment database.

The PHP archive lacks composer.json, composer.lock, artisan and public views. The native admin was therefore reviewed by source, while the updated Node API was exercised against MySQL 8 imported from the 165-table schema with disposable fixture records. The real customer database, original PHP UI and live payment gateways were not used for this verification.


## Local comparison and evidence

Open the updated full workspace, configure backend/.env for your local imported client database, run npm run setup from the workspace root, then npm start. Keep PAYMENT_PROVIDER=mock for the included local payment flow. Use the full included migration only when the local schema validator shows that prior cumulative changes are missing.

Run this command inside backend with the exact search shown on the website. Substitute your real country ID, service, timestamps and passenger count. Use UTC ISO timestamps matching the app request; a local-time mismatch can change availability.

```bash
npm run availability:diagnose -- --country-id 15 --service-code CHAUFFEUR --start-at 2026-12-01T10:00:00Z --end-at 2026-12-01T12:00:00Z --passenger-count 2
```
Share the returned JSON with the matching website result and the actual mobile request. Inspect mobileClassCount, eligiblePhysicalVehicleCount, the website candidate count before price and view rules, and each vehicle excludedBy list. A country-code coverage row can now be accepted even if its city link is absent or no longer active.

Source evidence in the supplied client archive

- app/Http/Controllers/FrontEnd/ReservationController.php, selectCar: public class selection, local and country fallback vehicles, rates and the total greater than 50 condition.

- app/Http/Controllers/VueController/ReservationApiController.php, getAvailableVehicle: staff vehicle results and agent class grouping.

- app/Http/Controllers/FrontEnd/PaymentController.php, checkout: full reservation cost sum for the gateway amount.

- app/Http/Controllers/ReservationPaymentController.php, storePayment: manual payment ledger and singular cost reference.

- app/Http/Controllers/Reservation/ReservationInfoController.php: native optional costs, extra services and operating costs. app/Services/ReservationProfitService.php: operating cost versus customer revenue.

- src/services/native-balance-payment.js and native-balance-intent.js in the updated Node backend: balance refresh, frozen provider attempts and outstanding payment setup.

- scripts/test-native-balance-integration.mjs: actual MySQL scenarios for later charges, existing paid amounts, approved changes, fees, manual payments and coverage diagnostics.

No promise of zero future defects or complete live parity is made. The release supports local acceptance testing with unchanged mobile contracts. Signoff requires resolving the PHP payment issues and comparing identical searches and financial flows across the actual website and app.


## Website features covered by the mobile backend

This comparison covers the supplied website routes, controller implementations and the current mobile API inventory. A feature marked implemented is present in code and the applicable local tests; it is not a claim that every website variant was exercised. Native administration remains the owner of its existing workflows.

| Feature | Mobile coverage | Boundary or remaining work |
| --- | --- | --- |
| Chauffeur transfer and rental bookings | Implemented | None identified in the core transaction path; live website acceptance remains required. |
| Vehicle search and availability | Implemented with parity differences | Exact live card counts and request-only class visibility remain unverified; mobile retains capacity and conflict checks. |
| Season country duration and transfer prices | Implemented | Discovery price is indicative; full route and extras are evaluated by the final quote. |
| Child seats and selectable service extras | Implemented | No extra table needed. Existing service, class, quantity and native billing-unit rules are retained. |
| Base fee tax only | Corrected in this update | PHP option, coupon and admin repricing paths still include extras and must adopt the confirmed policy. |
| Discount coupons | Implemented | Discount now reduces the taxable base fee without taxing extras; native PHP coupon arithmetic must match. |
| Rental insurance selection | Implemented | HALF, FULL and NONE selections are priced; this is separate from signed rental agreements. |
| Agent customer bookings | Implemented | Mobile customer assignments use the previously approved app relation. Full CRM administration remains native. |
| Agency commissions and settlement | Partial | Commission calculation and listing exist; agency payout administration is not recreated in mobile APIs. |
| Chauffeur assignment and ride progress | Implemented | Native pickup and dropoff roles are synchronized; actual hosted changes and notification delivery need acceptance testing. |
| Later balance and partial fare payments | Implemented with reconciliation limits | Website PayEngine full-fare checkout, multi-leg manual payment arithmetic and simultaneous payment channels need correction. |
| Billable additional services | Reads and collects native charges | Create fee-only additional-service rows through native admin. There is no mobile staff create-charge API. |
| Chauffeur operating expenses | Implemented separately from fares | Mobile claims remain in existing app_driver_expenses. Approving a claim does not bill the customer. |


## Website workflows that remain native or deferred

| Feature | Mobile coverage | Boundary or remaining work |
| --- | --- | --- |
| Invoices and printable documents | Partial | Native invoice listing adapter exists; full issuing, custom invoice payment, PDF printing and email workflows remain native. |
| Security deposits | Native admin only | No mobile deposit authorization, collection, release or damage deduction workflow. Deposits are not automatically fare payments. |
| Credit notes and refund vouchers | Partial finance coverage | Provider refund handling does not recreate the native credit note and voucher accounting workflows. |
| Rental agreements and signatures | Deferred from mobile scope | Native contract generation, signature capture and agreement PDF flows are absent from current mobile APIs. |
| Pickup and return inspections | Deferred from mobile scope | Native fuel, mileage, additional-driver and condition inspection workflows are not implemented in mobile. |
| Vehicle damage reports and photos | Partial incident link only | A mobile incident can link an existing native damage record; full damage creation, photo annotation and reporting remain native. |
| Leave and shift management | Native admin only | Mobile dispatch checks assignment overlap. It does not enforce native leave or shift calendars. |
| Providers and subcontractor administration | Native admin only | Provider records and cost administration are not managed through mobile APIs. |
| Booking chat and notifications | Implemented with native administration retained | Timed native pickup reminders, operational email logs and templates are not recreated by the mobile push workflow. |
| Roles permissions and two factor authentication | Shared users with separate authorization | Mobile uses role-based authorization. Native granular permissions and two-factor challenges are not automatically inherited; admin SSO is absent. |
| Zoho Odoo accounting and reports | Native admin and workers retained | Financial changes mark existing Zoho data dirty; end-to-end accounting workers and native exports are not implemented or validated by Node. |
| VIP concierge and other services | Manual inquiry coverage | These services are inquiries for operations. Native type 4 custom pricing is not a mobile instant-quote flow. |

Rental agreements, inspection and damage capture were previously deferred from mobile scope. Invoice issuing, deposits, vouchers, providers, accounting and reports can continue through the client website. They do not all need a new mobile endpoint or a duplicate database table.


## Keeping the current database contract stable

This tax correction adds zero SQL tables, columns, indexes, views or triggers. It reuses tax_surecharges, reservation_taxes, reservation_costs and the existing quote JSON column. The native tables and the previously documented mobile extensions remain the current database contract. Native master records are retained.

The existing schema already contains reservation_deposits, reservation_agreements, agreement_signatures, inspection and damage tables, native invoices, credit_notes, refund_vouchers, leaves and shifts. If any deferred workflow is later approved for mobile, map its required fields and constraints to these tables first. Their existence does not by itself prove every future mobile requirement fits them without an addition.

A permanent promise of no future database change would be inaccurate. The current tax change and supported features do not require another schema addition beyond the cumulative plan. Future feature scope, changes made by the client website team, or missing live schema objects still require review. Avoid creating parallel mobile reservation, cost, assignment or invoice masters.

Before production acceptance, verify shared tax calculations after a native option edit and coupon edit; a paid and an unpaid later charge; native payment records and both payment channels; one identical vehicle search; driver dispatch against the intended leave and shift policy; and staff access against the intended native permissions and authentication policy. The client must decide which native admin-only features are actually required in the mobile apps.

The included WEBSITE_FEATURE_COVERAGE.csv lists all 25 reviewed feature groups and their existing native tables. CLIENT_WEBSITE_TAX_ALIGNMENT.md names the PHP methods requiring the same calculation. Neither document implies a PHP deployment or a hosted database migration was executed.
