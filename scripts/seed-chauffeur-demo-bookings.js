// import crypto from 'node:crypto';
// import { URLSearchParams } from 'node:url';
// import { env } from '../src/config/env.js';
// import { pool, query } from '../src/db/pool.js';

/*
 * Creates 10 paid, confirmed chauffeur bookings and assigns them to one driver.
 * It creates two non-overlapping bookings on each of five available days.
 *
 * This version intentionally DOES NOT call:
 *   GET /operations/chauffeurs/available
 *
 * Older backend packages do not expose that route. Instead, it checks
 * app_driver_assignments directly before creating any booking.
 */

// const API_BASE_URL = normalizeApiBase(
//   process.env.API_BASE_URL ?? 'http://localhost:3000',
// );

// const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@test.local';
// const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'AdminTest#2026';

// const CUSTOMER_ID = positiveInteger(
//   'CUSTOMER_ID',
//   process.env.CUSTOMER_ID ?? '7860',
// );

// const DRIVER_ID = positiveInteger(
//   'DRIVER_ID',
//   process.env.DRIVER_ID ?? '3216',
// );

// const COUNTRY_ID = positiveInteger(
//   'COUNTRY_ID',
//   process.env.COUNTRY_ID ?? '3',
// );

// const CITY_ID = positiveInteger(
//   'CITY_ID',
//   process.env.CITY_ID ?? '24',
// );

// const CITY_NAME = process.env.CITY_NAME ?? 'Geneva';

// const VEHICLE_CLASS_ID = optionalPositiveInteger(
//   'VEHICLE_CLASS_ID',
//   process.env.VEHICLE_CLASS_ID,
// );

// const START_DAY_OFFSET = nonNegativeInteger(
//   'START_DAY_OFFSET',
//   process.env.START_DAY_OFFSET ?? '1',
// );

// const MAX_SEARCH_DAYS = positiveInteger(
//   'MAX_SEARCH_DAYS',
//   process.env.MAX_SEARCH_DAYS ?? '120',
// );

// const DAILY_SLOTS = [
//   {
//     label: 'Morning',
//     startHour: 8,
//     endHour: 11,
//   },
//   {
//     label: 'Afternoon',
//     startHour: 14,
//     endHour: 17,
//   },
// ];

// const BOOKING_DATA = [
//   {
//     passengerName: 'Emma Wilson',
//     phone: '+41790001001',
//     pickup: 'Geneva Airport, Route de l’Aéroport 21',
//     dropoff: 'Hotel President Wilson, Quai Wilson 47',
//     distanceKm: 8,
//   },
//   {
//     passengerName: 'Liam Martin',
//     phone: '+41790001002',
//     pickup: 'Gare Cornavin, Place de Cornavin 7',
//     dropoff: 'Palais des Nations, Avenue de la Paix 14',
//     distanceKm: 5,
//   },
//   {
//     passengerName: 'Olivia Brown',
//     phone: '+41790001003',
//     pickup: 'Mandarin Oriental Geneva, Quai Turrettini 1',
//     dropoff: 'Geneva Airport, Route de l’Aéroport 21',
//     distanceKm: 7,
//   },
//   {
//     passengerName: 'Noah Garcia',
//     phone: '+41790001004',
//     pickup: 'Four Seasons Hotel des Bergues, Quai des Bergues 33',
//     dropoff: 'CERN, Esplanade des Particules 1',
//     distanceKm: 10,
//   },
//   {
//     passengerName: 'Sophia Taylor',
//     phone: '+41790001005',
//     pickup: 'The Ritz-Carlton Hotel de la Paix, Quai du Mont-Blanc 11',
//     dropoff: 'Carouge Market, Place du Marché',
//     distanceKm: 6,
//   },
//   {
//     passengerName: 'Ethan Anderson',
//     phone: '+41790001006',
//     pickup: 'InterContinental Geneva, Chemin du Petit-Saconnex 7-9',
//     dropoff: 'Jet d’Eau, Quai Gustave-Ador',
//     distanceKm: 6,
//   },
//   {
//     passengerName: 'Isabella Thomas',
//     phone: '+41790001007',
//     pickup: 'Geneva Marriott Hotel, Chemin du Ruisseau 1',
//     dropoff: 'Patek Philippe Museum, Rue des Vieux-Grenadiers 7',
//     distanceKm: 7,
//   },
//   {
//     passengerName: 'Lucas Moore',
//     phone: '+41790001008',
//     pickup: 'Beau-Rivage Genève, Quai du Mont-Blanc 13',
//     dropoff: 'United Nations Office at Geneva, Avenue de la Paix 8-14',
//     distanceKm: 4,
//   },
//   {
//     passengerName: 'Mia Jackson',
//     phone: '+41790001009',
//     pickup: 'Hôtel Métropole Genève, Quai du Général-Guisan 34',
//     dropoff: 'Geneva Airport, Route de l’Aéroport 21',
//     distanceKm: 8,
//   },
//   {
//     passengerName: 'James White',
//     phone: '+41790001010',
//     pickup: 'Parc des Eaux-Vives, Quai Gustave-Ador 82',
//     dropoff: 'Gare Cornavin, Place de Cornavin 7',
//     distanceKm: 5,
//   },
// ];

// function normalizeApiBase(value) {
//   const withoutTrailingSlash = String(value)
//     .trim()
//     .replace(/\/+$/, '');

//   return withoutTrailingSlash.endsWith('/api/v1')
//     ? withoutTrailingSlash
//     : `${withoutTrailingSlash}/api/v1`;
// }

// function positiveInteger(name, value) {
//   const parsed = Number(value);

//   if (!Number.isInteger(parsed) || parsed <= 0) {
//     throw new Error(
//       `${name} must be a positive integer; received ${JSON.stringify(value)}`,
//     );
//   }

//   return parsed;
// }

// function optionalPositiveInteger(name, value) {
//   if (
//     value === undefined ||
//     value === null ||
//     String(value).trim() === ''
//   ) {
//     return null;
//   }

//   return positiveInteger(name, value);
// }

// function nonNegativeInteger(name, value) {
//   const parsed = Number(value);

//   if (!Number.isInteger(parsed) || parsed < 0) {
//     throw new Error(
//       `${name} must be a non-negative integer; received ${JSON.stringify(value)}`,
//     );
//   }

//   return parsed;
// }

// function utcDateAtOffset(dayOffset, hour) {
//   const value = new Date();

//   value.setUTCHours(0, 0, 0, 0);
//   value.setUTCDate(value.getUTCDate() + dayOffset);
//   value.setUTCHours(hour, 0, 0, 0);

//   return value;
// }

// function mysqlDateTime(isoValue) {
//   return isoValue.slice(0, 19).replace('T', ' ');
// }

// function errorMessage(payload, status) {
//   return (
//     payload?.error?.message ??
//     payload?.message ??
//     (typeof payload === 'string' ? payload : null) ??
//     `HTTP ${status}`
//   );
// }

// async function api(
//   path,
//   {
//     method = 'GET',
//     token,
//     body,
//     headers = {},
//   } = {},
// ) {
//   const response = await fetch(`${API_BASE_URL}${path}`, {
//     method,
//     headers: {
//       Accept: 'application/json',

//       ...(body === undefined
//         ? {}
//         : {
//             'Content-Type': 'application/json',
//           }),

//       ...(token
//         ? {
//             Authorization: `Bearer ${token}`,
//           }
//         : {}),

//       ...headers,
//     },

//     ...(body === undefined
//       ? {}
//       : {
//           body: JSON.stringify(body),
//         }),
//   });

//   const responseText = await response.text();

//   let payload = null;

//   if (responseText) {
//     try {
//       payload = JSON.parse(responseText);
//     } catch {
//       payload = responseText;
//     }
//   }

//   if (!response.ok) {
//     const error = new Error(
//       `${method} ${path} failed: ${errorMessage(
//         payload,
//         response.status,
//       )}`,
//     );

//     error.status = response.status;
//     error.payload = payload;

//     throw error;
//   }

//   return payload;
// }

// async function loginAdmin() {
//   const result = await api('/auth/login', {
//     method: 'POST',

//     body: {
//       email: ADMIN_EMAIL,
//       password: ADMIN_PASSWORD,

//       device: {
//         deviceId: `demo-booking-seeder-${crypto.randomUUID()}`,
//         platform: 'WEB',
//         appVersion: '1.0.0',
//       },
//     },
//   });

//   if (![1, 2].includes(Number(result?.user?.role))) {
//     throw new Error(
//       `ADMIN_EMAIL must belong to ADMIN (1) or STAFF (2); received role ${result?.user?.role}`,
//     );
//   }

//   if (!result?.tokens?.accessToken) {
//     throw new Error('Admin login did not return an access token');
//   }

//   return result.tokens.accessToken;
// }

// async function assertSeedEntitiesExist() {
//   const customers = await query(
//     `
//       SELECT
//         id,
//         full_name AS fullName
//       FROM customers
//       WHERE id = ?
//         AND deleted_at IS NULL
//       LIMIT 1
//     `,
//     [CUSTOMER_ID],
//   );

//   if (!customers[0]) {
//     throw new Error(`Customer ${CUSTOMER_ID} was not found`);
//   }

//   const drivers = await query(
//     `
//       SELECT
//         d.id,
//         d.full_name AS fullName,
//         d.user_id AS userId
//       FROM drivers d
//       JOIN users u
//         ON u.id = d.user_id
//       WHERE d.id = ?
//         AND d.deleted_at IS NULL
//         AND u.deleted_at IS NULL
//         AND u.role = 3
//       LIMIT 1
//     `,
//     [DRIVER_ID],
//   );

//   if (!drivers[0]) {
//     throw new Error(
//       `Chauffeur/driver ${DRIVER_ID} was not found`,
//     );
//   }

//   console.log(
//     `Customer: ${customers[0].fullName} (${customers[0].id})`,
//   );

//   console.log(
//     `Chauffeur: ${drivers[0].fullName} ` +
//       `(driver ${drivers[0].id}, user ${drivers[0].userId})`,
//   );
// }

// async function driverHasConflict(startAt, endAt) {
//   const rows = await query(
//     `
//       SELECT
//         id,
//         status,
//         scheduled_start_at AS scheduledStartAt,
//         scheduled_end_at AS scheduledEndAt
//       FROM app_driver_assignments
//       WHERE driver_id = ?
//         AND status NOT IN (
//           'DECLINED',
//           'COMPLETED',
//           'NO_SHOW',
//           'CANCELLED'
//         )
//         AND scheduled_start_at < ?
//         AND scheduled_end_at > ?
//       LIMIT 1
//     `,
//     [
//       DRIVER_ID,
//       mysqlDateTime(endAt),
//       mysqlDateTime(startAt),
//     ],
//   );

//   return rows[0] ?? null;
// }

// async function availableVehicleClass(startAt, endAt) {
//   const search = new URLSearchParams({
//     serviceCode: 'CHAUFFEUR',
//     countryId: String(COUNTRY_ID),
//     cityId: String(CITY_ID),
//     passengerCount: '1',
//     startAt,
//     endAt,
//   });

//   const result = await api(
//     `/catalog/vehicle-classes?${search.toString()}`,
//   );

//   const classes = Array.isArray(result?.items)
//     ? result.items
//     : [];

//   if (!classes.length) {
//     return null;
//   }

//   if (!VEHICLE_CLASS_ID) {
//     return classes[0];
//   }

//   return (
//     classes.find(
//       (item) => Number(item.id) === VEHICLE_CLASS_ID,
//     ) ?? null
//   );
// }

// async function findFiveAvailableDays() {
//   const selectedDays = [];

//   console.log('\nSearching for 5 available days');
//   console.log('Each selected day must support both slots:');
//   console.log('- Morning: 08:00–11:00 UTC');
//   console.log('- Afternoon: 14:00–17:00 UTC\n');

//   for (
//     let dayOffset = START_DAY_OFFSET;
//     dayOffset < START_DAY_OFFSET + MAX_SEARCH_DAYS &&
//     selectedDays.length < 5;
//     dayOffset += 1
//   ) {
//     const slots = [];
//     let validDay = true;

//     for (const slot of DAILY_SLOTS) {
//       const startAt = utcDateAtOffset(
//         dayOffset,
//         slot.startHour,
//       ).toISOString();

//       const endAt = utcDateAtOffset(
//         dayOffset,
//         slot.endHour,
//       ).toISOString();

//       const conflict = await driverHasConflict(
//         startAt,
//         endAt,
//       );

//       if (conflict) {
//         console.log(
//           `Skipping ${startAt.slice(0, 10)} ${slot.label}: ` +
//             `overlaps assignment ${conflict.id}`,
//         );

//         validDay = false;
//         break;
//       }

//       const vehicleClass = await availableVehicleClass(
//         startAt,
//         endAt,
//       );

//       if (!vehicleClass) {
//         console.log(
//           `Skipping ${startAt.slice(0, 10)} ${slot.label}: ` +
//             'no available vehicle class',
//         );

//         validDay = false;
//         break;
//       }

//       slots.push({
//         ...slot,
//         startAt,
//         endAt,
//         vehicleClassId: Number(vehicleClass.id),
//       });
//     }

//     if (validDay && slots.length === 2) {
//       selectedDays.push({
//         dayOffset,
//         date: slots[0].startAt.slice(0, 10),
//         slots,
//       });

//       console.log(
//         `Selected ${slots[0].startAt.slice(0, 10)} ` +
//           '(2 free slots)',
//       );
//     }
//   }

//   if (selectedDays.length < 5) {
//     throw new Error(
//       `Could find only ${selectedDays.length} complete available days ` +
//         `within ${MAX_SEARCH_DAYS} days. Increase MAX_SEARCH_DAYS or ` +
//         'choose another DRIVER_ID or VEHICLE_CLASS_ID.',
//     );
//   }

//   return selectedDays;
// }

// async function createAndAssignBooking({
//   token,
//   bookingData,
//   slot,
//   bookingNumber,
// }) {
//   /*
//    * Recheck immediately before creating the booking.
//    * This protects against another process assigning the chauffeur
//    * after the initial date search.
//    */
//   const latestConflict = await driverHasConflict(
//     slot.startAt,
//     slot.endAt,
//   );

//   if (latestConflict) {
//     throw new Error(
//       `Slot became unavailable because assignment ` +
//         `${latestConflict.id} overlaps ` +
//         `${slot.startAt}–${slot.endAt}`,
//     );
//   }

//   /*
//    * Step 1: Create booking draft
//    */
//   const draft = await api('/bookings/drafts', {
//     method: 'POST',
//     token,

//     body: {
//       serviceCode: 'CHAUFFEUR',
//       customerId: CUSTOMER_ID,
//     },
//   });

//   /*
//    * Step 2: Add passenger, vehicle class and trip details
//    */
//   await api(`/bookings/drafts/${draft.id}/details`, {
//     method: 'PUT',
//     token,

//     body: {
//       vehicleClassId: slot.vehicleClassId,

//       passenger: {
//         fullName: bookingData.passengerName,
//         email:
//           `demo.passenger${String(bookingNumber).padStart(2, '0')}` +
//           '@example.com',
//         phone: bookingData.phone,
//         count: 1,
//         luggageCount: bookingNumber % 3,
//       },

//       legs: [
//         {
//           startAt: slot.startAt,
//           endAt: slot.endAt,

//           pickup: {
//             address: bookingData.pickup,
//             countryId: COUNTRY_ID,
//             cityId: CITY_ID,
//             city: CITY_NAME,
//             instructions:
//               `Demo booking ${bookingNumber}: ` +
//               'meet passenger at the main entrance',
//           },

//           dropoff: {
//             address: bookingData.dropoff,
//             countryId: COUNTRY_ID,
//             cityId: CITY_ID,
//             city: CITY_NAME,
//           },

//           stops: [],
//           approximateDistanceKm: bookingData.distanceKm,
//           isHourly: true,
//           notes: `Chauffeur app demo trip ${bookingNumber}`,
//         },
//       ],

//       options: [],

//       notes:
//         `Generated demo booking ${bookingNumber} ` +
//         `for chauffeur ${DRIVER_ID}`,
//     },
//   });

//   /*
//    * Step 3: Generate quote
//    */
//   await api(`/bookings/drafts/${draft.id}/quote`, {
//     method: 'POST',
//     token,
//   });

//   /*
//    * Step 4: Checkout and create the reservation
//    */
//   const checkout = await api(
//     `/bookings/drafts/${draft.id}/checkout`,
//     {
//       method: 'POST',
//       token,

//       headers: {
//         'Idempotency-Key':
//           `chauffeur-demo-${crypto.randomUUID()}`,
//       },
//     },
//   );

//   /*
//    * Step 5: Confirm mock payment
//    */
//   await api(
//     `/payments/${checkout.payment.id}/mock-confirm`,
//     {
//       method: 'POST',
//       token,
//     },
//   );

//   /*
//    * Step 6: Operations confirms the booking
//    */
//   await api(
//     `/operations/bookings/${checkout.bookingId}/decision`,
//     {
//       method: 'POST',
//       token,

//       body: {
//         decision: 'CONFIRM',
//         note:
//           `Demo booking ${bookingNumber} ` +
//           'automatically confirmed',
//       },
//     },
//   );

//   /*
//    * Step 7: Load booking details to get reservation detail ID
//    */
//   const booking = await api(
//     `/bookings/${checkout.bookingId}`,
//     {
//       token,
//     },
//   );

//   const detailId = Number(booking?.legs?.[0]?.id);

//   if (!detailId) {
//     throw new Error(
//       `Booking ${checkout.bookingId} did not return ` +
//         'a reservation leg ID',
//     );
//   }

//   /*
//    * Step 8: Final conflict check before assignment
//    */
//   const finalConflict = await driverHasConflict(
//     slot.startAt,
//     slot.endAt,
//   );

//   if (finalConflict) {
//     throw new Error(
//       `Cannot assign booking ${checkout.bookingId}. ` +
//         `Assignment ${finalConflict.id} now overlaps this slot.`,
//     );
//   }

//   /*
//    * Step 9: Assign booking to chauffeur
//    */
//   const assignment = await api(
//     `/operations/bookings/${checkout.bookingId}` +
//       `/legs/${detailId}/assign-chauffeur`,
//     {
//       method: 'POST',
//       token,

//       body: {
//         driverId: DRIVER_ID,
//         scheduledStartAt: slot.startAt,
//         scheduledEndAt: slot.endAt,
//       },
//     },
//   );

//   return {
//     bookingNumber,
//     bookingId: checkout.bookingId,
//     reservationNo: checkout.reservationNo,
//     detailId,
//     assignmentId: assignment.id,
//     assignmentStatus: assignment.status ?? 'OFFERED',
//     passengerName: bookingData.passengerName,
//     startAt: slot.startAt,
//     endAt: slot.endAt,
//   };
// }

// async function main() {
//   if (env.PAYMENT_PROVIDER !== 'mock') {
//     throw new Error(
//       'This demo generator requires PAYMENT_PROVIDER=mock because ' +
//         'it automatically confirms payment. Set PAYMENT_PROVIDER=mock ' +
//         'and NODE_ENV=development, then restart the backend.',
//     );
//   }

//   if (env.NODE_ENV === 'production') {
//     throw new Error(
//       'Do not run this demo generator with NODE_ENV=production',
//     );
//   }

//   console.log('------------------------------------------');
//   console.log('Drive Luxury Chauffeur Demo Booking Seeder');
//   console.log('------------------------------------------');
//   console.log(`API: ${API_BASE_URL}`);
//   console.log(`Customer ID: ${CUSTOMER_ID}`);
//   console.log(`Driver ID: ${DRIVER_ID}`);

//   /*
//    * Verify customer and chauffeur records before creating anything.
//    */
//   await assertSeedEntitiesExist();

//   /*
//    * Log in as an administrator.
//    */
//   const token = await loginAdmin();

//   console.log('Admin login successful');

//   /*
//    * Find five dates where both daily time slots are available.
//    */
//   const selectedDays = await findFiveAvailableDays();

//   const plannedSlots = selectedDays.flatMap(
//     (day) => day.slots,
//   );

//   console.log(
//     '\nCreating 10 bookings ' +
//       '(2 bookings per selected day)...\n',
//   );

//   const created = [];

//   for (const [index, slot] of plannedSlots.entries()) {
//     const bookingNumber = index + 1;

//     try {
//       const result = await createAndAssignBooking({
//         token,
//         bookingData: BOOKING_DATA[index],
//         slot,
//         bookingNumber,
//       });

//       created.push(result);

//       console.log(
//         `Booking ${bookingNumber}/10 created: ` +
//           `${result.reservationNo} | ` +
//           `${result.passengerName} | ` +
//           `${result.startAt} | ` +
//           `assignment ${result.assignmentId}`,
//       );
//     } catch (error) {
//       console.error(
//         `\nBooking ${bookingNumber} failed: ${error.message}`,
//       );

//       if (error.payload) {
//         console.error(
//           JSON.stringify(error.payload, null, 2),
//         );
//       }

//       throw error;
//     }
//   }

//   console.log(
//     '\nAll 10 demo bookings were created successfully.',
//   );

//   console.table(created);

//   console.log(
//     '\nAssignments remain in OFFERED status.',
//   );

//   console.log(
//     'Log in as Ravi in the chauffeur app and acknowledge each trip.',
//   );
// }

// main()
//   .catch((error) => {
//     console.error(
//       `\nDemo generation failed:\n${error.message}`,
//     );

//     process.exitCode = 1;
//   })
//   .finally(async () => {
//     await pool.end();
//   });













// import crypto from 'node:crypto';

// const normalizeBaseUrl = (value) => {
//   const url = value.replace(/\/+$/, '');
//   return url.endsWith('/api/v1') ? url : `${url}/api/v1`;
// };

// const API_BASE_URL = normalizeBaseUrl(
//   process.env.API_BASE_URL || 'http://localhost:3000',
// );

// const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
// const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// const CUSTOMER_ID = Number(process.env.CUSTOMER_ID || 7860);
// const DRIVER_ID = Number(process.env.DRIVER_ID || 3216);
// const COUNTRY_ID = Number(process.env.COUNTRY_ID || 3);
// const CITY_ID = process.env.CITY_ID ? Number(process.env.CITY_ID) : null;
// const VEHICLE_CLASS_ID = process.env.VEHICLE_CLASS_ID
//   ? Number(process.env.VEHICLE_CLASS_ID)
//   : null;

// const BOOKING_COUNT = Number(process.env.BOOKING_COUNT || 3);
// const SERVICE_CODE = process.env.SERVICE_CODE || 'CHAUFFEUR';

// const PASSENGER_NAME = process.env.PASSENGER_NAME || 'jitendra';
// const PASSENGER_EMAIL =
//   process.env.PASSENGER_EMAIL || 'jitendra@gmail.com';
// const PASSENGER_PHONE = process.env.PASSENGER_PHONE||
// '9876541230';

// const PICKUP_ADDRESS =
//   process.env.PICKUP_ADDRESS || 'Demo Pickup Location';
// const DROPOFF_ADDRESS =
//   process.env.DROPOFF_ADDRESS || 'Demo Drop-off Location';
// const CITY_NAME = process.env.CITY_NAME || 'Geneva';

// if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
//   throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD are required');
// }

// if (!PASSENGER_PHONE) {
//   throw new Error('PASSENGER_PHONE is required');
// }

// if (!Number.isInteger(CUSTOMER_ID) || CUSTOMER_ID <= 0) {
//   throw new Error('CUSTOMER_ID must be a valid positive integer');
// }

// if (!Number.isInteger(DRIVER_ID) || DRIVER_ID <= 0) {
//   throw new Error('DRIVER_ID must be a valid positive integer');
// }

// let accessToken;

// const request = async (
//   path,
//   {
//     method = 'GET',
//     body,
//     authenticated = true,
//     headers = {},
//   } = {},
// ) => {
//   const response = await fetch(`${API_BASE_URL}${path}`, {
//     method,
//     headers: {
//       Accept: 'application/json',
//       ...(body ? { 'Content-Type': 'application/json' } : {}),
//       ...(authenticated && accessToken
//         ? { Authorization: `Bearer ${accessToken}` }
//         : {}),
//       ...headers,
//     },
//     ...(body ? { body: JSON.stringify(body) } : {}),
//   });

//   const responseText = await response.text();

//   let data = null;

//   if (responseText) {
//     try {
//       data = JSON.parse(responseText);
//     } catch {
//       data = responseText;
//     }
//   }

//   if (!response.ok) {
//     const message =
//       data?.error?.message ||
//       data?.message ||
//       `${method} ${path} failed with HTTP ${response.status}`;

//     throw new Error(message);
//   }

//   return data;
// };

// const loginAsAdmin = async () => {
//   const result = await request('/auth/login', {
//     method: 'POST',
//     authenticated: false,
//     body: {
//       email: ADMIN_EMAIL,
//       password: ADMIN_PASSWORD,
//       device: {
//         deviceId: `demo-seed-${crypto.randomUUID()}`,
//         platform: 'WEB',
//         appVersion: '1.0.0',
//       },
//     },
//   });

//   if (result.user?.roleName !== 'ADMIN' && result.user?.roleName !== 'STAFF') {
//     throw new Error(
//       `ADMIN or STAFF account required. Received: ${result.user?.roleName}`,
//     );
//   }

//   accessToken = result.tokens.accessToken;

//   console.log(`Logged in as ${result.user.email}`);
// };

// const createSchedule = (dayOffset) => {
//   const start = new Date();

//   start.setUTCDate(start.getUTCDate() + dayOffset);
//   start.setUTCHours(10, 0, 0, 0);

//   const end = new Date(start);
//   end.setUTCHours(end.getUTCHours() + 4);

//   return {
//     startAt: start.toISOString(),
//     endAt: end.toISOString(),
//   };
// };

// const findVehicleClass = async ({ startAt, endAt }) => {
//   if (VEHICLE_CLASS_ID) {
//     return VEHICLE_CLASS_ID;
//   }

//   const params = new URLSearchParams({
//     serviceCode: SERVICE_CODE,
//     countryId: String(COUNTRY_ID),
//     passengerCount: '1',
//     startAt,
//     endAt,
//   });

//   if (CITY_ID) {
//     params.set('cityId', String(CITY_ID));
//   }

//   const result = await request(
//     `/catalog/vehicle-classes?${params.toString()}`,
//   );

//   if (!result.items?.length) {
//     throw new Error(
//       `No available vehicle class for ${startAt}. Check country, city, dates, vehicle status and pricing.`,
//     );
//   }

//   console.log(
//     `Using vehicle class ${result.items[0].id}: ${result.items[0].title}`,
//   );

//   return result.items[0].id;
// };

// const createOneBooking = async (bookingNumber) => {
//   // Start with tomorrow, then the following days.
//   const schedule = createSchedule(bookingNumber);
//   const vehicleClassId = await findVehicleClass(schedule);

//   console.log(
//     `Creating booking ${bookingNumber}/${BOOKING_COUNT} for ${schedule.startAt}`,
//   );

//   // 1. Create booking draft for customer 7860.
//   const draft = await request('/bookings/drafts', {
//     method: 'POST',
//     body: {
//       serviceCode: SERVICE_CODE,
//       customerId: CUSTOMER_ID,
//     },
//   });

//   // 2. Save passenger, journey and selected vehicle class.
//   await request(`/bookings/drafts/${draft.id}/details`, {
//     method: 'PUT',
//     body: {
//       vehicleClassId,
//       passenger: {
//         fullName: PASSENGER_NAME,
//         email: PASSENGER_EMAIL,
//         phone: PASSENGER_PHONE,
//         count: 1,
//         luggageCount: 1,
//       },
//       legs: [
//         {
//           startAt: schedule.startAt,
//           endAt: schedule.endAt,
//           pickup: {
//             address: PICKUP_ADDRESS,
//             countryId: COUNTRY_ID,
//             ...(CITY_ID ? { cityId: CITY_ID } : {}),
//             city: CITY_NAME,
//           },
//           dropoff: {
//             address: DROPOFF_ADDRESS,
//             countryId: COUNTRY_ID,
//             ...(CITY_ID ? { cityId: CITY_ID } : {}),
//             city: CITY_NAME,
//           },
//           stops: [],
//           approximateDistanceKm: 20,
//           isHourly: true,
//           notes: `Demo chauffeur-app booking ${bookingNumber}`,
//         },
//       ],
//       options: [],
//       notes: `Demo booking ${bookingNumber} for chauffeur application testing`,
//     },
//   });

//   // 3. Generate the price quotation.
//   await request(`/bookings/drafts/${draft.id}/quote`, {
//     method: 'POST',
//   });

//   // 4. Checkout and create the actual reservation.
//   const checkout = await request(
//     `/bookings/drafts/${draft.id}/checkout`,
//     {
//       method: 'POST',
//       headers: {
//         'Idempotency-Key': `chauffeur-demo-${draft.id}-${crypto.randomUUID()}`,
//       },
//     },
//   );

//   // 5. Mark the mock payment as paid.
//   await request(`/payments/${checkout.payment.id}/mock-confirm`, {
//     method: 'POST',
//   });

//   // 6. Confirm the paid booking as Operations.
//   await request(`/operations/bookings/${checkout.bookingId}/decision`, {
//     method: 'POST',
//     body: {
//       decision: 'CONFIRM',
//       note: 'Automatically confirmed for chauffeur-app testing',
//     },
//   });

//   // 7. Read the booking to obtain its reservation detail/leg ID.
//   const booking = await request(`/bookings/${checkout.bookingId}`);

//   if (!booking.legs?.length) {
//     throw new Error(
//       `Booking ${checkout.bookingId} does not contain a reservation leg`,
//     );
//   }

//   const detailId = booking.legs[0].id;

//   // 8. Assign chauffeur 3216.
//   const assignment = await request(
//     `/operations/bookings/${checkout.bookingId}/legs/${detailId}/assign-chauffeur`,
//     {
//       method: 'POST',
//       body: {
//         driverId: DRIVER_ID,
//         scheduledStartAt: schedule.startAt,
//         scheduledEndAt: schedule.endAt,
//       },
//     },
//   );

//   return {
//     bookingId: checkout.bookingId,
//     reservationNo: checkout.reservationNo,
//     draftId: draft.id,
//     paymentId: checkout.payment.id,
//     detailId,
//     assignmentId: assignment.id,
//     assignmentStatus: assignment.status,
//     scheduledStartAt: schedule.startAt,
//     scheduledEndAt: schedule.endAt,
//   };
// };

// const main = async () => {
//   await loginAsAdmin();

//   const createdBookings = [];

//   for (let bookingNumber = 1; bookingNumber <= BOOKING_COUNT; bookingNumber += 1) {
//     const booking = await createOneBooking(bookingNumber);
//     createdBookings.push(booking);
//   }

//   console.log('\nDemo bookings created successfully:');
//   console.table(createdBookings);
// };

// main().catch((error) => {
//   console.error('\nDemo booking creation failed:');
//   console.error(error.message);
//   process.exitCode = 1;
// });









import crypto from 'node:crypto';
import { URLSearchParams } from 'node:url';
import { env } from '../src/config/env.js';
import { pool, query } from '../src/db/pool.js';

/*
 * Creates 10 paid, confirmed chauffeur bookings today.
 * The non-overlapping slots run from 12:10 UTC through 23:00 UTC.
 *
 * This script does not call:
 * GET /operations/chauffeurs/available
 *
 * It checks app_driver_assignments directly.
 */

const API_BASE_URL = normalizeApiBase(
  process.env.API_BASE_URL ??
    'http://localhost:3000',
);

const ADMIN_EMAIL =
  process.env.ADMIN_EMAIL ??
  'admin@test.local';

const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD ??
  'AdminTest#2026';

const CUSTOMER_ID = positiveInteger(
  'CUSTOMER_ID',
  process.env.CUSTOMER_ID ?? '7860',
);

const DRIVER_ID = positiveInteger(
  'DRIVER_ID',
  process.env.DRIVER_ID ?? '3216',
);

const COUNTRY_ID = positiveInteger(
  'COUNTRY_ID',
  process.env.COUNTRY_ID ?? '3',
);

const CITY_ID = positiveInteger(
  'CITY_ID',
  process.env.CITY_ID ?? '24',
);

const CITY_NAME =
  process.env.CITY_NAME ?? 'Geneva';

const VEHICLE_CLASS_ID =
  optionalPositiveInteger(
    'VEHICLE_CLASS_ID',
    process.env.VEHICLE_CLASS_ID,
  );

/*
 * Stores the latest admin token.
 *
 * If the token expires during booking creation,
 * the API helper logs in again and retries once.
 */
let activeAdminAccessToken = null;

/*
 * Ten consecutive non-overlapping bookings.
 *
 * All times are UTC.
 * Total period: 12:10 PM until 11:00 PM.
 */
const DAILY_SLOTS = [
  {
    label: 'Trip 1',
    startHour: 12,
    startMinute: 10,
    endHour: 13,
    endMinute: 15,
  },
  {
    label: 'Trip 2',
    startHour: 13,
    startMinute: 15,
    endHour: 14,
    endMinute: 20,
  },
  {
    label: 'Trip 3',
    startHour: 14,
    startMinute: 20,
    endHour: 15,
    endMinute: 25,
  },
  {
    label: 'Trip 4',
    startHour: 15,
    startMinute: 25,
    endHour: 16,
    endMinute: 30,
  },
  {
    label: 'Trip 5',
    startHour: 16,
    startMinute: 30,
    endHour: 17,
    endMinute: 35,
  },
  {
    label: 'Trip 6',
    startHour: 17,
    startMinute: 35,
    endHour: 18,
    endMinute: 40,
  },
  {
    label: 'Trip 7',
    startHour: 18,
    startMinute: 40,
    endHour: 19,
    endMinute: 45,
  },
  {
    label: 'Trip 8',
    startHour: 19,
    startMinute: 45,
    endHour: 20,
    endMinute: 50,
  },
  {
    label: 'Trip 9',
    startHour: 20,
    startMinute: 50,
    endHour: 21,
    endMinute: 55,
  },
  {
    label: 'Trip 10',
    startHour: 21,
    startMinute: 55,
    endHour: 23,
    endMinute: 0,
  },
];

const BOOKING_DATA = [
  {
    passengerName: 'Emma Wilson',
    phone: '+41790001001',
    pickup:
      'Geneva Airport, Route de l’Aéroport 21',
    dropoff:
      'Hotel President Wilson, Quai Wilson 47',
    distanceKm: 8,
  },
  {
    passengerName: 'Liam Martin',
    phone: '+41790001002',
    pickup:
      'Gare Cornavin, Place de Cornavin 7',
    dropoff:
      'Palais des Nations, Avenue de la Paix 14',
    distanceKm: 5,
  },
  {
    passengerName: 'Olivia Brown',
    phone: '+41790001003',
    pickup:
      'Mandarin Oriental Geneva, Quai Turrettini 1',
    dropoff:
      'Geneva Airport, Route de l’Aéroport 21',
    distanceKm: 7,
  },
  {
    passengerName: 'Noah Garcia',
    phone: '+41790001004',
    pickup:
      'Four Seasons Hotel des Bergues, Quai des Bergues 33',
    dropoff:
      'CERN, Esplanade des Particules 1',
    distanceKm: 10,
  },
  {
    passengerName: 'Sophia Taylor',
    phone: '+41790001005',
    pickup:
      'The Ritz-Carlton Hotel de la Paix, Quai du Mont-Blanc 11',
    dropoff:
      'Carouge Market, Place du Marché',
    distanceKm: 6,
  },
  {
    passengerName: 'Ethan Anderson',
    phone: '+41790001006',
    pickup:
      'InterContinental Geneva, Chemin du Petit-Saconnex 7-9',
    dropoff:
      'Jet d’Eau, Quai Gustave-Ador',
    distanceKm: 6,
  },
  {
    passengerName: 'Isabella Thomas',
    phone: '+41790001007',
    pickup:
      'Geneva Marriott Hotel, Chemin du Ruisseau 1',
    dropoff:
      'Patek Philippe Museum, Rue des Vieux-Grenadiers 7',
    distanceKm: 7,
  },
  {
    passengerName: 'Lucas Moore',
    phone: '+41790001008',
    pickup:
      'Beau-Rivage Genève, Quai du Mont-Blanc 13',
    dropoff:
      'United Nations Office at Geneva, Avenue de la Paix 8-14',
    distanceKm: 4,
  },
  {
    passengerName: 'Mia Jackson',
    phone: '+41790001009',
    pickup:
      'Hôtel Métropole Genève, Quai du Général-Guisan 34',
    dropoff:
      'Geneva Airport, Route de l’Aéroport 21',
    distanceKm: 8,
  },
  {
    passengerName: 'James White',
    phone: '+41790001010',
    pickup:
      'Parc des Eaux-Vives, Quai Gustave-Ador 82',
    dropoff:
      'Gare Cornavin, Place de Cornavin 7',
    distanceKm: 5,
  },
];

function normalizeApiBase(value) {
  const withoutTrailingSlash = String(
    value,
  )
    .trim()
    .replace(/\/+$/, '');

  return withoutTrailingSlash.endsWith(
    '/api/v1',
  )
    ? withoutTrailingSlash
    : `${withoutTrailingSlash}/api/v1`;
}

function positiveInteger(name, value) {
  const parsed = Number(value);

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    throw new Error(
      `${name} must be a positive integer; ` +
        `received ${JSON.stringify(value)}`,
    );
  }

  return parsed;
}

function optionalPositiveInteger(
  name,
  value,
) {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ''
  ) {
    return null;
  }

  return positiveInteger(name, value);
}

/*
 * Create a date for today in UTC.
 *
 * dayOffset:
 * 0 = today
 * 1 = tomorrow
 */
function utcDateAtOffset(
  dayOffset,
  hour,
  minute = 0,
) {
  const value = new Date();

  value.setUTCHours(0, 0, 0, 0);

  value.setUTCDate(
    value.getUTCDate() + dayOffset,
  );

  value.setUTCHours(
    hour,
    minute,
    0,
    0,
  );

  return value;
}

function mysqlDateTime(isoValue) {
  return isoValue
    .slice(0, 19)
    .replace('T', ' ');
}

function errorMessage(payload, status) {
  return (
    payload?.error?.message ??
    payload?.message ??
    (typeof payload === 'string'
      ? payload
      : null) ??
    `HTTP ${status}`
  );
}

/*
 * Generic API request helper.
 *
 * When TOKEN_INVALID is returned:
 * 1. Log in again.
 * 2. Receive a fresh token.
 * 3. Retry the failed API once.
 */
async function api(
  path,
  {
    method = 'GET',
    token,
    body,
    headers = {},
    retryAuth = true,
  } = {},
) {
  const effectiveToken = token
    ? activeAdminAccessToken ?? token
    : null;

  const response = await fetch(
    `${API_BASE_URL}${path}`,
    {
      method,

      headers: {
        Accept: 'application/json',

        ...(body === undefined
          ? {}
          : {
              'Content-Type':
                'application/json',
            }),

        ...(effectiveToken
          ? {
              Authorization:
                `Bearer ${effectiveToken}`,
            }
          : {}),

        ...headers,
      },

      ...(body === undefined
        ? {}
        : {
            body: JSON.stringify(body),
          }),
    },
  );

  const responseText =
    await response.text();

  let payload = null;

  if (responseText) {
    try {
      payload =
        JSON.parse(responseText);
    } catch {
      payload = responseText;
    }
  }

  /*
   * Retry one time after getting
   * TOKEN_INVALID.
   */
  if (
    response.status === 401 &&
    payload?.error?.code ===
      'TOKEN_INVALID' &&
    effectiveToken &&
    retryAuth
  ) {
    console.warn(
      `Access token rejected during ` +
        `${method} ${path}; ` +
        'logging in and retrying once',
    );

    activeAdminAccessToken = null;

    const freshToken =
      await loginAdmin();

    return api(path, {
      method,
      token: freshToken,
      body,
      headers,
      retryAuth: false,
    });
  }

  if (!response.ok) {
    const error = new Error(
      `${method} ${path} failed: ` +
        errorMessage(
          payload,
          response.status,
        ),
    );

    error.status = response.status;
    error.payload = payload;

    throw error;
  }

  return payload;
}

/*
 * Login using an ADMIN or STAFF account.
 */
async function loginAdmin() {
  const result = await api(
    '/auth/login',
    {
      method: 'POST',

      body: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,

        device: {
          deviceId:
            `demo-booking-seeder-` +
            crypto.randomUUID(),

          platform: 'WEB',
          appVersion: '1.0.0',
        },
      },
    },
  );

  const role =
    Number(result?.user?.role);

  if (![1, 2].includes(role)) {
    throw new Error(
      `ADMIN_EMAIL must belong to ` +
        `ADMIN (1) or STAFF (2). ` +
        `Received role: ${role}`,
    );
  }

  const accessToken =
    result?.tokens?.accessToken;

  if (!accessToken) {
    throw new Error(
      'Admin login did not return an access token',
    );
  }

  activeAdminAccessToken =
    accessToken;

  return activeAdminAccessToken;
}

/*
 * Verify the customer and chauffeur records.
 */
async function assertSeedEntitiesExist() {
  const customers = await query(
    `
      SELECT
        id,
        full_name AS fullName
      FROM customers
      WHERE id = ?
        AND deleted_at IS NULL
      LIMIT 1
    `,
    [CUSTOMER_ID],
  );

  if (!customers[0]) {
    throw new Error(
      `Customer ${CUSTOMER_ID} was not found`,
    );
  }

  const drivers = await query(
    `
      SELECT
        d.id,
        d.full_name AS fullName,
        d.user_id AS userId
      FROM drivers d
      JOIN users u
        ON u.id = d.user_id
      WHERE d.id = ?
        AND d.deleted_at IS NULL
        AND u.deleted_at IS NULL
        AND u.role = 3
      LIMIT 1
    `,
    [DRIVER_ID],
  );

  if (!drivers[0]) {
    throw new Error(
      `Chauffeur/driver ${DRIVER_ID} ` +
        'was not found',
    );
  }

  console.log(
    `Customer: ${customers[0].fullName} ` +
      `(${customers[0].id})`,
  );

  console.log(
    `Chauffeur: ${drivers[0].fullName} ` +
      `(driver ${drivers[0].id}, ` +
      `user ${drivers[0].userId})`,
  );
}

/*
 * Check whether the chauffeur has an
 * overlapping active assignment.
 */
async function driverHasConflict(
  startAt,
  endAt,
) {
  const rows = await query(
    `
      SELECT
        id,
        status,
        scheduled_start_at AS scheduledStartAt,
        scheduled_end_at AS scheduledEndAt
      FROM app_driver_assignments
      WHERE driver_id = ?
        AND status NOT IN (
          'DECLINED',
          'COMPLETED',
          'NO_SHOW',
          'CANCELLED'
        )
        AND scheduled_start_at < ?
        AND scheduled_end_at > ?
      LIMIT 1
    `,
    [
      DRIVER_ID,
      mysqlDateTime(endAt),
      mysqlDateTime(startAt),
    ],
  );

  return rows[0] ?? null;
}

/*
 * Find an available vehicle class.
 */
async function availableVehicleClass(
  startAt,
  endAt,
) {
  const search =
    new URLSearchParams({
      serviceCode: 'CHAUFFEUR',

      countryId:
        String(COUNTRY_ID),

      cityId:
        String(CITY_ID),

      passengerCount: '1',
      startAt,
      endAt,
    });

  const result = await api(
    `/catalog/vehicle-classes?` +
      search.toString(),
  );

  const classes =
    Array.isArray(result?.items)
      ? result.items
      : [];

  if (!classes.length) {
    return null;
  }

  /*
   * If no class was configured,
   * use the first available class.
   */
  if (!VEHICLE_CLASS_ID) {
    return classes[0];
  }

  return (
    classes.find(
      (item) =>
        Number(item.id) ===
        VEHICLE_CLASS_ID,
    ) ?? null
  );
}

/*
 * Validate all ten slots before creating
 * the first booking.
 */
async function findTenAvailableSlotsToday() {
  const slots = [];

  console.log(
    'Checking 10 booking slots today ' +
      'from 12:10–23:00 UTC',
  );

  for (const slot of DAILY_SLOTS) {
    /*
     * Zero means today.
     */
    const startAt = utcDateAtOffset(
      0,
      slot.startHour,
      slot.startMinute,
    ).toISOString();

    const endAt = utcDateAtOffset(
      0,
      slot.endHour,
      slot.endMinute,
    ).toISOString();

    /*
     * Do not create bookings in the past.
     */
    if (
      new Date(startAt) <= new Date()
    ) {
      throw new Error(
        `${slot.label} starts in the past: ` +
          `${startAt}`,
      );
    }

    /*
     * Check chauffeur availability.
     */
    const conflict =
      await driverHasConflict(
        startAt,
        endAt,
      );

    if (conflict) {
      throw new Error(
        `${slot.label} overlaps active ` +
          `assignment ${conflict.id}: ` +
          `${conflict.scheduledStartAt}–` +
          `${conflict.scheduledEndAt}`,
      );
    }

    /*
     * Check vehicle-class availability.
     */
    const vehicleClass =
      await availableVehicleClass(
        startAt,
        endAt,
      );

    if (!vehicleClass) {
      throw new Error(
        `${slot.label} has no available ` +
          `vehicle class: ` +
          `${startAt}–${endAt}`,
      );
    }

    slots.push({
      ...slot,
      startAt,
      endAt,

      vehicleClassId:
        Number(vehicleClass.id),
    });

    console.log(
      `Available ${slot.label}: ` +
        `${startAt}–${endAt}`,
    );
  }

  if (slots.length !== 10) {
    throw new Error(
      `Expected 10 slots but found ` +
        `${slots.length}`,
    );
  }

  return slots;
}

/*
 * Create, pay, confirm and assign
 * one chauffeur booking.
 */
async function createAndAssignBooking({
  token,
  bookingData,
  slot,
  bookingNumber,
}) {
  /*
   * Recheck immediately before creation.
   */
  const latestConflict =
    await driverHasConflict(
      slot.startAt,
      slot.endAt,
    );

  if (latestConflict) {
    throw new Error(
      `Slot became unavailable because ` +
        `assignment ${latestConflict.id} ` +
        `overlaps ${slot.startAt}–` +
        `${slot.endAt}`,
    );
  }

  /*
   * Step 1: Create booking draft.
   */
  const draft = await api(
    '/bookings/drafts',
    {
      method: 'POST',
      token,

      body: {
        serviceCode: 'CHAUFFEUR',
        customerId: CUSTOMER_ID,
      },
    },
  );

  if (!draft?.id) {
    throw new Error(
      'Draft creation did not return a draft ID',
    );
  }

  /*
   * Step 2: Save passenger and trip details.
   */
  await api(
    `/bookings/drafts/${draft.id}/details`,
    {
      method: 'PUT',
      token,

      body: {
        vehicleClassId:
          slot.vehicleClassId,

        passenger: {
          fullName:
            bookingData.passengerName,

          email:
            `demo.passenger${String(
              bookingNumber,
            ).padStart(2, '0')}` +
            '@example.com',

          phone: bookingData.phone,
          count: 1,

          luggageCount:
            bookingNumber % 3,
        },

        legs: [
          {
            startAt: slot.startAt,
            endAt: slot.endAt,

            pickup: {
              address:
                bookingData.pickup,

              countryId: COUNTRY_ID,
              cityId: CITY_ID,
              city: CITY_NAME,

              instructions:
                `Demo booking ${bookingNumber}: ` +
                'meet passenger at the main entrance',
            },

            dropoff: {
              address:
                bookingData.dropoff,

              countryId: COUNTRY_ID,
              cityId: CITY_ID,
              city: CITY_NAME,
            },

            stops: [],

            approximateDistanceKm:
              bookingData.distanceKm,

            isHourly: true,

            notes:
              `Chauffeur app demo trip ` +
              `${bookingNumber}`,
          },
        ],

        options: [],

        notes:
          `Generated demo booking ` +
          `${bookingNumber} for ` +
          `chauffeur ${DRIVER_ID}`,
      },
    },
  );

  /*
   * Step 3: Create quote.
   */
  await api(
    `/bookings/drafts/${draft.id}/quote`,
    {
      method: 'POST',
      token,
    },
  );

  /*
   * Step 4: Checkout.
   */
  const checkout = await api(
    `/bookings/drafts/${draft.id}/checkout`,
    {
      method: 'POST',
      token,

      headers: {
        'Idempotency-Key':
          `chauffeur-demo-` +
          crypto.randomUUID(),
      },
    },
  );

  const bookingId =
    checkout?.bookingId;

  const paymentId =
    checkout?.payment?.id;

  if (!bookingId) {
    throw new Error(
      'Checkout did not return a booking ID',
    );
  }

  if (!paymentId) {
    throw new Error(
      `Checkout for booking ${bookingId} ` +
        'did not return a payment ID',
    );
  }

  /*
   * Step 5: Confirm mock payment.
   */
  await api(
    `/payments/${paymentId}/mock-confirm`,
    {
      method: 'POST',
      token,
    },
  );

  /*
   * Step 6: Confirm booking.
   */
  await api(
    `/operations/bookings/${bookingId}/decision`,
    {
      method: 'POST',
      token,

      body: {
        decision: 'CONFIRM',

        note:
          `Demo booking ${bookingNumber} ` +
          'automatically confirmed',
      },
    },
  );

  /*
   * Step 7: Get reservation leg ID.
   */
  const booking = await api(
    `/bookings/${bookingId}`,
    {
      token,
    },
  );

  const detailId = Number(
    booking?.legs?.[0]?.id,
  );

  if (!detailId) {
    throw new Error(
      `Booking ${bookingId} did not ` +
        'return a reservation leg ID',
    );
  }

  /*
   * Step 8: Final conflict check.
   */
  const finalConflict =
    await driverHasConflict(
      slot.startAt,
      slot.endAt,
    );

  if (finalConflict) {
    throw new Error(
      `Cannot assign booking ${bookingId}. ` +
        `Assignment ${finalConflict.id} ` +
        'now overlaps the booking period.',
    );
  }

  /*
   * Step 9: Assign chauffeur.
   */
  const assignment = await api(
    `/operations/bookings/${bookingId}` +
      `/legs/${detailId}` +
      '/assign-chauffeur',
    {
      method: 'POST',
      token,

      body: {
        driverId: DRIVER_ID,

        scheduledStartAt:
          slot.startAt,

        scheduledEndAt:
          slot.endAt,
      },
    },
  );

  if (!assignment?.id) {
    throw new Error(
      `Assignment for booking ${bookingId} ` +
        'did not return an assignment ID',
    );
  }

  return {
    bookingNumber,
    bookingId,

    reservationNo:
      checkout.reservationNo,

    detailId,

    assignmentId:
      assignment.id,

    assignmentStatus:
      assignment.status ?? 'OFFERED',

    passengerName:
      bookingData.passengerName,

    slot: slot.label,
    startAt: slot.startAt,
    endAt: slot.endAt,
  };
}

async function main() {
  if (
    env.PAYMENT_PROVIDER !== 'mock'
  ) {
    throw new Error(
      'This demo generator requires ' +
        'PAYMENT_PROVIDER=mock because it ' +
        'automatically confirms payment. ' +
        'Set PAYMENT_PROVIDER=mock and ' +
        'NODE_ENV=development, then restart ' +
        'the backend.',
    );
  }

  if (
    env.NODE_ENV === 'production'
  ) {
    throw new Error(
      'Do not run this generator with ' +
        'NODE_ENV=production',
    );
  }

  console.log(
    '------------------------------------------',
  );

  console.log(
    'Drive Luxury Chauffeur Demo Booking Seeder',
  );

  console.log(
    '------------------------------------------',
  );

  console.log(
    `API: ${API_BASE_URL}`,
  );

  console.log(
    `Customer ID: ${CUSTOMER_ID}`,
  );

  console.log(
    `Driver ID: ${DRIVER_ID}`,
  );

  /*
   * Verify customer and chauffeur.
   */
  await assertSeedEntitiesExist();

  /*
   * Validate all ten booking slots.
   */
  const plannedSlots =
    await findTenAvailableSlotsToday();

  console.log(
    '\nCreating 10 bookings today ' +
      'from 12:10–23:00 UTC...\n',
  );

  const created = [];

  for (
    const [index, slot]
    of plannedSlots.entries()
  ) {
    const bookingNumber =
      index + 1;

    try {
      /*
       * Get a fresh token before creating
       * every booking.
       */
      const token =
        await loginAdmin();

      const result =
        await createAndAssignBooking({
          token,

          bookingData:
            BOOKING_DATA[index],

          slot,
          bookingNumber,
        });

      created.push(result);

      console.log(
        `Booking ${bookingNumber}/10 created: ` +
          `${result.reservationNo} | ` +
          `${result.passengerName} | ` +
          `${result.slot} | ` +
          `${result.startAt} | ` +
          `assignment ${result.assignmentId}`,
      );
    } catch (error) {
      console.error(
        `\nBooking ${bookingNumber} failed: ` +
          `${error.message}`,
      );

      if (error.payload) {
        console.error(
          JSON.stringify(
            error.payload,
            null,
            2,
          ),
        );
      }

      throw error;
    }
  }

  console.log(
    '\nAll 10 demo bookings were ' +
      'created successfully.',
  );

  console.table(created);

  console.log(
    '\nAssignments remain in OFFERED status.',
  );

  console.log(
    'Log in as Ravi in the chauffeur app ' +
      'and acknowledge each trip.',
  );
}

main()
  .catch((error) => {
    console.error(
      `\nDemo generation failed:\n` +
        `${error.message}`,
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });