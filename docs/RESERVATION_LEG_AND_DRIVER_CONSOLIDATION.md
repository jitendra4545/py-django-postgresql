# Drive Luxury — reservation header, legs, and chauffeurs on existing PHP tables

**Date:** 2026-11-06  
**Baseline:** `drive-luxury-backend-js-reservations-consolidated.zip` + client-supplied MariaDB 10.6 schema dump (2026-11-03).  
**Status:** Code and static checks complete; **not yet tested against a populated client database or the PHP website**.

## What changed

| Historical mobile table | Authoritative client table now | Notes |
| --- | --- | --- |
| `app_reservation_meta` | `reservations` | Previously consolidated in migration **008**; retains numeric website `status` and `service_type` while mobile text status lives in `lifecycle_status` |
| `app_reservation_leg_meta` | `reservation_details` | Migration **009** adds nullable `sequence_no`, `vehicle_class_id`, `passenger_count`, `luggage_count`, JSON `pickup_details`, JSON `dropoff_details`, `flight_number` and `mobile_leg_status` |
| `app_driver_assignments` | `reservation_drivers` | Migration **009** adds nullable mobile assignment state/driver/schedule/role and preserves the website's `pick_up_driver_id`, `drop_off_driver_id`, and numeric `status` |

The existing **API routes, response JSON property names, and envelope formats are unchanged**. Backwards compatibility of legacy **row IDs** is handled by storing the previous `app_driver_assignments.id` in `reservation_drivers.mobile_assignment_id`. New public IDs are issued by an ID-only `app_mobile_assignment_ids` sequence table (necessary because unrelated `reservation_drivers.id` values can already exist). All API ID values stay numeric. Tracking, statuses, expenses and incident records continue referring to the original public assignment ID, now foreign-keyed to `reservation_drivers.mobile_assignment_id`.

`app_reservation_meta`, `app_reservation_leg_meta`, and `app_driver_assignments` are **not dropped**. They remain as archived/rollback data, but the new runtime reads/writes the original PHP tables. Existing foundational migration 001 and migration 008 are not rewritten, to retain checksum compatibility.

### Keeping pickup and dropoff drivers separate

A PHP `reservation_drivers` row can hold a different `pick_up_driver_id` and `drop_off_driver_id`; the backfill **never updates those two existing columns**. Mobile assignment metadata has a separate `mobile_driver_id`, `mobile_assignment_status` and `mobile_assignment_role` (`PICKUP`, `DROPOFF`, or `BOTH` for historical data). If two historical mobile assignments share one original PHP row, a second **website-inactive** `reservation_drivers` row is created for the second mobile assignment (numeric `status=2`), preserving the original PHP row unchanged.

The existing operations endpoint `POST /api/v1/operations/bookings/:reservationId/legs/:detailId/assign-chauffeur` is unchanged. It also accepts an **optional** `assignmentRole: "DROPOFF"` (default `PICKUP`); no existing frontend request needs to change. Replacing pickup assignment does not automatically cancel the dropoff mobile assignment, and vice versa. A second assignment may create an additional legacy row for that leg. **Validate the PHP site's list/count behavior for this case in staging**, because we did not inspect the PHP application source in this task.

## Safe rollout order

1. Obtain a verified, restorable **full backup**, including all original `app_*` tables if present. Clone into **staging**. A schema-only dump is not sufficient to prove data compatibility.
2. Verify the base PHP tables are present. If your deployment already has `app_schema_migrations`, inspect its ledger; do not reapply previous migrations out of order. **008 must already be applied** before 009.
3. **Pause writes on the old mobile backend** before the backfill, so no new `app_*` rows appear after copying. Apply `migrations/009_consolidate_reservation_legs_and_driver_assignments.sql` on staging using the verified release migration runner or MySQL Workbench. MySQL/MariaDB DDL is **not transactionally rolled back**; inspect every statement if one fails. The migration is designed to skip already-added fields, backfill only missing records, and repoint four child FKs.
4. Compare old/new data counts, validate mobile reservations and all assignment IDs, then deploy the updated backend **only after** migration 009 succeeds. Both deployments must happen in a maintenance/release window because old and new code write different tables.
5. Test existing mobile app flows (quotes, checkout, booking lists/details, payment confirmations, change/cancellation, operations, chauffeur acknowledgement/status, GPS, expenses, incidents, chat and masked calls). Also test website pickup/dropoff assignments and website booking lists.
6. Keep the old `app_*` archive tables for at least one rollback window. **Rolling back to old Node.js code after new writes is not safe without copying newer mobile fields back into the archived extension tables and restoring the former child FKs**. Do not drop any archived table based only on static checks.

## SQL verification queries for staging

```sql
-- 1. Check that all mobile fields are now present.
SHOW COLUMNS FROM reservations;
SHOW COLUMNS FROM reservation_details;
SHOW COLUMNS FROM reservation_drivers;

-- 2. Mobile leg migration counts (only run old-table count if it exists).
SELECT COUNT(*) AS new_mobile_legs FROM reservation_details WHERE sequence_no IS NOT NULL;
SELECT COUNT(*) AS new_mobile_assignments FROM reservation_drivers WHERE mobile_assignment_id IS NOT NULL;
SELECT COUNT(*) AS repeated_public_ids FROM (
  SELECT mobile_assignment_id FROM reservation_drivers
  WHERE mobile_assignment_id IS NOT NULL
  GROUP BY mobile_assignment_id HAVING COUNT(*) > 1
) x;

-- 3. Verify that pickup/dropoff stay independent.
SELECT id, reservation_id, reservation_details_id,
       pick_up_driver_id, drop_off_driver_id,
       mobile_assignment_id, mobile_driver_id,
       mobile_assignment_role, mobile_assignment_status
  FROM reservation_drivers
 WHERE mobile_assignment_id IS NOT NULL
 ORDER BY id DESC LIMIT 30;

-- 4. Child assignment FK targets (all should name reservation_drivers).
SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
  FROM information_schema.KEY_COLUMN_USAGE
 WHERE TABLE_SCHEMA = DATABASE()
   AND TABLE_NAME IN ('app_booking_status_events','app_driver_locations','app_driver_expenses','app_incidents')
   AND COLUMN_NAME = 'assignment_id' AND REFERENCED_TABLE_NAME IS NOT NULL;
```

If the archived tables exist, also run:

```sql
SELECT COUNT(*) AS archived_leg_rows FROM app_reservation_leg_meta;
SELECT COUNT(*) AS archived_assignment_rows FROM app_driver_assignments;
SELECT COUNT(*) AS missing_old_assignment_mappings
  FROM app_driver_assignments old
  LEFT JOIN reservation_drivers current ON current.mobile_assignment_id = old.id
 WHERE current.id IS NULL;
```

**Expected:** `missing_old_assignment_mappings=0`, `repeated_public_ids=0` and the new counts at least as large as the archived counts. Investigate mismatches before deploying. These checks do not guarantee the PHP site's behavior.

## Frontend API compatibility

The following response keys remain as before:

- Booking view: `legs` entries include `sequenceNo`, `vehicleClassId`, `passengerCount`, `luggageCount`, `pickupDetails`, `dropoffDetails`, `flightNumber`, and `status` (from `reservation_details.mobile_leg_status`)
- Assignment list/tracking: `id`, `status`, `legId`, `scheduledStartAt`, `scheduledEndAt`, and the same customer, chauffeur, and location fields
- Chauffeur detail: existing snake_case assignment fields, customer/leg attributes and status; no additional role property was added to the response
- Mutation responses: `{ id, status }` and the existing notification payload formats

Schema/response static checks are included in `npm run reservation:relations-check`. There is **no verified live DB test** in this artifact. This SQL change is not safe to deploy to production without staging verification and a rollback plan.
