// Run on a disposable import of the exact supplied dump. Does not install views,
// triggers, columns, indexes, or tables. Existing rows remain test fixtures only.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import request from 'supertest';
import app from '../src/app.js';
import {pool,query,one,transaction} from '../src/db/pool.js';
import {signAccessToken} from '../src/services/tokens.js';
import {refreshNativeBalancePayment} from '../src/services/native-balance-payment.js';
import {listAvailableVehicles} from '../src/services/vehicle-availability.js';
import {calculateQuote} from '../src/services/pricing.js';
import {syncClientAssignments} from '../src/services/client-assignment-sync.js';
import {insertNativeDocument} from '../src/services/client-native-store.js';
import {verifyExistingSchema} from '../src/services/schema-verifier.js';
import {assertNoSchemaMutation} from '../src/db/schema-guard.js';
if(process.env.CLIENT_DB_TEST_DISPOSABLE!=='true')throw Error('Set CLIENT_DB_TEST_DISPOSABLE=true only on a disposable exact-dump import');
let checks=0;
function check(condition,label){assert.ok(condition,label);checks++;console.log('PASS',label);}
async function row(table,data={}) {
 const columns=await query('SELECT COLUMN_NAME,DATA_TYPE,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]);data={...data};
 for(const c of columns){if(c.COLUMN_NAME in data||c.IS_NULLABLE==='YES'||c.COLUMN_DEFAULT!==null||c.EXTRA.includes('auto_increment'))continue;
 data[c.COLUMN_NAME]=['int','bigint','tinyint','smallint','double','decimal','float'].includes(c.DATA_TYPE)?1:c.DATA_TYPE==='date'?'2027-09-01':c.DATA_TYPE==='time'?'10:00:00':['datetime','timestamp'].includes(c.DATA_TYPE)?'2027-09-01 10:00:00':c.DATA_TYPE==='enum'?c.COLUMN_TYPE.match(/'([^']+)'/)[1]:('adapter-'+randomUUID()).slice(0,25);}
 const result=await query(`INSERT INTO \`${table}\` (${Object.keys(data).map(c=>'`'+c+'`').join(',')}) VALUES (${Object.keys(data).map(()=>'?').join(',')})`,Object.values(data));return result.insertId;
}
const token={};const user={};
async function makeUser(name,role){const id=await row('users',{user_name:name+'@adapter.test',full_name:name,email:name+'@adapter.test',role,status:0});user[name]=id;token[name]=signAccessToken({id,role});return id;}
async function api(method,path,body,expected=200,who='client') {
 const r=await request(app)[method]('/api/v1'+path).set('Authorization','Bearer '+token[who]).set('Idempotency-Key',randomUUID()).send(body);
 assert.equal(r.status,expected,path+': '+JSON.stringify(r.body));return r.body;
}
try {
 const before=await query("SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION");
 const indexes=await query('SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX');
 const fks=await query('SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION');
 const schema=await verifyExistingSchema(pool);check(schema.schemaChanges===0,'read-only contract accepts unmodified supplied schema');
 assert.throws(()=>assertNoSchemaMutation(' /* guard */ ALTER TABLE reservations ADD x INT'),{code:'SCHEMA_MUTATION_DISABLED'});check(true,'runtime rejects schema mutation');
 const admin=await makeUser('admin',1),client=await makeUser('client',5),d1User=await makeUser('driver1',3),d2User=await makeUser('driver2',3);
 const customer=await row('customers',{uuid:randomUUID(),user_id:client,full_name:'Client',email:'client@adapter.test',phone_no:'+919999999999',created_by:admin,status:1,is_registered:1});
 const d1=await row('drivers',{user_id:d1User,full_name:'Driver One'}),d2=await row('drivers',{user_id:d2User,full_name:'Driver Two'});
 const country=await row('countries',{code:'CH',name:'Switzerland',status:1});
 const city=await row('cities',{country_id:country,name:'Geneva',status:1});
 const city2=await row('cities',{country_id:country,name:'Zurich',status:1});
 const duration=await row('rental_durations',{title:'Two hours',span_duration:2,rent_type:1,status:1});
 const classes=[],vehicles=[];
 for(let i=0;i<8;i++) {
  const klass=await row('vehicle_classes',{title:'Class '+i,rental_type:1,status:1,can_reservation_from_website:i===5?0:1,car_with_driver_free_km:200,car_with_driver_extra_cost_per_km:2,one_way_drop_off_charge:0});classes.push(klass);
  await row('vehicle_class_countries',{vehicle_class_id:klass,country_id:country});
  const vehicle=await row('vehicles',{title:'Vehicle '+i,vehicle_class_id:klass,status:1,online_booking_status:1,doa_fleet:i===4?'2029-01-01':null});vehicles.push(vehicle);
  await row('vehicle_cities',{vehicle_id:vehicle,city_id:i%2?city2:city,country:'CH',locality:i%2?'Zurich':'Geneva'});
  await row('vehicle_original_cities',{vehicle_id:vehicle,city_id:i%2?city2:city,country:'CH',locality:i%2?'Zurich':'Geneva'});
  await row('vehicle_service_types',{vehicle_id:vehicle,service_type:1});
  if(i!==3)await row('vehicle_dimensions',{vehicle_id:vehicle,seating_capacity:i===2?'2':'7',boot_capacity:'3'});
  await row('vehicle_class_price_rates',{vehicle_class_id:klass,rental_season_id:0,rental_duration_id:duration,rent_type:1,country_id:country,amount:200,status:1});
 }
 await row('tax_surecharges',{country_id:country,service_type:1,amount:8.1,status:1});
 await row('vehicle_blocks',{vehicle_id:vehicles[6],start_date:'2027-09-01',end_date:'2027-09-01',start_time:'00:00:00',end_time:'23:59:59'});
 // Independent fixture query for the agreed country/fleet/blocks policy; no existing allocations yet.
 let website=await query(`SELECT vc.id FROM vehicle_classes vc WHERE vc.status=1 AND vc.rental_type=1 AND vc.deleted_at IS NULL
  AND EXISTS(SELECT 1 FROM vehicle_class_countries cc WHERE cc.vehicle_class_id=vc.id AND cc.country_id=? AND cc.deleted_at IS NULL)
  AND EXISTS(SELECT 1 FROM vehicles v WHERE v.vehicle_class_id=vc.id AND v.status=1 AND v.online_booking_status=1 AND v.deleted_at IS NULL
   AND (v.doa_fleet IS NULL OR v.doa_fleet<='2027-09-01')
   AND NOT EXISTS(SELECT 1 FROM vehicle_blocks b WHERE b.vehicle_id=v.id AND TIMESTAMP(b.start_date,COALESCE(b.start_time,'00:00:00'))<'2027-09-01 12:00:00' AND TIMESTAMP(b.end_date,COALESCE(b.end_time,'23:59:59'))>'2027-09-01 10:00:00')
   AND v.id IN(SELECT vehicle_id FROM vehicle_cities WHERE country='CH' AND deleted_at IS NULL)
   AND v.id NOT IN(SELECT vehicle_id FROM vehicle_reserved_dates WHERE reserved_date BETWEEN '2027-09-01' AND '2027-09-01')
   AND EXISTS(SELECT 1 FROM vehicle_service_types s WHERE s.vehicle_id=v.id AND s.service_type=1)) ORDER BY vc.id`,[country]);
 let catalog=await api('get',`/catalog/vehicle-classes?serviceCode=CHAUFFEUR&countryId=${country}&cityId=${city}&passengerCount=6&startAt=2027-09-01T10:00:00Z&endAt=2027-09-01T12:00:00Z`);
 assert.deepEqual(catalog.items.map(c=>c.id).sort((a,b)=>a-b),website.map(c=>c.id));check(catalog.items.length===6,'shared catalog excludes future and blocked vehicles while retaining country fallback and missing dimensions');
 check(catalog.items.every(c=>JSON.stringify(Object.keys(c).sort())===JSON.stringify(['id','title','description','image','passengerCapacity','startingPrice','currency','startingPriceIndicative'].sort())),'vehicle class JSON keys unchanged');
 const second=await row('vehicles',{vehicle_class_id:classes[0],status:1,online_booking_status:1});
 await row('vehicle_cities',{vehicle_id:second,city_id:city,country:'CH',locality:'Geneva'});await row('vehicle_original_cities',{vehicle_id:second,city_id:city,country:'CH',locality:'Geneva'});await row('vehicle_service_types',{vehicle_id:second,service_type:1});
 await query("UPDATE vehicle_original_cities SET locality='Zurich',city_id=? WHERE vehicle_id=?",[city2,vehicles[0]]);
 const candidates=await listAvailableVehicles({vehicleClassId:classes[0],countryId:country,cityId:city,startAt:'2027-09-01T10:00:00Z',endAt:'2027-09-01T12:00:00Z',serviceCode:'CHAUFFEUR'});
 check(candidates[0].id===second&&candidates.length===2,'pickup-city vehicle preferred before country-wide fallback');
 const option=await row('rental_options',{title:'Child seat',title_en:'Child seat',rent_type:2,status:0,show_on_frontend:1,based_on:1,rate_type:1,amount:10,taxable:1});
 await row('rental_option_classes',{rental_option_id:option,vehicle_class_id:classes[0]});
 const options=await api('get',`/catalog/options?serviceCode=CHAUFFEUR&vehicleClassId=${classes[0]}`);
 check(options.items.some(o=>o.id===option&&o.taxable===0),'class-mapped website add-on survives historical service/status mismatch and remains untaxed');
 const q=await calculateQuote({serviceCode:'CHAUFFEUR',vehicleClassId:classes[0],countryId:country,startAt:'2027-09-01T10:00:00Z',endAt:'2027-09-01T12:00:00Z',requestedHours:2,distanceKm:0,insuranceType:'NONE',optionSelections:[{optionId:option,quantity:2}]});
 check(q.lines.baseRate===200&&q.lines.nonTaxableOptions===40&&q.lines.totalTax===16.2&&q.lines.total===256,'quote taxes base only and applies website chauffeur option units');
 async function booking(total=100,paid=0,status=1){
  const id=await row('reservations',{uuid:randomUUID(),reservation_no:'AD-'+randomUUID(),customer_id:customer,service_type:1,user_id:admin,currency:'CHF',status,payment_status:paid?20:0});
  const leg=await row('reservation_details',{reservation_id:id,status:1,is_extra_service:0,days:2,is_hourly:1,pick_up_date:'2027-09-01',drop_off_date:'2027-09-01',pick_up_time:'10:00:00',drop_off_time:'12:00:00',pick_up_location:'Geneva Airport',drop_off_location:'Geneva Center',pick_up_country_id:country,drop_off_country_id:country,pick_up_city_id:city,drop_off_city_id:city});
  await row('reservation_costs',{reservation_id:id,reservation_details_id:leg,status:1,base_rate:total,total_amount:total,optional_cost:0,total_tax:0,discount:0});
  if(paid)await row('reservation_payments',{reservation_id:id,total_due:total,payment_amount:paid,due_amount:total-paid,payment_type:3,status:1,user_id:admin});return {id,leg};
 }
 async function extra(b,amount){const leg=await row('reservation_details',{reservation_id:b.id,status:1,is_extra_service:1,pick_up_date:'2027-09-02',service_details:'Post-service parking charge'});await row('reservation_costs',{reservation_id:b.id,reservation_details_id:leg,status:1,base_rate:amount,total_amount:amount,total_tax:0});return leg;}
 const paid=await booking(100,100,2),fee=await extra(paid,30);
 await query('UPDATE reservation_payments SET created_at=DATE_SUB(NOW(),INTERVAL 48 HOUR) WHERE reservation_id=?',[paid.id]);
 const concurrent=await Promise.all(Array.from({length:4},()=>refreshNativeBalancePayment(paid.id,client)));
 check(concurrent.every(s=>s.payment.id===concurrent[0].payment.id&&s.payment.amount===30),'concurrent post-payment balance refresh creates one 30 payment, even after 48 hours');
 let view=await api('get','/bookings/'+paid.id);
 check(view.status==='COMPLETED'&&view.serviceCode==='CHAUFFEUR'&&view.currency==='CHF'&&view.canRetryPayment&&view.legs.length===1&&view.costs.some(c=>c.legId===fee),'native completed booking exposes extra costs with unchanged mobile fields and no fake journey leg');
 const bookingKeys=['id','uuid','reservationNo','customerId','agencyId','legacyStatus','paymentStatus','createdAt','serviceCode','status','sourceChannel','createdByAgentId','currency','legs','costs','events','assignments','payments','paymentId','paymentState','paymentOption','canRetryPayment'];
 assert.deepEqual(Object.keys(view).sort(),bookingKeys.sort());check(true,'booking response envelope exactly retains original keys');
 let due=await api('get','/bookings?status=UNPAID');check(due.items.some(b=>b.id===paid.id&&b.canRetryPayment),'completed booking with later expense appears in existing UNPAID list');
 await api('post',`/payments/${view.paymentId}/retry`,{});await api('post',`/payments/${view.paymentId}/mock-confirm`,{});
 view=await api('get','/bookings/'+paid.id);check(view.status==='COMPLETED'&&!view.canRetryPayment&&(await one('SELECT SUM(payment_amount) AS total FROM reservation_payments WHERE reservation_id=?',[paid.id])).total===130,'top-up settles native ledger and preserves completed trip');
 const unpaid=await booking();await extra(unpaid,30);view=await api('get','/bookings/'+unpaid.id);check(view.payments[0].amount===130,'unpaid base and additional expense merge into one 130 payment');
 const paymentId=view.paymentId;await api('post',`/payments/${paymentId}/retry`,{});
 const originalRef=(await one('SELECT provider_reference FROM app_payment_transactions WHERE id=?',[paymentId])).provider_reference;
 await extra(unpaid,20);view=await api('get','/bookings/'+unpaid.id);check(view.canRetryPayment,'admin increase on an initialized unpaid attempt remains payable');
 await api('post',`/payments/${paymentId}/retry`,{});
 const replaced=await one('SELECT * FROM app_payment_transactions WHERE id=?',[paymentId]);
 check(replaced.amount===150&&replaced.provider_reference!==originalRef&&JSON.parse(replaced.provider_payload).retiredProviderReferences.includes(originalRef),'retry cancels previous attempt and creates a fresh idempotent intent for combined 150 balance');
 const event={id:'evt_'+randomUUID(),type:'payment_intent.succeeded',data:{object:{id:replaced.provider_reference,object:'payment_intent',status:'succeeded',amount_received:15000,currency:'chf'}}};
 const webhook=await request(app).post('/api/v1/payments/webhook').send(event);assert.equal(webhook.status,200,JSON.stringify(webhook.body));
 const again=await request(app).post('/api/v1/payments/webhook').send(event);assert.equal(again.status,200);
 check((await one('SELECT COUNT(*) AS n,SUM(payment_amount) AS amount FROM reservation_payments WHERE reservation_id=?',[unpaid.id])).n===1,'duplicate webhook records one native payment');
 const nativePaid=await booking(100,0);let np=await refreshNativeBalancePayment(nativePaid.id);
 await api('post',`/payments/${np.payment.id}/retry`,{});
 await row('reservation_payments',{reservation_id:nativePaid.id,total_due:100,payment_amount:100,due_amount:0,payment_type:3,status:1,user_id:admin});
 view=await api('get','/bookings/'+nativePaid.id);check(!view.canRetryPayment,'admin full bank payment disables an initialized mobile charge');
 await api('post',`/payments/${np.payment.id}/retry`,{},409);
 const changedPrice=await booking();const cp=await refreshNativeBalancePayment(changedPrice.id);
 await query('UPDATE reservation_costs SET optional_cost=25,total_amount=125 WHERE reservation_id=?',[changedPrice.id]);
 const cpView=await api('get','/payments/'+cp.payment.id);check(cpView.amount===125,'payment polling refreshes admin-added optional cost without counting it twice');
 const oldDetail=await row('reservation_details',{reservation_id:changedPrice.id,status:0,is_extra_service:0,pick_up_date:'2027-09-01'});
 await row('reservation_costs',{reservation_id:changedPrice.id,reservation_details_id:oldDetail,status:1,base_rate:999,total_amount:999});
 view=await api('get','/bookings/'+changedPrice.id);check(view.costs.length===1&&view.costs[0].totalAmount===125,'retired admin history cannot inflate active reservation prices');
 await query("UPDATE reservations SET lifecycle_status='CANCELLED',currency_code='EUR' WHERE id=?",[changedPrice.id]);
 view=await api('get','/bookings/'+changedPrice.id);check(view.status==='CONFIRMED'&&view.currency==='CHF','native parent status and currency override stale mobile-only metadata');
 const partial=await booking(100,40);await extra(partial,30);check((await refreshNativeBalancePayment(partial.id)).payment.amount===90,'partial native payments are deducted from original plus extras');
 await row('reservation_payments',{reservation_id:partial.id,custom_invoices:999,payment_amount:70,total_due:70,due_amount:0,payment_type:3,status:1,user_id:admin});
 check((await refreshNativeBalancePayment(partial.id)).payment.amount===90,'unrelated custom-invoice payment does not reduce reservation balance');
 await query('UPDATE reservation_details SET other_cost=900,provider_cost=900 WHERE id=?',[partial.leg]);check((await refreshNativeBalancePayment(partial.id)).payment.amount===90,'internal driver/provider costs never become customer expenses');
 const missingLedger=await booking();await query('UPDATE reservations SET payment_status=20 WHERE id=?',[missingLedger.id]);check((await refreshNativeBalancePayment(missingLedger.id)).blocked,'legacy paid flag without ledger cannot rebill original fare');
 const native=await booking();const nativeDriver=await row('reservation_drivers',{reservation_id:native.id,reservation_details_id:native.leg,pick_up_driver_id:d1,drop_off_driver_id:d2,user_id:admin,status:1});
 await row('reservation_vehicles',{reservation_id:native.id,reservation_details_id:native.leg,vehicle_id:vehicles[0],status:1,pick_up_date:'2027-09-01',drop_off_date:'2027-09-01',pick_up_time:'10:00:00',drop_off_time:'12:00:00'});
 view=await api('get','/bookings/'+native.id);check(view.assignments.length===2&&view.legs[0].vehicleClassId===classes[0],'native driver roles and active vehicle class appear without metadata triggers');
 const oldIds=view.assignments.map(a=>a.id);await query('UPDATE reservation_drivers SET pick_up_driver_id=NULL WHERE id=?',[nativeDriver]);view=await api('get','/bookings/'+native.id);check(view.assignments.length===1&&!view.assignments.some(a=>a.id===oldIds.find(id=>!view.assignments.some(a=>a.id===id))),'admin driver removal cancels stale public role');
 const confirmed=await row('reservation_statuses',{name:'Confirmed',slug:'confirmed',type:'trip_status',status:1,driver_status:0});
 const completed=await row('reservation_statuses',{name:'Completed',slug:'completed',type:'trip_status',status:1,driver_status:0});
 await query('UPDATE reservation_details SET trip_status_id=?,trip_status_updated_by=?,trip_status_updated_at=NOW() WHERE id=?',[completed,admin,native.leg]);
 view=await api('get','/bookings/'+native.id);check(view.status==='COMPLETED'&&view.legs[0].status==='COMPLETED','native admin trip status maps directly to mobile completion');
 await query("UPDATE reservation_details SET mobile_leg_status='IN_SERVICE',trip_status_id=NULL,trip_status_updated_by=?,trip_status_updated_at=NOW() WHERE id=?",[admin,native.leg]);
 view=await api('get','/bookings/'+native.id);check(view.legs[0].status==='CONFIRMED','clearing native admin trip status clears stale driver progress');
 await query("UPDATE reservations SET status=3,lifecycle_status='CONFIRMED' WHERE id=?",[native.id]);view=await api('get','/bookings/'+native.id);check(view.status==='CANCELLED'&&!view.canRetryPayment,'native parent cancellation overrides stale mobile metadata');
 await query('UPDATE reservations SET status=1 WHERE id=?',[native.id]);await query('UPDATE reservation_details SET trip_status_id=?,trip_status_updated_by=? WHERE id=?',[confirmed,admin,native.leg]);
 await syncClientAssignments({reservationId:native.id});
 const currentDriver=await one('SELECT id FROM app_mobile_assignment_ids WHERE reservation_driver_id=? AND driver_id=? AND current_slot=1',[nativeDriver,d2]);
 await api('post',`/chauffeur/assignments/${currentDriver.id}/acknowledge`,{},200,'driver2');
 await row('file_managers',{uuid:randomUUID(),created_by:d2User,mobile_document_id:9000,file_org_name:'Historical document',file_path:'private/old.pdf'});
 const document=await transaction(c=>insertNativeDocument(c,{userId:d2User,reservationId:native.id,category:'GENERAL',name:'parking.pdf',disk:'local',key:'private/parking.pdf',mime:'application/pdf',size:20,expiresAt:null}));
 check(document.insertId>9000,'new document identity avoids historical native IDs absent from mobile table');
 const expense=await api('post',`/chauffeur/assignments/${currentDriver.id}/expenses`,{category:'PARKING',amount:12.34,currency:'CHF',documentId:document.insertId,incurredAt:new Date().toISOString()},201,'driver2');check(Boolean(expense.id),'driver expense with native document satisfies exact existing assignment/document FKs');
 await api('post',`/chauffeur/assignments/${currentDriver.id}/incidents`,{type:'DELAY',severity:'LOW',description:'Delay caused by traffic'},201,'driver2');check(true,'driver incident satisfies existing native assignment FK');
 const inbox=await api('get','/notifications',undefined,200,'driver2');check(inbox.items.length>0,'native notification inbox works with physical app_notifications table left untouched');
 await api('post',`/notifications/${inbox.items[0].id}/read`,{},204,'driver2');
 check((await api('get','/notifications/unread-count',undefined,200,'driver2')).count===inbox.items.length-1,'notification read writes native morph record');
 const vip=await api('post','/bookings/vip-requests',{airport:'Geneva',serviceAt:'2027-09-01T10:00:00Z',passengerCount:2,requestText:'Meet us'},201);
 let vips=await api('get','/bookings/manual-requests/vip');check(vips.items.some(v=>v.id===vip.id),'native contact inquiry read works without replacing app_vip_requests table');
 await api('patch','/operations/vip-requests/'+vip.id,{status:'IN_REVIEW',operationsNote:'Received'},200,'admin');vips=await api('get','/bookings/manual-requests/vip');check(vips.items.some(v=>v.id===vip.id&&v.status==='IN_REVIEW'),'inquiry operations update native contact adapter');
 const conversation=await api('post',`/communication/bookings/${native.id}/conversation`,{},201);
 const message=await api('post',`/communication/conversations/${conversation.id}/messages`,{messageType:'TEXT',body:'Hello chauffeur'},201);
 const messages=await api('get',`/communication/conversations/${conversation.id}/messages`);check(messages.items.some(m=>m.id===message.id&&m.body==='Hello chauffeur'),'native messages readable without database views');
 const docs=await api('get','/chauffeur/documents',undefined,200,'driver2');check(docs.items.some(d=>d.id===document.insertId),'native document projection preserves chauffeur document response');
 const dashboard=await api('get','/client/dashboard');check(Array.isArray(dashboard.upcomingBookings),'client dashboard derives native lifecycle without trigger installation');
 const draft=await api('post','/bookings/drafts',{serviceCode:'CHAUFFEUR'},201);
 await api('put',`/bookings/drafts/${draft.id}/details`,{vehicleClassId:classes[1],passenger:{fullName:'Client',phone:'+919999999999',count:1,luggageCount:0},legs:[{startAt:'2027-10-01T10:00:00Z',endAt:'2027-10-01T12:00:00Z',requestedHours:2,isHourly:true,pickup:{address:'Geneva Airport',countryId:country,cityId:city},dropoff:{address:'Geneva City',countryId:country,cityId:city},approximateDistanceKm:10}],options:[]});
 const quote=await api('post',`/bookings/drafts/${draft.id}/quote`,{});check(quote.total>0&&!('__native'in quote),'existing quote response keeps internal adapter policy private');
 const checkout=await api('post',`/bookings/drafts/${draft.id}/checkout`,{paymentOption:'PAY_LATER'},201);check(checkout.status==='PAYMENT_DUE','existing mobile checkout creates native admin-manageable reservation');
 const reserved=await query('SELECT vehicle_id FROM vehicle_reserved_dates WHERE reservation_id=?',[checkout.bookingId]);check(reserved.length>0,'checkout updates website reserved-date ledger');
 await api('post',`/payments/${checkout.payment.id}/retry`,{});await api('post',`/payments/${checkout.payment.id}/mock-confirm`,{});check((await api('get','/bookings/'+checkout.bookingId)).canRetryPayment===false,'mobile checkout payment settles against native ledger');
 const after=await query('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION');
 assert.deepEqual(after,before);check(true,'all exercised API flows leave every existing table and column unchanged');
 assert.deepEqual(await query('SELECT TABLE_NAME,INDEX_NAME,NON_UNIQUE,SEQ_IN_INDEX,COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX'),indexes);
 assert.deepEqual(await query('SELECT TABLE_NAME,CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,CONSTRAINT_NAME,ORDINAL_POSITION'),fks);
 check(true,'all original indexes and foreign keys remain unchanged');
 check((await one('SELECT COUNT(*) AS n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()')).n===0,'integration works without installing any database triggers');
 console.log(`EXACT-SCHEMA ADAPTER INTEGRATION: ${checks} checks passed`);
}finally{await pool.end();}
