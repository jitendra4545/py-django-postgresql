# Location and vehicle-availability frontend flow

All paths use `/api/v1`. The same booking sequence is used by the Client and
Agency Agent areas. The Agent must additionally select a managed client before
creating a draft.

An animated step-through version of this guide is included at
`docs/FRONTEND_API_FLOW_ANIMATED.html`.

## 1. Location rules

- Device coordinates are requested by the frontend only after location
  permission is granted.
- The frontend reverse-geocodes coordinates into an ISO alpha-2 country code
  and city name. The backend does not call a map provider and does not save a
  location merely because the user logged in.
- The frontend sends the reverse-geocoded names to
  `GET /catalog/location/resolve` to obtain the IDs used by the existing
  database.
- The resolved country and city are defaults, not locked values. The user can
  select another country or city.
- Availability always uses the final location visible in the booking form.
- The exact selected pickup/drop-off objects, including coordinates when
  supplied, are saved in the booking draft and later copied to reservation
  records during checkout.

## 2. Client instant-booking calls

| Step | Screen/event                                | API call                                                                                                          | Frontend action after success                                                                             |
| ---: | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
|    1 | App launch with stored token                | `GET /auth/me`                                                                                                    | Restore the Client session.                                                                               |
|    2 | Home/Book opens                             | `GET /catalog/services`                                                                                           | Render enabled service cards.                                                                             |
|    3 | User selects an instant service             | Ask device location permission                                                                                    | Continue manually if permission is denied.                                                                |
|    4 | Reverse geocoding completes                 | `GET /catalog/location/resolve?countryCode=CH&city=Geneva`                                                        | Preselect returned IDs. If city is `null`, open the city picker.                                          |
|    5 | Manual country selection or fallback        | `GET /catalog/countries?serviceCode=CHAUFFEUR`                                                                    | Display only service-backed countries.                                                                    |
|    6 | Country selected                            | `GET /catalog/cities?countryId=3&search=Gen`                                                                      | Display active cities and keep the selected `cityId`.                                                     |
|    7 | Location, dates and passengers are complete | `GET /catalog/vehicle-classes?serviceCode=CHAUFFEUR&countryId=3&cityId=22&passengerCount=2&startAt=...&endAt=...` | Render only classes backed by a physical vehicle mapped to that country/city and free for the time range. |
|    8 | Vehicle class selected                      | `GET /catalog/options?serviceCode=CHAUFFEUR`                                                                      | Render configured extras.                                                                                 |
|    9 | Booking flow begins                         | `POST /bookings/drafts`                                                                                           | Store `draftId` locally.                                                                                  |
|   10 | User continues from trip/passenger form     | `PUT /bookings/drafts/{draftId}/details`                                                                          | Save selected class, passenger, pickup/drop-off, `countryId`, `cityId`, coordinates and options.          |
|   11 | Review opens                                | `POST /bookings/drafts/{draftId}/quote`                                                                           | Backend rechecks country/city/time availability and returns the price.                                    |
|   12 | User confirms                               | `POST /bookings/drafts/{draftId}/checkout` with `Idempotency-Key`                                                 | Create reservation and Stripe PaymentIntent.                                                              |
|   13 | Stripe sheet returns                        | `GET /payments/{paymentId}`                                                                                       | Trust the backend payment status, not only the SDK callback.                                              |
|   14 | Booking list/detail opens                   | `GET /bookings` and `GET /bookings/{id}`                                                                          | Show upcoming, live, completed or cancelled state.                                                        |

### Vehicle-class query behavior

- `countryId` is required.
- `cityId` is optional so an unmatched reverse-geocoded city can fall back to
  country availability.
- When the user explicitly selects a city, always send `cityId`.
- Only legacy vehicle `status = 1` and `online_booking_status = 1` inventory is
  eligible. Maintenance, accident, sold, pending-sale, listed-for-sale,
  disposed and inactive vehicles are never returned to Client or Agent apps.
- The public response contains vehicle classes, not physical vehicle IDs or
  internal status values.

## 3. Agency Agent difference

The catalog calls are identical to the Client flow. Before Step 9:

1. Call `GET /agent/clients`.
2. Select an assigned client or create one through `POST /agent/clients`.
3. Call `POST /bookings/drafts` with both `serviceCode` and the selected
   `customerId`.

The backend enforces that the selected client is assigned to the Agent. All
remaining details, quote, checkout, payment and tracking calls are the same.

## 4. Operations allocation flow

After payment and booking confirmation, Operations allocates a physical
vehicle:

```http
GET /api/v1/operations/vehicles/available
  ?vehicleClassId=12
  &countryId=3
  &cityId=22
  &startAt=2026-10-20T10:00:00.000Z
  &endAt=2026-10-20T14:00:00.000Z
```

The result excludes vehicle blocks, reserved dates and overlapping active
allocations. Operations then calls:

```http
POST /api/v1/operations/bookings/{reservationId}/legs/{detailId}/assign-vehicle
```

The assignment endpoint performs the checks again inside the allocation
transaction, including the booking leg's stored country/city mapping. This
prevents an out-of-city vehicle or a vehicle taken by another request from
being allocated after the search screen was loaded.

## 5. Chauffeur flow

The Chauffeur app does not select public vehicle inventory. Operations invites
the Chauffeur, assigns the confirmed booking, and the app then uses:

1. `POST /auth/invitations/accept` once.
2. `POST /auth/login` with the Expo push token.
3. `GET /chauffeur/dashboard` on Home and refresh.
4. `GET /chauffeur/assignments/{assignmentId}` on assignment detail.
5. `POST .../acknowledge` or `POST .../decline` for a new offer.
6. `POST .../status` for each permitted ride-state transition.
7. `POST .../location` while the assignment is active.
8. Expense, incident, chat and document APIs only when the corresponding user
   action occurs.

## 6. Failure handling

| Condition                          | Expected frontend behavior                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| Location permission denied         | Open country and city selection; booking remains fully usable.                                     |
| Country code not found             | Show the country picker and do not guess an ID.                                                    |
| Country found but city not found   | Keep country selected, ask the user to choose a city, or omit `cityId` for country-level fallback. |
| No vehicle classes returned        | Explain that no vehicle is available for that place/time and allow location/date changes.          |
| `VEHICLE_UNAVAILABLE` during quote | Return to vehicle selection and reload availability.                                               |
| Quote expired or draft changed     | Request a new quote before checkout.                                                               |
| Payment SDK callback is ambiguous  | Poll `GET /payments/{paymentId}`; the signed webhook is authoritative.                             |

## 7. Existing database tables used

| Purpose                                | Existing table/field                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Country IDs and codes                  | `countries`                                                                                            |
| City IDs, country link and coordinates | `cities`                                                                                               |
| Vehicle service locations              | `vehicle_cities`                                                                                       |
| Client default country/city            | `customers.country_id`, `customers.city`                                                               |
| Unfinished booking form                | `app_booking_drafts.details` JSON                                                                      |
| Reservation pickup/drop-off IDs        | `reservation_details.pick_up_country_id`, `pick_up_city_id`, `drop_off_country_id`, `drop_off_city_id` |
| Full selected location object          | `app_reservation_leg_meta.pickup_details`, `dropoff_details` JSON                                      |

No new location table is required for Release 1.
