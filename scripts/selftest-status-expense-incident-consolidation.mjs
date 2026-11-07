import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordBookingStatusEvent, MOBILE_BOOKING_STATUS_EVENTS } from '../src/services/mobile-status-events.js';
import { addMobileDriverExpense } from '../src/services/mobile-driver-expenses.js';
import { splitMigrationStatements } from '../src/scripts/split-migration-sql.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = name => readFile(path.join(root,name),'utf8');
const srcFiles=[];
const walk = async folder => {
  for(const e of await readdir(path.join(root,folder),{withFileTypes:true})){
    const name=path.join(folder,e.name);
    if(e.isDirectory())await walk(name);
    else if(name.endsWith('.js'))srcFiles.push(name);
  }
};
await walk('src');
const fakeConnection = (id=123) => {
  const calls=[];
  return {calls,execute:async (sql,params=[])=>{
    calls.push({sql,params});
    // Catch count drift in statements with parameter placeholders.
    assert.equal((sql.match(/\?/g)||[]).length,params.length,`${sql.slice(0,90)}: SQL placeholder mismatch`);
    if(sql.includes('INSERT INTO app_mobile_'))return [{insertId:id}];
    if(sql.includes('INSERT INTO activity_logs'))return [{insertId:44}];
    if(sql.includes('SELECT mobile_driver_id FROM reservation_drivers'))return [[{mobile_driver_id:17}]];
    return [{insertId:99,affectedRows:1}];
  }};
};

test('old status, expense and incident business tables have no runtime references',async()=>{
  for(const name of srcFiles) {
    const data=await read(name);
    assert.doesNotMatch(data,/app_(?:booking_status_events|driver_expenses|incidents)/i,name);
  }
});

test('migration 010 preserves public IDs, legacy columns and complete history',async()=>{
  const sql=await read('migrations/010_consolidate_status_expenses_and_service_incidents.sql');
  for(const text of ['app_mobile_status_event_ids','app_mobile_expense_ids',
    'INSERT INTO activity_logs','INSERT INTO reservation_driver_statuses',
    'INSERT INTO reservation_other_costs','CREATE TABLE IF NOT EXISTS reservation_service_incidents',
    'FROM app_booking_status_events','FROM app_driver_expenses','FROM app_incidents',
    'mobile_event_id','mobile_expense_id','vehicle_damage_id'])assert.ok(sql.includes(text),text);
  assert.match(sql,/0,'MOBILE_DRIVER_EXPENSE'/);
  assert.match(sql,/e\.amount,e\.currency/);
  assert.doesNotMatch(sql,/^\s*DROP TABLE\b|^\s*DELETE FROM\b|^\s*DROP COLUMN\b/gim);
});

test('timeline read query returns the same camelCase API aliases',async()=>{
  assert.match(MOBILE_BOOKING_STATUS_EVENTS,/COALESCE\(a\.mobile_event_id,a\.id\) AS id/);
  const b=await read('src/services/booking-view.js');
  const t=await read('src/services/tracking.js');
  assert.match(b,/reservation_details_id AS legId, assignment_id AS assignmentId/);
  assert.match(b,/occurred_at AS occurredAt/);
  assert.match(t,/status,note,latitude,longitude,occurred_at AS occurredAt/);
  assert.match(b,/FROM \$\{MOBILE_BOOKING_STATUS_EVENTS\} mobile_event/);
  assert.match(t,/FROM \$\{MOBILE_BOOKING_STATUS_EVENTS\} mobile_event/);
});

test('booking event writes website audit row and chauffeur-specific mirror atomically',async()=>{
  const c=fakeConnection(821);
  const result=await recordBookingStatusEvent(c,{reservationId:12,reservationDetailsId:13,assignmentId:14,
    status:'ON_THE_WAY',actorUserId:9,note:'Delayed at gate',latitude:48,longitude:16,
    occurredAt:'2026-10-01 08:00:00'});
  assert.equal(result.id,821);
  assert.equal(c.calls.length,4);
  assert.match(c.calls[1].sql,/INSERT INTO activity_logs/);
  assert.match(c.calls[3].sql,/INSERT INTO reservation_driver_statuses/);
  assert.ok(c.calls[3].params.includes(821));
  const simple=fakeConnection(902);
  await recordBookingStatusEvent(simple,{reservationId:12,status:'PAYMENT_PENDING'});
  assert.equal(simple.calls.length,2);
});

test('driver expense is internal-only with zero PHP charge and stable public ID',async()=>{
  const c=fakeConnection(922);
  const result=await addMobileDriverExpense(c,{assignmentId:5,reservationId:10,reservationDetailsId:20,
    driverId:8,submittedByUserId:11,category:'TOLL',amount:14.50,currency:'EUR',
    description:'toll receipt',incurredAt:'2026-11-01 09:00:00'});
  assert.equal(result.insertId,922);
  assert.equal(c.calls.length,2);
  assert.match(c.calls[1].sql,/0,'MOBILE_DRIVER_EXPENSE'/);
  assert.match(c.calls[1].sql,/mobile_expense_amount/);
  assert.ok(c.calls[1].params.includes(14.50));
});

test('incidents preserve generic categories and optional verified damage relation',async()=>{
  const c=await read('src/modules/chauffeur.js');
  const o=await read('src/modules/operations.js');
  assert.match(c,/DELAY', 'VEHICLE_ISSUE', 'PASSENGER_ISSUE', 'SAFETY', 'OTHER'/);
  assert.match(c,/vehicleDamageId: z\.number\(\)\.int\(\)\.positive\(\)\.optional\(\)/);
  assert.match(c,/FROM reservation_vehicle_damages/);
  assert.match(c,/INSERT INTO reservation_service_incidents/);
  assert.match(o,/UPDATE reservation_service_incidents/);
  assert.match(o,/UPDATE reservation_other_costs/);
});

test('local test UI includes working flow actions and restricts proxy to localhost',async()=>{
  const server=await read('scripts/serve-api-test-ui.mjs');
  const ui=await read('tools/api-test-ui/app.js');
  assert.match(server,/127\.0\.0\.1/);
  assert.match(server,/path\.startsWith\('\/api\/v1\/'\)/);
  for(const endpoint of ['/catalog/services','/bookings/drafts','/chauffeur/assignments/',
    '/operations/expenses/','/operations/incidents/']) assert.ok(ui.includes(endpoint),endpoint);
  assert.doesNotMatch(ui,/localStorage|sessionStorage/);
});


test('migration runner skips comment-only SQL fragments without changing old migration files',async()=>{
  for(const n of ['008_consolidate_reservation_meta_into_reservations.sql',
    '009_consolidate_reservation_legs_and_driver_assignments.sql',
    '010_consolidate_status_expenses_and_service_incidents.sql']){
    const parts=splitMigrationStatements(await read('migrations/'+n));
    assert.ok(parts.length>10, n+' migration unexpectedly empty');
    assert.ok(parts.every(p=>p.split(/\r?\n/).some(line=>{const t=line.trim();return t&&!t.startsWith('--')&&!t.startsWith('#');})));
  }
});
