# Confirmed base fee tax policy

The client selected **base fee tax only** on 10 November 2026. This is the intended business calculation, not a statement about tax law.

For each ordinary service leg:

```text
taxable_base = max(0, base_rate - discount)
VAT = existing_currency_rounding(taxable_base * active_tax_percent / 100)
payable = existing_whole_total_rounding(max(0, base_rate + optional_cost
          + one_way_drop_off_charge + car_with_driver_extra_cost
          + insurance_cost - discount) + VAT)
```

Selected extras, collection/dropoff charges, excess-kilometre charges and insurance are added without VAT. Coupon allocation and quantity/billing units retain their existing rules. A discount exceeding the base fee leaves a zero taxable base; it does not produce negative VAT. Fee-only additional-service records created by native admin must follow the agreed extra-charge treatment there. Existing native posted charges and receipts are not rewritten by this patch.

The Node quote builder, discount recalculation, checkout persistence and financial change approvals now use this rule. `/catalog/options` retains its response fields and reports `taxable: 0`. Native `rental_options.taxable` master rows are not modified. Private quote JSON includes `__native.taxPolicy = BASE_FEE_ONLY_V1`; quotes without this marker are rejected at checkout with the existing error response structure and must be refreshed using the existing quote endpoint.

## Required PHP review

The supplied PHP archive has mixed calculations. Initial `saveBaseCost` uses the base tax, while the following paths recalculate VAT on additional components. Applying the Node patch does not change PHP code or its browser bundle.

| Supplied source | Required client website alignment |
| --- | --- |
| `app/Services/ReservationDetailsPriceSyncService.php::vatFor` | For automatic recalculation, use `max(0, base - discount)`; exclude optional, extras, one-way and insurance. Review fee-only service handling separately. |
| `app/Http/Controllers/FrontEnd/ReservationController.php::updateFrontPageReservationCostOptionalCost` | Keep the gross payable sum, but calculate VAT from the discounted base fee only. |
| `app/Http/Controllers/FrontEnd/ReservationController.php::applyDiscountCoupon` | Retain the coupon's discount amount and allocation; use the discounted base fee for VAT in both apply and remove branches. |
| `app/Http/Controllers/Reservation/ReservationUpdateController.php::applyCouponToReservation` | Exclude extras from the tax base and retain all components in the payable total. |
| Native booking forms and manual cost dialogs | Verify their displayed tax and submitted values follow the same rule; define whether finance staff may intentionally override the VAT amount. |
| Existing website payment methods | Independently fix full-fare versus outstanding-balance calculations and multi-leg payment sums described in the alignment review. |

No PHP patch has been deployed or runtime-tested. Public view files and a runnable Laravel installation were absent from the supplied archive. The client website team must verify these paths before approving a shared financial workflow; using the same database does not make two calculation implementations identical.

## Database impact

Zero new SQL tables, columns, indexes or triggers are needed for this policy. The existing `base_tax`, `total_tax`, `optional_cost`, fee, discount and total columns hold the result. The previously documented cumulative mobile schema still applies. Old issued invoices, settled payments, agreed native charges and initialized provider attempts require explicit finance review before any historical correction; this release does not mass-reprice them.
