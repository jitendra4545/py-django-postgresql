/**
 * REAL database integration test. Requires npm ci and a disposable MySQL 8 or
 * MariaDB 10.6+ server. It never imports the fixture into DB_NAME or a user-named
 * database: a random dl_consolidation_test_* database is created for this run.
 * Set ALLOW_DISPOSABLE_DB_TEST=true and TEST_DB_HOST/PORT/USER/PASSWORD.
 * Optional TEST_DB_SSL_CA_PATH enables verified TLS. No third-party API calls.
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {preflight,up,migrationName,retiredTables} from '../migrations/008_shared_client_storage.js';
import {assertSharedStorageReady} from '../src/db/shared-schema.js';
import {normalizeJsonRows} from '../src/db/json-contract.js';
import {
  createSharedAssignment,materializeAssignmentId,createSharedMessage,sharedMessageVisibility,
  createSharedNotification,createSharedManualRequest,markSharedMessagesRead,recordSharedTripStatus,
} from '../src/services/shared-storage.js';

if(process.env.ALLOW_DISPOSABLE_DB_TEST!=='true')throw new Error('Set ALLOW_DISPOSABLE_DB_TEST=true on a DISPOSABLE database server. No database was created.');
const name=`dl_consolidation_test_${Date.now()}_${randomBytes(4).toString('hex')}`;
const ssl=process.env.TEST_DB_SSL_CA_PATH?{rejectUnauthorized:true,ca:await readFile(process.env.TEST_DB_SSL_CA_PATH)}:undefined;
const db=await mysql.createConnection({
 host:process.env.TEST_DB_HOST||'127.0.0.1',port:Number(process.env.TEST_DB_PORT||3306),
 user:process.env.TEST_DB_USER||'root',password:process.env.TEST_DB_PASSWORD||'',
 multipleStatements:true,timezone:'Z',decimalNumbers:true,ssl,
});
let created=false;
let passed=0;
const checks=[];
const check=async(label,fn)=>{await fn();passed++;checks.push(label);console.log(`PASS ${passed}: ${label}`);};
const select=async(sql,params=[])=>normalizeJsonRows((await db.execute(sql,params))[0]);
// Fill only required legacy fixture fields. Explicit inputs below determine all
// relationships; this helper has no application use and no production exports.
async function seed(table,values){
 assert.match(table,/^[a-z_]+$/);
 const [columns]=await db.execute(`SELECT COLUMN_NAME AS name,DATA_TYPE AS type,COLUMN_TYPE AS definition,
  IS_NULLABLE AS nullable,COLUMN_DEFAULT AS defaultValue,EXTRA AS extra
  FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? ORDER BY ordinal_position`,[table]);
 const row={...values};
 for(const c of columns){
  if(Object.hasOwn(row,c.name)||c.nullable==='YES'||c.defaultValue!==null||c.extra.includes('auto_increment'))continue;
  if(['int','bigint','smallint','tinyint','double','float','decimal','mediumint'].includes(c.type))row[c.name]=1;
  else if(c.type==='date')row[c.name]='2026-11-10';
  else if(['datetime','timestamp'].includes(c.type))row[c.name]='2026-11-01 10:00:00';
  else if(c.type==='time')row[c.name]='10:00:00';
  else if(c.type==='enum')row[c.name]=c.definition.match(/'([^']*)'/)[1];
  else if(c.type==='json')row[c.name]='{}';
  else row[c.name]='fixture';
 }
 const names=Object.keys(row);
 await db.execute(`INSERT INTO \`${table}\` (${names.map(k=>`\`${k}\``).join(',')}) VALUES (${names.map(()=>'?').join(',')})`,Object.values(row));
}
try{
 await db.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);created=true;
 await db.query(`USE \`${name}\``);
 await db.query(await readFile(new URL('../tests/fixtures/client-schema-2026-11-03.sql',import.meta.url),'utf8'));
 for(const f of (await readdir(new URL('../migrations/',import.meta.url))).filter(f=>/^00[1-7]_.*\.sql$/.test(f)).sort())
  await db.query(await readFile(new URL('../migrations/'+f,import.meta.url),'utf8'));
 await db.query("SET time_zone='+00:00'");
 await seed('users',{id:1,user_name:'admin-test',full_name:'Admin fixture',email:'admin@example.invalid',password:'not-a-login-hash',role:1,status:0});
 await seed('users',{id:2,user_name:'client-test',full_name:'Client fixture',email:'client@example.invalid',password:'not-a-login-hash',role:5,status:0});
 await seed('users',{id:3,user_name:'driver-test',full_name:'Driver fixture',email:'driver@example.invalid',password:'not-a-login-hash',role:3,status:0});
 await seed('users',{id:4,user_name:'staff-test',full_name:'Staff fixture',email:'staff@example.invalid',password:'not-a-login-hash',role:2,status:0});
 await seed('countries',{id:1,name:'Fixture country',code:'TT',user_id:1});
 await seed('customers',{id:1,full_name:'Client fixture',phone_no:'000',email:'client@example.invalid',user_id:2,created_by:1});
 await seed('drivers',{id:1,full_name:'Driver fixture',country_id:1,user_id:3,created_by:1});
 await seed('vehicle_classes',{id:1});
 for(const id of [1,2]){
  await seed('reservations',{id,reservation_no:`TEST-${id}`,service_type:3,customer_id:1,user_id:1,status:1,currency:'EUR',created_at:'2026-11-01 10:00:00'});
  await seed('reservation_details',{id,reservation_id:id,pick_up_location:'Airport',drop_off_location:'Hotel',pick_up_country_id:1,drop_off_country_id:1,pick_up_date:'2026-11-10',drop_off_date:'2026-11-10',pick_up_time:'10:00:00',drop_off_time:'12:00:00',created_at:'2026-11-01 10:00:00'});
 }
 await seed('reservation_statuses',{id:10,name:'Arrived',slug:'arrived',status:1,driver_status:1});
 await seed('reservation_drivers',{id:40,reservation_id:1,reservation_details_id:1,pick_up_driver_id:1,user_id:1,pick_up_date:'2026-11-10',pick_up_time:'10:00:00',drop_off_date:'2026-11-10',drop_off_time:'12:00:00',created_at:'2026-11-01 10:00:00'});
 await seed('reservation_drivers',{id:2,reservation_id:2,reservation_details_id:2,pick_up_driver_id:1,user_id:1,pick_up_date:'2026-11-11',pick_up_time:'10:00:00',drop_off_date:'2026-11-11',drop_off_time:'12:00:00',created_at:'2026-11-01 10:00:00'});
 await seed('app_reservation_meta',{reservation_id:1,service_code:'TRANSFER',source_channel:'CLIENT_APP',created_by_user_id:2,lifecycle_status:'CONFIRMED',currency_code:'EUR',created_at:'2026-11-01 10:00:00'});
 await seed('app_reservation_leg_meta',{reservation_id:1,reservation_details_id:1,sequence_no:1,vehicle_class_id:1,passenger_count:2,luggage_count:1,pickup_details:JSON.stringify({address:'Airport',countryId:1,cityId:0,latitude:10}),dropoff_details:JSON.stringify({address:'Hotel',countryId:1,cityId:0}),flight_number:'FIX123',status:'PENDING',created_at:'2026-11-01 10:00:00'});
 await seed('app_driver_assignments',{id:2,reservation_id:1,reservation_details_id:1,legacy_reservation_driver_id:40,driver_id:1,status:'OFFERED',scheduled_start_at:'2026-11-10 10:00:00',scheduled_end_at:'2026-11-10 12:00:00',assigned_by_user_id:1,created_at:'2026-11-01 10:00:00'});
 await seed('app_driver_locations',{assignment_id:2,driver_id:1,latitude:1,longitude:2,recorded_at:'2026-11-01 10:00:00'});
 await seed('app_conversations',{id:1,reservation_id:1,status:'ACTIVE',created_at:'2026-11-01 10:00:00'});
 for(const user of [2,3])await seed('app_conversation_participants',{conversation_id:1,user_id:user,participant_role:'MEMBER',joined_at:'2026-11-01 10:00:00'});
 await seed('reservation_messages',{id:1,reservation_id:1,sender_id:4,body:'staff only',created_at:'2026-11-02 10:00:00'});
 await seed('reservation_messages',{id:3,reservation_id:1,sender_id:4,body:'for client',created_at:'2026-11-02 10:00:00'});
 await seed('reservation_message_recipients',{reservation_message_id:3,user_id:2});
 await seed('app_messages',{id:1,conversation_id:1,sender_user_id:3,message_type:'TEXT',body:'original mobile message',created_at:'2026-11-02 10:00:00'});
 await seed('notifications',{id:'00000000-0000-0000-0000-000000000001',type:'NativeTest',notifiable_type:'App\\Models\\User',notifiable_id:2,data:JSON.stringify({title:'Native',body:'Existing'})});
 await seed('app_notifications',{id:1,user_id:2,type:'MOBILE_TEST',title:'Mobile',body:'Existing mobile',data:JSON.stringify({reservationId:1}),created_at:'2026-11-01 10:00:00'});
 await seed('app_push_delivery_jobs',{notification_id:1,user_id:2,status:'PENDING',next_attempt_at:'2026-11-01 10:00:00'});
 await seed('contacts',{id:1,first_name:'Website contact',email:'contact@example.invalid',phone:'000',subject:'Native',message_details:'Keep this contact'});
 await seed('app_vip_requests',{id:1,customer_id:1,created_by_user_id:2,airport:'Airport',service_at:'2026-11-10 10:00:00',passenger_count:2,request_text:null,status:'SUBMITTED'});
 await seed('app_concierge_requests',{id:1,customer_id:1,created_by_user_id:2,category:'DINING',request_text:'Dinner request',status:'SUBMITTED'});
 await seed('route_access_logs',{id:1,user_id:1,method:'GET',uri:'/website',created_at:'2020-01-01'});
 await seed('app_api_request_logs',{request_id:'00000000-0000-0000-0000-000000000099',method:'GET',request_path:'/api/v1/catalog',access_line:'GET /api/v1/catalog 200',http_status:200,duration_ms:1.234,actor_user_id:2,actor_role:5,created_at:'2020-01-01'});
 const before={};for(const table of retiredTables)before[table]=Number((await select(`SELECT COUNT(*) AS n FROM ${table}`))[0].n);
 await check('startup guard rejects an unapplied shared migration',async()=>{await assert.rejects(()=>assertSharedStorageReady(db),/migration 008 is missing/);});
 await check('preflight accepts verified fixture mappings and explicit user morph',async()=>{const r=await preflight(db,{notificationModel:'App\\Models\\User'});assert.deepEqual(r.blockers,[]);});
 await check('migration applies and verifies every copied store',async()=>{await up(db,{allowSharedSchema:true,notificationModel:'App\\Models\\User'});});
 await check('migration retry is idempotent before reopening writers',async()=>{await up(db,{allowSharedSchema:true,notificationModel:'App\\Models\\User',log:()=>{}});});
 const digest=createHash('sha256').update(await readFile(new URL('../migrations/'+migrationName,import.meta.url))).digest('hex');
 await db.execute('INSERT INTO app_schema_migrations (filename,checksum) VALUES (?,?)',[migrationName,digest]);
 await check('post-migration readiness guard passes',async()=>assert.equal((await assertSharedStorageReady(db)).ready,true));
 await check('all eight source-table row counts remain unchanged',async()=>{for(const table of retiredTables)assert.equal(Number((await select(`SELECT COUNT(*) AS n FROM ${table}`))[0].n),before[table]);});
 await check('client and mobile assignment ID collision is mapped, not overwritten',async()=>{
  const old=(await select('SELECT * FROM dl_mobile_driver_assignments WHERE id=2'))[0];assert.equal(old.legacy_reservation_driver_id,40);assert.equal(old.reservation_id,1);
  const native=(await select('SELECT * FROM dl_mobile_driver_assignments WHERE legacy_reservation_driver_id=2'))[0];assert.ok(native.id>2);assert.equal(native.reservation_id,2);
  assert.equal((await select('SELECT assignment_id FROM app_driver_locations'))[0].assignment_id,2);
 });
 await check('website reservation without app metadata is visible',async()=>{const r=(await select('SELECT * FROM dl_mobile_reservation_meta WHERE reservation_id=2'))[0];assert.equal(r.service_code,'TRANSFER');assert.equal(r.lifecycle_status,'CONFIRMED');});
 await check('migrated booking JSON is returned as structured data',async()=>{const r=(await select('SELECT * FROM dl_mobile_reservation_leg_meta WHERE reservation_details_id=1'))[0];assert.equal(r.pickup_details.latitude,10);assert.equal(r.flight_number,'FIX123');assert.equal(r.passenger_count,2);});
 await check('native staff messages do not leak through shared conversation',async()=>{
  const visible=await select(`SELECT body FROM dl_mobile_messages m WHERE m.conversation_id=1 AND ${sharedMessageVisibility('m',{userId:2,role:5})}`);
  assert.ok(visible.some(x=>x.body==='original mobile message'));assert.ok(visible.some(x=>x.body==='for client'));assert.ok(!visible.some(x=>x.body==='staff only'));
 });
 await check('old UUID notification and old numeric mobile ID both survive',async()=>{
  assert.equal((await select('SELECT type FROM dl_mobile_notifications WHERE id=1'))[0].type,'MOBILE_TEST');
  assert.equal((await select("SELECT COUNT(*) AS n FROM notifications WHERE id='00000000-0000-0000-0000-000000000001'"))[0].n,1);
 });
 await check('VIP and concierge retain independent ID 1 without overwriting website contact',async()=>{
  assert.equal((await select('SELECT request_text FROM dl_mobile_vip_requests WHERE id=1'))[0].request_text,null);
  assert.equal((await select('SELECT request_text FROM dl_mobile_concierge_requests WHERE id=1'))[0].request_text,'Dinner request');
  assert.equal((await select('SELECT message_details FROM contacts WHERE id=1'))[0].message_details,'Keep this contact');
 });
 await check('new assignment writes one canonical row and can be referenced by child records',async()=>{
  const row=await createSharedAssignment(db,{reservationId:2,detailId:2,driverId:1,userId:1,startAt:'2026-11-12 10:00:00',endAt:'2026-11-12 12:00:00'});
  assert.ok(row.insertId>40);assert.equal((await select('SELECT id FROM dl_mobile_driver_assignments WHERE id=?',[row.insertId]))[0].id,row.insertId);
  await seed('app_booking_status_events',{reservation_id:2,reservation_details_id:2,assignment_id:row.insertId,status:'OFFERED',actor_user_id:1,occurred_at:'2026-11-12 10:00:00'});
 });
 await check('new PHP-created assignment can acquire an alias before a child FK write',async()=>{
  await seed('reservation_drivers',{id:90,reservation_id:2,reservation_details_id:2,pick_up_driver_id:1,user_id:1,pick_up_date:'2026-11-13',pick_up_time:'10:00:00',drop_off_date:'2026-11-13',drop_off_time:'12:00:00'});
  await materializeAssignmentId(db,90,1);assert.equal((await select('SELECT mobile_assignment_id FROM reservation_drivers WHERE id=90'))[0].mobile_assignment_id,90);
  await seed('app_driver_locations',{assignment_id:90,driver_id:1,latitude:1,longitude:2,recorded_at:'2026-11-13 10:00:00'});
 });
 await check('new messages preserve numeric API IDs and native recipient receipts',async()=>{
  const row=await createSharedMessage(db,{reservationId:1,conversationId:1,userId:3,messageType:'TEXT',body:'new shared message'});
  assert.ok(row.insertId>3);assert.equal((await select('SELECT body FROM dl_mobile_messages WHERE id=?',[row.insertId]))[0].body,'new shared message');
  await markSharedMessagesRead(db,{conversationId:1,userId:2,readAt:'2099-01-01 00:00:00'});
  assert.ok((await select('SELECT read_at FROM reservation_message_recipients WHERE reservation_message_id=? AND user_id=2',[row.insertId]))[0].read_at);
 });
 await check('new UUID-based notification produces a numeric ID and a valid push-job foreign key',async()=>{
  await db.beginTransaction();try{
   const id=await createSharedNotification(db,{userId:2,type:'NEW',title:'new',body:'body',data:{reservationId:1}});
   assert.equal(typeof id,'number');assert.ok(id>1);
   await seed('app_push_delivery_jobs',{notification_id:id,user_id:2,status:'PENDING',next_attempt_at:'2026-11-01 10:00:00'});
   assert.deepEqual((await select('SELECT data FROM dl_mobile_notifications WHERE id=?',[id]))[0].data,{reservationId:1});
   await db.commit();
  }catch(error){await db.rollback();throw error;}
 });
 await check('new request IDs resolve immediately through unchanged VIP/concierge projections',async()=>{
  for(const kind of ['AIRPORT_VIP','CONCIERGE']){
   const row=await createSharedManualRequest(db,{kind,customerId:1,userId:2,airport:'Airport',passengerCount:2,category:'DINING',serviceAt:'2026-11-10 10:00:00',requestText:'New request'});
   const table=kind==='AIRPORT_VIP'?'dl_mobile_vip_requests':'dl_mobile_concierge_requests';
   assert.equal((await select(`SELECT request_text FROM ${table} WHERE id=?`,[row.insertId]))[0].request_text,'New request');
  }
 });
 await check('client-side cancellation overrides stale mobile lifecycle projections',async()=>{await db.execute('UPDATE reservations SET status=3 WHERE id=1');assert.equal((await select('SELECT lifecycle_status FROM dl_mobile_reservation_meta WHERE reservation_id=1'))[0].lifecycle_status,'CANCELLED');});
 await check('client-side pickup edits invalidate stale structured GPS',async()=>{await db.execute("UPDATE reservation_details SET pick_up_location='New airport' WHERE id=1");const row=(await select('SELECT pickup_details FROM dl_mobile_reservation_leg_meta WHERE reservation_details_id=1'))[0];assert.equal(row.pickup_details.address,'New airport');assert.equal(row.pickup_details.latitude,undefined);});
 await check('trip-state writer updates a real client status and native status history',async()=>{
  await recordSharedTripStatus(db,{assignment:{reservation_id:2,reservation_details_id:2,driver_id:1},status:'ARRIVED',userId:3,note:'arrived'});
  assert.equal((await select('SELECT trip_status_id FROM reservation_details WHERE id=2'))[0].trip_status_id,10);
  assert.equal((await select("SELECT COUNT(*) AS n FROM reservation_driver_statuses WHERE reservation_id=2 AND status='ARRIVED'"))[0].n,1);
 });
 await check('audit retention deletes only mobile-origin records',async()=>{
  await db.query("DELETE FROM route_access_logs WHERE mobile_source='MOBILE_API' AND created_at<'2021-01-01'");
  assert.equal((await select('SELECT uri FROM route_access_logs WHERE id=1'))[0].uri,'/website');
 });
 console.log(JSON.stringify({passed,database:name,checks},null,2));
}finally{
 try{
  if(created&&process.env.KEEP_TEST_DB!=='true')await db.query(`DROP DATABASE \`${name}\``);
  else if(created)console.log(`Retained isolated test database: ${name}`);
 }finally{await db.end();}
}
