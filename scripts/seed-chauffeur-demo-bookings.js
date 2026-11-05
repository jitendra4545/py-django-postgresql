import crypto from 'node:crypto';
import { URLSearchParams } from 'node:url';
import { env } from '../src/config/env.js';
import { pool, query } from '../src/db/pool.js';

/*
 * Creates 10 paid, confirmed chauffeur bookings today and assigns them to one driver.
 * The non-overlapping slots run from 12:10 UTC through 23:00 UTC.
 *
 * This version intentionally DOES NOT call:
 *   GET /operations/chauffeurs/available
 *
 * Older backend packages do not expose that route. Instead, it checks
 * app_driver_assignments directly before creating any booking.
 *
 * Required .env values:
 *   API_BASE_URL=http://localhost:3000
 *   ADMIN_EMAIL=admin@test.local
 *   ADMIN_PASSWORD=AdminTest#2026
 *   CUSTOMER_ID=7860
 *   DRIVER_ID=3216
 *   COUNTRY_ID=3
 *   CITY_ID=24
 *   CITY_NAME=Geneva
 *   NODE_ENV=development
 *   PAYMENT_PROVIDER=mock
 *
 * Optional:
 *   VEHICLE_CLASS_ID=                 # blank = choose first available class
 */

const API_BASE_URL = normalizeApiBase(process.env.API_BASE_URL ?? 'http://localhost:3000');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@test.local';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'AdminTest#2026';
const CUSTOMER_ID = positiveInteger('CUSTOMER_ID', process.env.CUSTOMER_ID ?? '7860');
const DRIVER_ID = positiveInteger('DRIVER_ID', process.env.DRIVER_ID ?? '3216');
const COUNTRY_ID = positiveInteger('COUNTRY_ID', process.env.COUNTRY_ID ?? '3');
const CITY_ID = positiveInteger('CITY_ID', process.env.CITY_ID ?? '24');
const CITY_NAME = process.env.CITY_NAME ?? 'Geneva';
const VEHICLE_CLASS_ID = optionalPositiveInteger('VEHICLE_CLASS_ID', process.env.VEHICLE_CLASS_ID);
let activeAdminAccessToken = null;

const DAILY_SLOTS = [
  { label: 'Trip 1', startHour: 12, startMinute: 10, endHour: 13, endMinute: 15 },
  { label: 'Trip 2', startHour: 13, startMinute: 15, endHour: 14, endMinute: 20 },
  { label: 'Trip 3', startHour: 14, startMinute: 20, endHour: 15, endMinute: 25 },
  { label: 'Trip 4', startHour: 15, startMinute: 25, endHour: 16, endMinute: 30 },
  { label: 'Trip 5', startHour: 16, startMinute: 30, endHour: 17, endMinute: 35 },
  { label: 'Trip 6', startHour: 17, startMinute: 35, endHour: 18, endMinute: 40 },
  { label: 'Trip 7', startHour: 18, startMinute: 40, endHour: 19, endMinute: 45 },
  { label: 'Trip 8', startHour: 19, startMinute: 45, endHour: 20, endMinute: 50 },
  { label: 'Trip 9', startHour: 20, startMinute: 50, endHour: 21, endMinute: 55 },
  { label: 'Trip 10', startHour: 21, startMinute: 55, endHour: 23, endMinute: 0 },
];

const BOOKING_DATA = [
  {
    passengerName: 'Emma Wilson',
    phone: '+41790001001',
    pickup: 'Geneva Airport, Route de l’Aéroport 21',
    dropoff: 'Hotel President Wilson, Quai Wilson 47',
    distanceKm: 8,
  },
  {
    passengerName: 'Liam Martin',
    phone: '+41790001002',
    pickup: 'Gare Cornavin, Place de Cornavin 7',
    dropoff: 'Palais des Nations, Avenue de la Paix 14',
    distanceKm: 5,
  },
  {
    passengerName: 'Olivia Brown',
    phone: '+41790001003',
    pickup: 'Mandarin Oriental Geneva, Quai Turrettini 1',
    dropoff: 'Geneva Airport, Route de l’Aéroport 21',
    distanceKm: 7,
  },
  {
    passengerName: 'Noah Garcia',
    phone: '+41790001004',
    pickup: 'Four Seasons Hotel des Bergues, Quai des Bergues 33',
    dropoff: 'CERN, Esplanade des Particules 1',
    distanceKm: 10,
  },
  {
    passengerName: 'Sophia Taylor',
    phone: '+41790001005',
    pickup: 'The Ritz-Carlton Hotel de la Paix, Quai du Mont-Blanc 11',
    dropoff: 'Carouge Market, Place du Marché',
    distanceKm: 6,
  },
  {
    passengerName: 'Ethan Anderson',
    phone: '+41790001006',
    pickup: 'InterContinental Geneva, Chemin du Petit-Saconnex 7-9',
    dropoff: 'Jet d’Eau, Quai Gustave-Ador',
    distanceKm: 6,
  },
  {
    passengerName: 'Isabella Thomas',
    phone: '+41790001007',
    pickup: 'Geneva Marriott Hotel, Chemin du Ruisseau 1',
    dropoff: 'Patek Philippe Museum, Rue des Vieux-Grenadiers 7',
    distanceKm: 7,
  },
  {
    passengerName: 'Lucas Moore',
    phone: '+41790001008',
    pickup: 'Beau-Rivage Genève, Quai du Mont-Blanc 13',
    dropoff: 'United Nations Office at Geneva, Avenue de la Paix 8-14',
    distanceKm: 4,
  },
  {
    passengerName: 'Mia Jackson',
    phone: '+41790001009',
    pickup: 'Hôtel Métropole Genève, Quai du Général-Guisan 34',
    dropoff: 'Geneva Airport, Route de l’Aéroport 21',
    distanceKm: 8,
  },
  {
    passengerName: 'James White',
    phone: '+41790001010',
    pickup: 'Parc des Eaux-Vives, Quai Gustave-Ador 82',
    dropoff: 'Gare Cornavin, Place de Cornavin 7',
    distanceKm: 5,
  },
];

function normalizeApiBase(value) {
  const withoutTrailingSlash = String(value).trim().replace(/\/+$/, '');
  return withoutTrailingSlash.endsWith('/api/v1')
    ? withoutTrailingSlash
    : `${withoutTrailingSlash}/api/v1`;
}

function positiveInteger(name, value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer; received ${JSON.stringify(value)}`);
  }
  return parsed;
}

function optionalPositiveInteger(name, value) {
  if (value === undefined || value === null || String(value).trim() === '') return null;
  return positiveInteger(name, value);
}

function utcDateAtOffset(dayOffset, hour, minute = 0) {
  const value = new Date();
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + dayOffset);
  value.setUTCHours(hour, minute, 0, 0);
  return value;
}

function mysqlDateTime(isoValue) {
  return isoValue.slice(0, 19).replace('T', ' ');
}

function errorMessage(payload, status) {
  return (
    payload?.error?.message ??
    payload?.message ??
    (typeof payload === 'string' ? payload : null) ??
    `HTTP ${status}`
  );
}

async function api(path, { method = 'GET', token, body, headers = {}, retryAuth = true } = {}) {
  const effectiveToken = token ? (activeAdminAccessToken ?? token) : null;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {}),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    if (
      response.status === 401 &&
      payload?.error?.code === 'TOKEN_INVALID' &&
      effectiveToken &&
      retryAuth
    ) {
      console.warn(`Access token rejected during ${method} ${path}; logging in and retrying once`);
      activeAdminAccessToken = null;
      const freshToken = await loginAdmin();
      return api(path, {
        method,
        token: freshToken,
        body,
        headers,
        retryAuth: false,
      });
    }

    const error = new Error(`${method} ${path} failed: ${errorMessage(payload, response.status)}`);
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function loginAdmin() {
  const result = await api('/auth/login', {
    method: 'POST',
    body: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      device: {
        deviceId: `demo-booking-seeder-${crypto.randomUUID()}`,
        platform: 'WEB',
        appVersion: '1.0.0',
      },
    },
  });

  if (![1, 2].includes(Number(result?.user?.role))) {
    throw new Error(
      `ADMIN_EMAIL must belong to ADMIN (1) or STAFF (2); received role ${result?.user?.role}`,
    );
  }

  activeAdminAccessToken = result.tokens.accessToken;
  return activeAdminAccessToken;
}

async function assertSeedEntitiesExist() {
  const customers = await query(
    'SELECT id, full_name AS fullName FROM customers WHERE id=? AND deleted_at IS NULL LIMIT 1',
    [CUSTOMER_ID],
  );
  if (!customers[0]) throw new Error(`Customer ${CUSTOMER_ID} was not found`);

  const drivers = await query(
    `SELECT d.id, d.full_name AS fullName, d.user_id AS userId
       FROM drivers d
       JOIN users u ON u.id=d.user_id
      WHERE d.id=? AND d.deleted_at IS NULL AND u.deleted_at IS NULL AND u.role=3
      LIMIT 1`,
    [DRIVER_ID],
  );
  if (!drivers[0]) throw new Error(`Chauffeur/driver ${DRIVER_ID} was not found`);

  console.log(`Customer: ${customers[0].fullName} (${customers[0].id})`);
  console.log(
    `Chauffeur: ${drivers[0].fullName} (driver ${drivers[0].id}, user ${drivers[0].userId})`,
  );
}

async function driverHasConflict(startAt, endAt) {
  const rows = await query(
    `SELECT id, status, scheduled_start_at AS scheduledStartAt,
            scheduled_end_at AS scheduledEndAt
       FROM app_driver_assignments
      WHERE driver_id=?
        AND status NOT IN ('DECLINED','COMPLETED','NO_SHOW','CANCELLED')
        AND scheduled_start_at < ?
        AND scheduled_end_at > ?
      LIMIT 1`,
    [DRIVER_ID, mysqlDateTime(endAt), mysqlDateTime(startAt)],
  );
  return rows[0] ?? null;
}

async function availableVehicleClass(startAt, endAt) {
  const search = new URLSearchParams({
    serviceCode: 'CHAUFFEUR',
    countryId: String(COUNTRY_ID),
    cityId: String(CITY_ID),
    passengerCount: '1',
    startAt,
    endAt,
  });
  const result = await api(`/catalog/vehicle-classes?${search.toString()}`);
  const classes = Array.isArray(result?.items) ? result.items : [];
  if (!classes.length) return null;
  if (!VEHICLE_CLASS_ID) return classes[0];
  return classes.find((item) => Number(item.id) === VEHICLE_CLASS_ID) ?? null;
}

async function findTenAvailableSlotsToday() {
  const slots = [];

  console.log('Checking 10 booking slots today from 12:10–23:00 UTC');

  for (const slot of DAILY_SLOTS) {
    const startAt = utcDateAtOffset(0, slot.startHour, slot.startMinute).toISOString();
    const endAt = utcDateAtOffset(0, slot.endHour, slot.endMinute).toISOString();

    if (new Date(startAt) <= new Date()) {
      throw new Error(`${slot.label} starts in the past: ${startAt}`);
    }

    const conflict = await driverHasConflict(startAt, endAt);
    if (conflict) {
      throw new Error(
        `${slot.label} overlaps active assignment ${conflict.id}: ` +
          `${conflict.scheduledStartAt}–${conflict.scheduledEndAt}`,
      );
    }

    const vehicleClass = await availableVehicleClass(startAt, endAt);
    if (!vehicleClass) {
      throw new Error(`${slot.label} has no available vehicle class: ${startAt}–${endAt}`);
    }

    slots.push({ ...slot, startAt, endAt, vehicleClassId: Number(vehicleClass.id) });
    console.log(`Available ${slot.label}: ${startAt}–${endAt}`);
  }

  return slots;
}

async function createAndAssignBooking({ token, bookingData, slot, bookingNumber }) {
  // Recheck immediately before creation in case another process assigned this chauffeur.
  const latestConflict = await driverHasConflict(slot.startAt, slot.endAt);
  if (latestConflict) {
    throw new Error(
      `Slot became unavailable because assignment ${latestConflict.id} overlaps ` +
        `${slot.startAt}–${slot.endAt}`,
    );
  }

  const draft = await api('/bookings/drafts', {
    method: 'POST',
    token,
    body: { serviceCode: 'CHAUFFEUR', customerId: CUSTOMER_ID },
  });

  await api(`/bookings/drafts/${draft.id}/details`, {
    method: 'PUT',
    token,
    body: {
      vehicleClassId: slot.vehicleClassId,
      passenger: {
        fullName: bookingData.passengerName,
        email: `demo.passenger${String(bookingNumber).padStart(2, '0')}@example.com`,
        phone: bookingData.phone,
        count: 1,
        luggageCount: bookingNumber % 3,
      },
      legs: [
        {
          startAt: slot.startAt,
          endAt: slot.endAt,
          pickup: {
            address: bookingData.pickup,
            countryId: COUNTRY_ID,
            cityId: CITY_ID,
            city: CITY_NAME,
            instructions: `Demo booking ${bookingNumber}: meet passenger at the main entrance`,
          },
          dropoff: {
            address: bookingData.dropoff,
            countryId: COUNTRY_ID,
            cityId: CITY_ID,
            city: CITY_NAME,
          },
          stops: [],
          approximateDistanceKm: bookingData.distanceKm,
          isHourly: true,
          notes: `Chauffeur app demo trip ${bookingNumber}`,
        },
      ],
      options: [],
      notes: `Generated demo booking ${bookingNumber} for chauffeur ${DRIVER_ID}`,
    },
  });

  await api(`/bookings/drafts/${draft.id}/quote`, { method: 'POST', token });

  const checkout = await api(`/bookings/drafts/${draft.id}/checkout`, {
    method: 'POST',
    token,
    headers: { 'Idempotency-Key': `chauffeur-demo-${crypto.randomUUID()}` },
  });

  await api(`/payments/${checkout.payment.id}/mock-confirm`, {
    method: 'POST',
    token,
  });

  await api(`/operations/bookings/${checkout.bookingId}/decision`, {
    method: 'POST',
    token,
    body: {
      decision: 'CONFIRM',
      note: `Demo booking ${bookingNumber} automatically confirmed`,
    },
  });

  const booking = await api(`/bookings/${checkout.bookingId}`, { token });
  const detailId = Number(booking?.legs?.[0]?.id);
  if (!detailId) {
    throw new Error(`Booking ${checkout.bookingId} did not return a reservation leg ID`);
  }

  const assignment = await api(
    `/operations/bookings/${checkout.bookingId}/legs/${detailId}/assign-chauffeur`,
    {
      method: 'POST',
      token,
      body: {
        driverId: DRIVER_ID,
        scheduledStartAt: slot.startAt,
        scheduledEndAt: slot.endAt,
      },
    },
  );

  return {
    bookingNumber,
    bookingId: checkout.bookingId,
    reservationNo: checkout.reservationNo,
    detailId,
    assignmentId: assignment.id,
    assignmentStatus: assignment.status ?? 'OFFERED',
    passengerName: bookingData.passengerName,
    startAt: slot.startAt,
    endAt: slot.endAt,
  };
}

async function main() {
  if (env.PAYMENT_PROVIDER !== 'mock') {
    throw new Error(
      'This demo generator requires PAYMENT_PROVIDER=mock because it automatically confirms payment. ' +
        'Set PAYMENT_PROVIDER=mock and NODE_ENV=development, then restart the backend.',
    );
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('Do not run this demo generator with NODE_ENV=production');
  }

  console.log(`API: ${API_BASE_URL}`);
  await assertSeedEntitiesExist();
  const plannedSlots = await findTenAvailableSlotsToday();

  console.log('\nCreating 10 bookings today from 12:10–23:00 UTC...');
  const created = [];

  for (const [index, slot] of plannedSlots.entries()) {
    const bookingNumber = index + 1;
    try {
      // Start every booking with a newly issued access token.
      const token = await loginAdmin();
      const result = await createAndAssignBooking({
        token,
        bookingData: BOOKING_DATA[index],
        slot,
        bookingNumber,
      });
      created.push(result);
      console.log(
        `Booking ${bookingNumber}/10 created: ${result.reservationNo} | ` +
          `${result.passengerName} | ${result.startAt} | assignment ${result.assignmentId}`,
      );
    } catch (error) {
      console.error(`\nBooking ${bookingNumber} failed: ${error.message}`);
      if (error.payload) console.error(JSON.stringify(error.payload, null, 2));
      throw error;
    }
  }

  console.log('\nAll 10 demo bookings were created successfully.');
  console.table(created);
  console.log(
    '\nAssignments remain OFFERED. Log in as Ravi in the chauffeur app and acknowledge each trip.',
  );
}

main()
  .catch((error) => {
    console.error(`\nDemo generation failed:\n${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
