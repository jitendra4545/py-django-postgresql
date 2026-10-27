# Chauffeur hour selection — React Native Expo integration

When a customer selects chauffeur service, display an integer hour selector (minimum 2 hours). Send `requestedHours` in **each** leg to `PUT /api/v1/bookings/drafts/{draftId}/details`; `endAt` is optional when this value is supplied. The backend derives `endAt = startAt + requestedHours`, sets `isHourly` true and saves both together.

Example leg (inside the complete booking-details body):

```json
{
  "startAt": "2026-11-05T10:00:00.000Z",
  "requestedHours": 4,
  "isHourly": true,
  "pickup": {"address":"Pickup address", "countryId":15,"cityId":125},
  "dropoff": {"address":"Dropoff address", "countryId":15,"cityId":125},
  "stops": []
}
```

Use **actual** country/city IDs and validated Google Places addresses from catalog APIs. The quote API `POST /api/v1/bookings/drafts/{draftId}/quote` then calculates seasonal hourly rate and verified-route extra-km charges. The price is not calculated by the frontend. If the supplied `endAt` is earlier than the selected package end, it is normalized to the full booked window; if later, the API rejects with `INVALID_CHAUFFEUR_HOURS` to avoid booking less time than requested. Availability and final reservation use the same effective end time. There is no new SQL migration.

The existing non-hourly chauffeur flow remains supported if `requestedHours` is omitted (supply `endAt`). Dates/times must be ISO 8601. Auth is still required.
