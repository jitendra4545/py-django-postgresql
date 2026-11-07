> **Next consolidation step:** migration 009 subsequently moves the mobile leg and assignment metadata to `reservation_details` and `reservation_drivers`. See [RESERVATION_LEG_AND_DRIVER_CONSOLIDATION.md](RESERVATION_LEG_AND_DRIVER_CONSOLIDATION.md). The sections below document the scope of **008 only**.

# Reservations single-table consolidation (2026-11-06)

## Goal

Remove the **runtime** dependency on `app_reservation_meta` and use the existing
website `reservations` table for both legacy header fields and mobile-specific
reservation metadata. **No API routes, request objects, response JSON keys or
frontend integration contracts are changed.** The catalog-services migration
from the previous release is retained.

## Fields and compatibility

| Legacy `reservations` | Preserved behavior |
| --- | --- |
| `id`, `reservation_no`, `service_type` | Website reservation identifiers and numeric service category unchanged |
| `status` | Numeric legacy status: 0 pending, 1 confirmed, 2 complete, 3 cancelled |
| `payment_status`, `currency`, `created_at`, `updated_at` | Kept and not repurposed |

| New nullable column on `reservations` | Previous `app_reservation_meta` source |
| --- | --- |
| `service_code` | `service_code` |
| `source_channel` | `source_channel` |
| `created_by_user_id` | `created_by_user_id` |
| `created_by_agent_id` | `created_by_agent_id` |
| `lifecycle_status` | `lifecycle_status` (text, **not** `status`) |
| `currency_code` | `currency_code` (3-letter code, **not** website symbol `currency`) |
| `quote_snapshot_id` | `quote_snapshot_id` |

Existing website booking rows have `service_code=NULL` unless they previously
had mobile metadata. This replaces the old INNER JOIN's behavior of excluding
reservations without an `app_reservation_meta` row. The route that previously
used a LEFT JOIN retains that behavior. To expose historic website bookings in
the mobile apps would require a separate, reviewed product/permissions and
status mapping decision; this migration intentionally does not do that.

Existing `reservation_details`, `app_reservation_leg_meta`, payment,
assignments, and event tables are not consolidated by this targeted change.

## Required release order

1. **Take and verify a restorable MySQL/MariaDB backup.** Do not work directly
   on the only copy of the customer database. Test the migration on staging.
2. Apply `migrations/008_consolidate_reservation_meta_into_reservations.sql` to
   the correct database before deploying the new backend. This SQL is intended
   to run once. When previous migration files have already been recorded in
   `app_schema_migrations`, the normal `npm run migrate` runner applies only
   pending files. If that ledger is not present on the client's database,
   review earlier migrations first rather than blindly applying all seven.
3. The migration adds seven nullable columns and two indexes. If the old
   `app_reservation_meta` **base table** exists, it copies its data into matching
   `reservations` rows without overwriting rows that already contain mobile
   metadata. If that old table does not exist, the backfill is skipped.
4. Check counts on staging and test checkout, booking list/detail, payment
   success/retry, unpaid hold expiration, cancellation/change requests, agent,
   chauffeur and operations endpoints. Deploy the new backend only after these
   checks. Keep the old table if present for rollback; do not drop it yet.
5. To roll back to old application code, re-synchronize newly created mobile
   reservations into the old table first. An old-code rollback is **not** safe
   without this step because new code no longer writes `app_reservation_meta`.

### Verification queries

```sql
SHOW COLUMNS FROM reservations;
SELECT COUNT(*) AS mobile_rows FROM reservations WHERE service_code IS NOT NULL;
SELECT id, reservation_no, service_type, status, payment_status,
       service_code, lifecycle_status, currency_code, source_channel
  FROM reservations
 WHERE service_code IS NOT NULL ORDER BY id DESC LIMIT 20;
```

If the old table exists, compare old and new mobile record counts:

```sql
SELECT COUNT(*) AS old_mobile_rows FROM app_reservation_meta;
SELECT COUNT(*) AS new_mobile_rows FROM reservations WHERE service_code IS NOT NULL;
```

Do **not** run the second set when the old table is missing.

## API response compatibility

The code continues to select `service_code AS serviceCode`,
`lifecycle_status AS status`, `currency_code AS currency`,
`source_channel AS sourceChannel` and `created_by_agent_id AS createdByAgentId`
from the same aliases as before. The booking list, detail, payment and
client/agent/chauffeur response builders have not been changed.

For the first consolidation release the existing `arm` SQL aliases are retained
as PK joins to **the same `reservations` table**, guarded by
`arm.service_code IS NOT NULL`. This is deliberate: it preserves the earlier
inner/left join semantics and limits query changes in sensitive payment and
access flows. It is one physical table, not a separate metadata table. These
redundant self-joins can be simplified after end-to-end acceptance testing.

## Scope and limitations

- Only one reservation-header metadata table is consolidated. The remaining
  `app_*` extension tables are unchanged; other missing compatibility objects
  may still block unrelated operations.
- Schema validation and static checks do **not** prove the legacy website/PHP
  and mobile APIs behave identically against a live customer database.
- The provided SQL dump was schema-only for `services`/`reservations` and
  cannot verify actual booking rows or the presence of prior mobile metadata.
- This migration does not change existing API payloads, service-code mapping,
  or Stripe behavior. Do not deploy application code ahead of the schema.
