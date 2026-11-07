# Drive Luxury catalog: `services` table integration

## Endpoint and source

`GET /api/v1/catalog/services` is implemented in `src/modules/catalog.js`. It now reads **only** the existing website table `services`, instead of `app_service_catalog`:

```sql
SELECT id, title, slug, image, description_en
FROM services
ORDER BY id;
```

The supplied 2026-11-03 database SQL dump defines `services` with `id`, `title`, `slug`, `image`, `description_en`, `description_de`, `description_fr`, `created_at`, `updated_at`. It does **not** define `app_service_catalog`. It contains table structure but no inserted `services` records, so live service names and URLs could not be verified from the dump.

## Response compatibility

The endpoint still returns `{ "items": [...] }`. Each item keeps these existing fields:

| API field | Source |
|---|---|
| `title` | `services.title` |
| `description` | `services.description_en` (or `null`) |
| `iconUrl` | `services.image` (or `null`; relative paths remain relative) |
| `code` | Derived from `services.slug` and `title`, rather than a table column |
| `bookingMode` | `INSTANT` for known booking service codes, otherwise `MANUAL_REQUEST` |
| `legacyServiceId` | Legacy service-type mapping: CHAUFFEUR=1, CAR_RENTAL=2, TRANSFER=3; otherwise `null` |

Known service names include variations of Chauffeur/Limousine, Transfer, Rent a Car/Car Rental, Airport VIP, and Concierge. Other website services are displayed with a normalized slug-derived code and `MANUAL_REQUEST`. **New manual service types do not automatically acquire a booking endpoint**; adding a request flow would be a separate task. The current PHP website may also use editorial service IDs that are **not** the `reservations.service_type` values.

Because the website table lacks `is_active` and `display_order`, the endpoint includes **all** `services` rows in `id` order. If the live site needs publish/visibility filters or a particular display order, those rules must be supplied by the client or modeled separately.

## Related checkout fix

`src/services/booking-service.js` previously queried `app_service_catalog` when creating a legacy reservation. That dependency was also removed. It now uses the existing backend constant mapping in `src/services/legacy-pricing-rules.js`, which matches the legacy reservation service types (1, 2, 3). No schema change or insertion is required for this catalog fix.

**Scope limitation:** Other mobile-specific `app_*` tables and compatibility views may still be required for booking, checkout, and other endpoints. This change does not verify or replace those dependencies.

## Verification

In the client database run:

```sql
SHOW COLUMNS FROM services;
SELECT id, title, slug, image, description_en FROM services ORDER BY id;
```

Then test:

```text
GET /api/v1/catalog/services
```

Expect HTTP 200 and `items` holding data mapped from `services` (or an empty list if the table contains no rows). Confirm the returned `code` and `bookingMode` are appropriate for each actual service row. Note that URLs in `services.image` may need to be resolved against the website asset base URL by the frontend.
