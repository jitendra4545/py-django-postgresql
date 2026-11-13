// Fixture tests require an empty disposable import of the client's schema.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import app from '../src/app.js';
import { one, pool, query } from '../src/db/pool.js';
import { calculateQuote } from '../src/services/pricing.js';
import { listAvailableVehicles } from '../src/services/vehicle-availability.js';

if (process.env.CLIENT_DB_TEST_DISPOSABLE !== 'true') throw Error('Disposable exact-schema import required');
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks++; console.log('PASS', message); };
async function row(table, input = {}) {
  const columns = await query('SELECT COLUMN_NAME,DATA_TYPE,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?', [table]);
  const data = { ...input };
  for (const c of columns) {
    if (c.COLUMN_NAME in data || c.IS_NULLABLE === 'YES' || c.COLUMN_DEFAULT !== null || c.EXTRA.includes('auto_increment')) continue;
    data[c.COLUMN_NAME] = ['int','bigint','tinyint','smallint','double','decimal','float'].includes(c.DATA_TYPE) ? 1
      : c.DATA_TYPE === 'date' ? '2032-10-01' : c.DATA_TYPE === 'time' ? '10:00:00'
      : ['datetime','timestamp'].includes(c.DATA_TYPE) ? '2032-10-01 10:00:00'
      : c.DATA_TYPE === 'enum' ? c.COLUMN_TYPE.match(/'([^']+)'/)[1] : ('rental-' + randomUUID()).slice(0, 25);
  }
  const keys = Object.keys(data);
  return (await query(`INSERT INTO \`${table}\` (${keys.map(k => '`' + k + '`').join(',')}) VALUES (${keys.map(() => '?').join(',')})`, Object.values(data))).insertId;
}
try {
  const before = await query('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION');
  const country = await row('countries', { code: 'CH', name: 'Rental test Switzerland', status: 1 });
  const city = await row('cities', { country_id: country, name: 'Rental Test Zurich', status: 1 });
  const season = await row('rental_seasons', { name: 'Rental season', start: '2032-10-01', end: '2032-10-31', status: 1 });
  const day = await row('rental_durations', { rent_type: 2, span_duration: 1, status: 1 });
  const week = await row('rental_durations', { rent_type: 2, span_duration: 7, status: 1 });
  const classes = [], vehicles = [];
  for (let index = 0; index < 11; index++) {
    const klass = await row('vehicle_classes', { title: 'Rental ' + index, rental_type: 2, status: 1, one_way_drop_off_charge: 0 });
    classes.push(klass);
    await row('vehicle_class_countries', { vehicle_class_id: klass, country_id: country });
    const vehicle = await row('vehicles', { vehicle_class_id: klass, status: 1, online_booking_status: 1, doa_fleet: index === 7 ? '2033-01-01' : null });
    vehicles.push(vehicle);
    await row('vehicle_cities', { vehicle_id: vehicle, country: 'CH', locality: 'Other rental city' });
    await row('vehicle_original_cities', { vehicle_id: vehicle, country: 'CH', locality: 'Other rental city' });
    await row('vehicle_service_types', { vehicle_id: vehicle, service_type: index === 10 ? 1 : 2 });
    await row('vehicle_dimensions', { vehicle_id: vehicle, seating_capacity: '2', boot_capacity: '1' });
  }
  const rate = (index, amount, overrides = {}) => row('vehicle_class_price_rates', {
    vehicle_class_id: classes[index], rental_season_id: season, rental_duration_id: day,
    rent_type: 2, country_id: country, status: 1, amount, ...overrides,
  });
  // An older inactive country row must not displace today's active rate.
  await rate(0, 99, { status: 2 }); await rate(0, 470);
  await rate(0, 1, { rental_season_id: 0 });
  await rate(0, 700, { rental_duration_id: week });
  await rate(1, 320, { country_id: 0 });
  await rate(2, 20, { rental_season_id: 0 });
  await rate(3, 25, { status: 2 });
  await rate(4, 100, { country_id: 0 }); await rate(4, 0);
  for (const i of [5,6,7,10]) await rate(i, 100);
  await rate(8, 40); await rate(9, 50, { country_id: 0 }); await rate(9, 300);
  const busyReservation = await row('reservations', { status: 1, service_type: 2 });
  const busyDetail = await row('reservation_details', { reservation_id: busyReservation, status: 1 });
  await row('vehicle_reserved_dates', { vehicle_id: vehicles[5], reserved_date: '2032-10-01', reservation_id: busyReservation, reservation_detail_id: busyDetail });
  await row('vehicle_blocks', { vehicle_id: vehicles[6], start_date: '2032-10-01', end_date: '2032-10-01', start_time: '00:00:00', end_time: '23:59:59' });
  const homeVehicle = await row('vehicles', { vehicle_class_id: classes[0], status: 1, online_booking_status: 1 });
  await row('vehicle_cities', { vehicle_id: homeVehicle, country: 'CH', locality: 'Rental Test Zurich' });
  await row('vehicle_original_cities', { vehicle_id: homeVehicle, country: 'CH', locality: 'Rental Test Zurich', city_id: city });
  await row('vehicle_service_types', { vehicle_id: homeVehicle, service_type: 2 });
  await row('vehicle_dimensions', { vehicle_id: homeVehicle, seating_capacity: '7', boot_capacity: '2' });
  const criteria = { serviceCode: 'CAR_RENTAL', countryId: country, cityId: city, startAt: '2032-10-01T10:00:00Z', endAt: '2032-10-02T10:00:00Z' };
  const search = async (overrides = {}) => {
    const response = await request(app).get('/api/v1/catalog/vehicle-classes').query({ ...criteria, ...overrides });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return response.body.items;
  };
  const items = await search();
  assert.deepEqual(items.map(item => item.id), [classes[8], classes[9], classes[1], classes[0]]);
  check(true, 'rental results match positive current season/day rates in website price order');
  check(!items.some(item => [classes[2],classes[3],classes[4]].includes(item.id)), 'historical, inactive and zero country rates cannot expose unbookable rental classes');
  check(!items.some(item => [classes[5],classes[6],classes[7],classes[10]].includes(item.id)), 'rental search preserves shared reserved-date, maintenance, commissioning and service exclusions');
  check(items.find(item => item.id === classes[9]).startingPrice === 300, 'country-specific rental rate takes precedence over a cheaper global rate');
  const selected = items.find(item => item.id === classes[0]);
  check(selected.startingPrice === 470 && selected.passengerCapacity === 7, 'current rental price and pickup-city representative vehicle capacity are displayed');
  assert.deepEqual(Object.keys(selected).sort(), ['id','title','description','image','passengerCapacity','startingPrice','currency','startingPriceIndicative'].sort());
  check(true, 'rental catalog retains all existing response keys');
  check((await listAvailableVehicles({ ...criteria, vehicleClassId: classes[0] }))[0].id === homeVehicle, 'rental search representative matches checkout city preference');
  const extended = await search({ endAt: '2032-10-02T12:00:00Z' });
  check(extended.find(item => item.id === classes[0]).startingPrice === 470, 'rental grace period through 26 hours keeps the one-day rate');
  const weekly = await search({ endAt: '2032-10-08T10:00:00Z' });
  check(weekly.length === 1 && weekly[0].id === classes[0] && weekly[0].startingPrice === 700, 'nearest weekly rental band controls both candidates and seven-day base amount');
  const quote = await calculateQuote({ ...criteria, vehicleClassId: classes[0], distanceKm: 0 });
  check(quote.lines.baseRate === selected.startingPrice, 'rental quote and catalog use the same active season/day rate');
  await rate(0, 2000, { status: 2 });
  check((await search()).find(item => item.id === classes[0]).startingPrice === 470, 'admin inactive price history does not replace the live rental fare');
  check((await one('SELECT COUNT(*) AS n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()')).n === 0, 'rental fix requires no database triggers');
  assert.deepEqual(await query('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION'), before);
  check(true, 'rental search and quote leave every existing table and column unchanged');
  console.log('RENTAL CATALOG INTEGRATION:', checks, 'checks passed');
} finally { await pool.end(); }
