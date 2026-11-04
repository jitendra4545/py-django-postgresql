import test from 'node:test';
import assert from 'node:assert/strict';
import {
 legacyText,setReservationMetadata,setLegMetadata,createSharedAssignment,
 materializeAssignmentId,recordSharedTripStatus,createSharedMessage,sharedMessageVisibility,
 markSharedMessagesRead,createSharedNotification,createSharedManualRequest,
} from '../src/services/shared-storage.js';
import { normalizeJsonRows } from '../src/db/json-contract.js';
import { buildSharedAuditBatch,sharedAuditColumns } from '../src/services/shared-audit-storage.js';
import { chooseNotificationModel,stableNotificationUuid,viewDefinitions,up } from '../migrations/008_shared_client_storage.js';

function fakeDb(respond=()=>undefined){
 const calls=[];
 return {calls,async execute(sql,params=[]){
   assert.equal((sql.match(/\?/g)||[]).length,params.length,`placeholder count: ${sql}`);
   assert.ok(params.every(v=>v!==undefined),'never bind undefined');
   calls.push({sql,params});
   const custom=respond(sql,params);
   if(custom!==undefined)return [custom];
   return [{insertId:901,affectedRows:1}];
 }};
}

test('long addresses preserve Unicode boundaries and nulls',()=>{
 assert.equal(legacyText(null),null);assert.equal(legacyText('abc',2),'ab');
 assert.equal(legacyText('\u{1f697}\u{1f697}a',2),'\u{1f697}\u{1f697}');
});
test('booking metadata is updated on existing reservations without replacing their keys',async()=>{
 const db=fakeDb();await setReservationMetadata(db,{reservationId:1,serviceCode:'TRANSFER',sourceChannel:'CLIENT_APP',userId:2,status:'CONFIRMED',currency:'EUR'});
 assert.match(db.calls[0].sql,/UPDATE reservations/);assert.match(db.calls[0].sql,/mobile_legacy_status=status/);
 assert.equal(db.calls[0].params.at(-1),1);
});
test('leg writer stores full structured addresses and flight rows in existing tables',async()=>{
 const db=fakeDb();const pickup={address:'a'.repeat(400),countryId:1};
 await setLegMetadata(db,{reservationId:1,detailId:2,vehicleClassId:3,pickup,flightNumber:'TEST123'});
 assert.match(db.calls[0].sql,/UPDATE reservation_details/);
 assert.equal(JSON.parse(db.calls[0].params[4]).address.length,400);
 assert.match(db.calls[1].sql,/INSERT INTO reservation_flight_numbers/);
 assert.deepEqual(db.calls[1].params,[1,2,'TEST123','mobile-leg:2']);
});
test('assignment writer creates exactly one legacy assignment and numeric alias',async()=>{
 const db=fakeDb();const result=await createSharedAssignment(db,{reservationId:1,detailId:2,driverId:3,userId:4,startAt:'2026-11-10 10:00:00',endAt:'2026-11-10 12:00:00'});
 assert.equal(result.insertId,901);assert.equal(db.calls.filter(x=>/INSERT/.test(x.sql)).length,1);
 assert.match(db.calls[0].sql,/INSERT INTO reservation_drivers/);assert.deepEqual(db.calls[1].params,[901]);
 await materializeAssignmentId(db,901,3);assert.match(db.calls[2].sql,/mobile_assignment_id IS NULL/);
});
test('trip statuses map only an unambiguous client slug',async()=>{
 for(const matches of [[],[{id:5}],[{id:5},{id:6}]]){
  const db=fakeDb(sql=>sql.includes('SELECT id FROM reservation_statuses')?matches:undefined);
  await recordSharedTripStatus(db,{assignment:{reservation_id:1,reservation_details_id:2,driver_id:3},status:'ARRIVED',userId:4,note:'x'.repeat(600)});
  assert.equal(db.calls[1].params[1],matches.length===1?5:null);
  assert.equal(db.calls[2].params.at(-1).length,500);
 }
});
test('message writer uses native messages and recipient rows without changing numeric ids',async()=>{
 const db=fakeDb();const result=await createSharedMessage(db,{reservationId:1,conversationId:2,userId:3,messageType:'TEXT',body:'hello'});
 assert.equal(result.insertId,901);assert.match(db.calls[0].sql,/INSERT INTO reservation_messages/);
 assert.match(db.calls[2].sql,/reservation_message_recipients/);assert.match(db.calls[2].sql,/left_at IS NULL/);
});
test('private/local document metadata is not turned into a public shared attachment',async()=>{
 for(const storage_disk of ['local','spaces']){
  const db=fakeDb(sql=>sql.includes('SELECT storage_disk')?[{storage_disk,storage_key:'private/file.pdf',original_name:'file.pdf',mime_type:'application/pdf',size_bytes:10}]:undefined);
  await createSharedMessage(db,{reservationId:1,conversationId:2,userId:3,messageType:'DOCUMENT',documentId:4});
  assert.equal(db.calls.some(x=>x.sql.includes('INSERT INTO reservation_message_attachments')),storage_disk==='spaces');
 }
});
test('native messages are recipient-gated for clients and drivers, with safe SQL principals',()=>{
 for(const role of [3,4,5]){
  const visibility=sharedMessageVisibility('msg',{userId:7,role});
  assert.match(visibility,/reservation_message_recipients/);assert.match(visibility,/mr.user_id=7/);
 }
 assert.equal(sharedMessageVisibility('m',{userId:1,role:1}),'1=1');
 assert.throws(()=>sharedMessageVisibility('m;DROP',{userId:1,role:5}));
 assert.throws(()=>sharedMessageVisibility('m',{userId:'1 OR 1',role:5}));
});
test('native read receipts are scoped to one user, conversation, and message time',async()=>{
 const db=fakeDb();await markSharedMessagesRead(db,{conversationId:2,userId:3,readAt:'2026-11-04 10:00:00'});
 assert.match(db.calls[0].sql,/rr.user_id=\?/);assert.equal(db.calls[0].params[2],3);
});
test('shared notification retains UUID storage, numeric public ID and payload envelope',async()=>{
 const db=fakeDb(sql=>sql.includes('dl.mobile.notification_model')?[{option_value:'App\\Models\\User'}]:undefined);
 const id=await createSharedNotification(db,{userId:4,type:'TEST',title:'T',body:'B',data:{id:9}});
 assert.equal(id,901);assert.match(db.calls[1].params[0],/^[a-f0-9-]{36}$/);
 assert.equal(db.calls[1].params[2],'App\\Models\\User');assert.equal(db.calls[1].params[3],4);
 assert.deepEqual(JSON.parse(db.calls[1].params[4]),{title:'T',body:'B',data:{id:9}});
});
test('notification writer fails closed without the client User morph configuration',async()=>{
 const db=fakeDb(sql=>sql.includes('dl.mobile.notification_model')?[]:undefined);
 await assert.rejects(()=>createSharedNotification(db,{userId:4,type:'TEST',title:'T',body:'B'}),/not configured/);
 assert.equal(db.calls.length,1);
});
test('both manual request types populate native required fields and keep nullable request text',async()=>{
 for(const kind of ['AIRPORT_VIP','CONCIERGE']){
  const db=fakeDb(sql=>sql.includes('FROM customers')?[{full_name:'Test',last_name:null,email:null,phone_no:'000'}]:undefined);
  const result=await createSharedManualRequest(db,{kind,customerId:1,userId:2,serviceAt:'2026-11-10 10:00:00',requestText:null});
  assert.equal(result.insertId,901);assert.match(db.calls[1].sql,/INSERT INTO contacts/);
  assert.equal(db.calls[1].params[2],'');assert.equal(db.calls[1].params.at(-1),1);
 }
 await assert.rejects(()=>createSharedManualRequest(fakeDb(),{kind:'UNKNOWN'}),/Unknown request kind/);
});
test('audit batches use only native logs, preserve JSON and scope their origin',()=>{
 assert.equal(buildSharedAuditBatch([]),null);
 const entry={userId:null,userRole:null,method:'POST',path:'/a',requestQuery:{},requestBody:{password:'[REDACTED]'},ipAddress:'127.0.0.1',userAgent:'test',statusCode:200,durationMs:2.345,requestId:'test-id',accessLine:'POST /a 200',responseBody:{ok:true},contentType:'application/json',responseBytes:11,errorCode:null};
 const batch=buildSharedAuditBatch([entry,entry]);
 assert.match(batch.sql,/INSERT INTO route_access_logs/);
 assert.equal((batch.sql.match(/\?/g)||[]).length,batch.values.length);
 assert.equal(batch.values.length,sharedAuditColumns.length*2);assert.equal(batch.values.at(-1),'MOBILE_API');
 assert.equal(batch.values[9],2);assert.equal(batch.values[13],2.345);
});
test('MariaDB JSON strings normalize without parsing ordinary body fields or double-decoding objects',()=>{
 const rows=[{data:'{"id":1}',pickupDetails:'{"address":"A"}',documentIds:'[1,2]',body:'{"keep":"text"}',details:{x:2},providerPayload:'broken'}];
 const result=normalizeJsonRows(rows);
 assert.deepEqual(result[0].data,{id:1});assert.deepEqual(result[0].documentIds,[1,2]);
 assert.equal(result[0].body,'{"keep":"text"}');assert.equal(result[0].providerPayload,'broken');
 assert.deepEqual(result[0].details,{x:2});const header={insertId:5};assert.equal(normalizeJsonRows(header),header);
});
test('notification morph is inferred only when unambiguous, explicit custom morph allowed',()=>{
 assert.equal(chooseNotificationModel(['App\\Models\\User','App\\Models\\Team']),'App\\Models\\User');
 assert.throws(()=>chooseNotificationModel([]));assert.throws(()=>chooseNotificationModel(['App\\User','App\\Models\\User']));
 assert.equal(chooseNotificationModel([],'user'),'user');assert.throws(()=>chooseNotificationModel([],"User';DROP"));
});
test('migration UUID is deterministic and does not conflate different source identifiers',()=>{
 assert.equal(stableNotificationUuid(7),stableNotificationUuid('7'));
 assert.notEqual(stableNotificationUuid(7),stableNotificationUuid(8));assert.match(stableNotificationUuid(7),/^[a-f0-9-]{36}$/);
});
test('migration cannot run without explicit shared-schema consent',async()=>{
 await assert.rejects(()=>up({}),/requires --allow-shared-schema/);
});
test('read projections cover all eight retired stores without write-through views',()=>{
 const views=viewDefinitions('App\\Models\\User');assert.equal(Object.keys(views).length,7);
 for(const sql of Object.values(views))assert.match(sql,/^SELECT /);
 assert.match(views.dl_mobile_driver_assignments,/COALESCE\(d.mobile_assignment_id,d.id\) AS id/);
 assert.match(views.dl_mobile_messages,/legacy_message_id/);assert.match(views.dl_mobile_notifications,/notifiable_type=CONVERT\(0x/);
});

test('preflight rejects undersized or signedness-conflicting extension columns',async()=>{
 const {compatibleExtensionColumn:compatible}=await import('../migrations/008_shared_client_storage.js');
 assert.equal(compatible({dataType:'varchar',columnType:'varchar(10)',nullable:'YES'},'VARCHAR(40) NULL','reservations','mobile_service_code'),false);
 assert.equal(compatible({dataType:'bigint',columnType:'bigint(20)',nullable:'YES'},'BIGINT UNSIGNED NULL','reservation_drivers','mobile_assignment_id'),false);
 assert.equal(compatible({dataType:'longtext',columnType:'longtext',nullable:'YES'},'JSON NULL','reservation_details','mobile_pickup_details'),true);
 assert.equal(compatible({dataType:'bigint',columnType:'bigint(20) unsigned',nullable:'NO',extra:'auto_increment'},'BIGINT UNSIGNED NULL','notifications','mobile_id'),true);
});

async function readinessDb({omitIndex=false,omitFk=false}={}){
 const {addedColumns,addedIndexes,migrationName}=await import('../migrations/008_shared_client_storage.js');
 const {readFile}=await import('node:fs/promises');const {createHash}=await import('node:crypto');
 const checksum=createHash('sha256').update(await readFile(new URL('../migrations/'+migrationName,import.meta.url))).digest('hex');
 const fks=['app_booking_status_events','app_driver_locations','app_driver_expenses','app_incidents'].map(tableName=>({tableName,columnName:'assignment_id',targetTable:'reservation_drivers',targetColumn:'mobile_assignment_id'}));
 if(!omitFk)fks.push({tableName:'app_push_delivery_jobs',columnName:'notification_id',targetTable:'notifications',targetColumn:'mobile_id'});
 return {async query(sql){
  if(sql.includes('SELECT checksum'))return [[{checksum}]];
  if(sql.includes('SELECT EXTRA'))return [[{extra:'auto_increment'}]];
  if(sql.includes('information_schema.columns'))return [Object.entries(addedColumns).flatMap(([tableName,cols])=>Object.keys(cols).map(columnName=>({tableName,columnName})))];
  if(sql.includes('information_schema.statistics'))return [addedIndexes.filter((_,i)=>!omitIndex||i!==0).flatMap(([tableName,indexName,cols,unique])=>cols.slice(1,-1).split(',').map((columnName,i)=>({tableName,indexName,columnName,nonUnique:unique?0:1,seq:i+1})))];
  if(sql.includes('SELECT COUNT(*) AS total'))return [[{total:0}]];
  if(sql.includes('information_schema.KEY_COLUMN_USAGE'))return [fks];
  if(sql.includes('information_schema.tables'))return [Object.keys(viewDefinitions('App\\Models\\User')).map(name=>({name}))];
  if(sql.includes('dl.mobile.notification_model'))return [[{option_value:'App\\Models\\User'}]];
  if(sql.startsWith('SELECT * FROM `dl_mobile_'))return [[]];
  throw new Error('Unexpected readiness SQL: '+sql);
 }};
}
test('startup readiness requires a matching checksum, all columns, views, indexes and remapped foreign keys',async()=>{
 const {assertSharedStorageReady}=await import('../src/db/shared-schema.js');
 const result=await assertSharedStorageReady(await readinessDb());assert.equal(result.ready,true);assert.equal(result.views,7);
});
test('startup refuses to serve when a unique alias index is missing',async()=>{
 const {assertSharedStorageReady}=await import('../src/db/shared-schema.js');
 await assert.rejects(()=>readinessDb({omitIndex:true}).then(assertSharedStorageReady),/index is missing/);
});
test('startup refuses to serve when a push job foreign key is missing',async()=>{
 const {assertSharedStorageReady}=await import('../src/db/shared-schema.js');
 await assert.rejects(()=>readinessDb({omitFk:true}).then(assertSharedStorageReady),/foreign key is missing/);
});

test('native reassignment resets old-driver progress before the replacement acknowledges',async()=>{
 const db=fakeDb();await materializeAssignmentId(db,10,3);
 assert.equal(db.calls.length,2);assert.match(db.calls[1].sql,/mobile_status_driver_id<>\?/);
 assert.match(db.calls[1].sql,/mobile_acknowledged_at=NULL/);assert.deepEqual(db.calls[1].params,[3,10,3,3]);
 const view=viewDefinitions('App\\Models\\User').dl_mobile_driver_assignments;
 assert.match(view,/mobile_status_driver_id[\s\S]*?THEN 'OFFERED'/);
});
