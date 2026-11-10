// Actual MySQL regression suite. Run after test:client-db, on disposable data only.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import request from 'supertest';
import app from '../src/app.js';
import {pool,query,one,transaction} from '../src/db/pool.js';
import {signAccessToken} from '../src/services/tokens.js';
import {refreshNativeBalancePayment} from '../src/services/native-balance-payment.js';
import {applyApprovedBookingChange} from '../src/services/booking-change-service.js';
if(process.env.CLIENT_DB_TEST_DISPOSABLE!=='true')throw Error('A disposable imported MySQL database is required');
const fixture=JSON.parse(await readFile(process.env.CLIENT_DB_FIXTURE_OUTPUT,'utf8'));
fixture.vehicleClass=fixture.vehicleClassId;fixture.vehicle=fixture.vehicleId;
let checks=0;const check=(v,m)=>{assert.ok(v,m);checks++;console.log('PASS',m);};
async function row(table,values){
 const columns=await query('SELECT COLUMN_NAME,DATA_TYPE,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]),data={...values};
 for(const c of columns){if(c.COLUMN_NAME in data||c.IS_NULLABLE==='YES'||c.COLUMN_DEFAULT!==null||c.EXTRA.includes('auto_increment'))continue;
 data[c.COLUMN_NAME]=['int','bigint','tinyint','smallint','double','decimal','float'].includes(c.DATA_TYPE)?1:c.DATA_TYPE==='date'?'2027-09-01':c.DATA_TYPE==='time'?'10:00:00':c.DATA_TYPE==='timestamp'||c.DATA_TYPE==='datetime'?'2027-09-01 10:00:00':c.DATA_TYPE==='enum'?c.COLUMN_TYPE.match(/'([^']+)'/)[1]:('balance-'+randomUUID()).slice(0,30);}
 const result=await query(`INSERT INTO ${table} (${Object.keys(data).map(k=>'`'+k+'`').join(',')}) VALUES (${Object.keys(data).map(()=>'?').join(',')})`,Object.values(data));return result.insertId;
}
try {
 const admin=await one("SELECT id FROM users WHERE email='admin@example.test'"),agent=await one("SELECT id FROM users WHERE email='agent@example.test'"),customer=await one('SELECT id FROM customers WHERE agency_id=? LIMIT 1',[fixture.agency]);
 const adminToken=signAccessToken({id:admin.id,role:1}),agentRecord=await one('SELECT id,agency_id FROM agents WHERE user_id=?',[agent.id]);
 const agentToken=signAccessToken({id:agent.id,role:4});
 async function api(method,path,body,expected=200,staff=false){const res=await request(app)[method]('/api/v1'+path).set('Authorization','Bearer '+(staff?adminToken:agentToken)).send(body);assert.equal(res.status,expected,JSON.stringify(res.body));return res.body;}
 async function booking(total=300,paid=0,completed=false){
  const id=await row('reservations',{uuid:randomUUID(),reservation_no:'BAL-'+randomUUID(),customer_id:customer.id,agency_id:fixture.agency,service_type:1,service_code:'CHAUFFEUR',created_by_user_id:agent.id,created_by_agent_id:agentRecord.id,user_id:admin.id,currency:'€',currency_code:'EUR',status:completed?2:1,payment_status:paid?20:0,lifecycle_status:completed?'COMPLETED':'PAYMENT_DUE'});
  const leg=await row('reservation_details',{reservation_id:id,status:1,is_extra_service:0,vehicle_class_id:fixture.vehicleClass,passenger_count:1,luggage_count:0,days:2,is_hourly:1,pick_up_date:'2027-09-01',drop_off_date:'2027-09-01',pick_up_time:'10:00:00',drop_off_time:'12:00:00',pick_up_location:'Same address',drop_off_location:'Same address',pick_up_country_id:fixture.country,drop_off_country_id:fixture.country,pick_up_city_id:fixture.city,drop_off_city_id:fixture.city,mobile_leg_status:completed?'COMPLETED':'CONFIRMED'});
  await row('reservation_costs',{reservation_id:id,reservation_details_id:leg,status:1,base_rate:total,total_amount:total,optional_cost:0,total_tax:0,discount:0});
  if(paid)await row('reservation_payments',{reservation_id:id,payment_amount:paid,total_due:total,due_amount:Math.max(0,total-paid),payment_type:3,status:1,user_id:admin.id});
  return {id,leg};
 }
 const complete=await booking(330,300,true);
 const first=await Promise.all(Array.from({length:4},()=>refreshNativeBalancePayment(complete.id)));
 let sync=first[0];
 assert.ok(first.every(x=>x.payment.id===sync.payment.id));
 check(sync.payment.amount===30&&sync.payment.status==='DEFERRED','completed ride exposes only 30 outstanding after 300 already paid');
 const same=await Promise.all(Array.from({length:4},()=>refreshNativeBalancePayment(complete.id)));
 check(same.every(x=>x.payment.id===sync.payment.id)&&(await one('SELECT COUNT(*) AS n FROM app_payment_transactions WHERE reservation_id=?',[complete.id])).n===1,'concurrent refreshes reuse one balance payment');
 await query('UPDATE app_payment_transactions SET created_at=DATE_SUB(NOW(),INTERVAL 48 HOUR) WHERE id=?',[sync.payment.id]);
 let view=await api('get','/bookings/'+complete.id);check(view.paymentId===sync.payment.id&&view.canRetryPayment&&view.status==='COMPLETED','later charge after 48 hours uses existing booking response without reopening the ride');
 const dueList=await api('get','/bookings?status=UNPAID');check(dueList.items.some(b=>b.id===complete.id&&b.canRetryPayment),'completed reservation with a later bill appears in the existing UNPAID filter');
 await api('post',`/payments/${sync.payment.id}/retry`,{});
 await api('post',`/payments/${sync.payment.id}/mock-confirm`,{});
 view=await api('get','/bookings/'+complete.id);
 check(view.status==='COMPLETED'&&!view.canRetryPayment&&(await one('SELECT SUM(payment_amount) AS paid FROM reservation_payments WHERE reservation_id=?',[complete.id])).paid===330,'top-up settles in native ledger and preserves completed state');
 const unpaid=await booking(330);
 sync=await refreshNativeBalancePayment(unpaid.id);check(sync.payment.amount===330,'unpaid original 300 plus additional 30 collects 330');
 await query('UPDATE reservation_costs SET total_amount=360 WHERE reservation_id=?',[unpaid.id]);
 const changed=await refreshNativeBalancePayment(unpaid.id);check(changed.payment.id===sync.payment.id&&changed.payment.amount===360,'unattempted deferred amount updates in place after a native fare edit');
 await api('post',`/payments/${sync.payment.id}/retry`,{});
 await query('UPDATE reservation_costs SET total_amount=390 WHERE reservation_id=?',[unpaid.id]);
 view=await api('get','/bookings/'+unpaid.id);check(!view.canRetryPayment,'active provider attempt with an edited fare is blocked in existing customer payment action');
 let error=await api('post',`/payments/${sync.payment.id}/retry`,{},409);check(error.error.code==='PAYMENT_RECONCILIATION_REQUIRED','stale initialized amount never starts a second provider charge');
 const partial=await booking(330,100);
 await row('reservation_payments',{reservation_id:partial.id,custom_invoices:999,payment_amount:60,total_due:60,due_amount:0,payment_type:3,status:1,user_id:admin.id});
 sync=await refreshNativeBalancePayment(partial.id);check(sync.payment.amount===230,'partial payment is deducted while an unrelated custom invoice payment is excluded');
 await query('UPDATE reservation_details SET other_cost=50 WHERE id=?',[partial.leg]);
 check((await refreshNativeBalancePayment(partial.id)).payment.amount===230,'internal operating cost does not become a customer charge');
 const historical=await booking(300);await query('UPDATE reservations SET payment_status=20 WHERE id=?',[historical.id]);
 sync=await refreshNativeBalancePayment(historical.id);check(sync.blocked&&sync.reason==='NATIVE_PAYMENT_LEDGER_INCOMPLETE','historical paid flag without a native ledger blocks automatic rebilling');
 const nativeExtra=await row('reservation_details',{reservation_id:partial.id,is_extra_service:1,status:1,pick_up_date:'2027-09-01',pick_up_time:'10:00:00'});
 await row('reservation_costs',{reservation_id:partial.id,reservation_details_id:nativeExtra,status:1,base_rate:30,total_amount:30});
 view=await api('get','/bookings/'+partial.id);check(!view.legs.some(l=>l.id===nativeExtra)&&view.costs.some(c=>c.legId===nativeExtra),'native billable extra contributes to cost without becoming a trip leg');
 await api('post',`/operations/bookings/${partial.id}/legs/${nativeExtra}/assign-vehicle`,{vehicleId:fixture.vehicle},404,true);
 check(true,'fee-only native extra cannot receive a physical vehicle assignment');
 const feeBefore=await one('SELECT total_amount FROM reservation_costs WHERE reservation_details_id=?',[nativeExtra]);
 const fareBefore=await one('SELECT total_amount FROM reservation_costs WHERE reservation_details_id=?',[partial.leg]);
 await transaction(c=>applyApprovedBookingChange(c,{changeRequest:{reservation_id:partial.id,requested_changes:{notes:'Keep native billable extra'},previous_lifecycle_status:'PAYMENT_DUE'},actorUserId:admin.id}));
 check((await one('SELECT total_amount FROM reservation_costs WHERE reservation_details_id=?',[nativeExtra])).total_amount===feeBefore.total_amount,'notes-only repricing preserves native fee-only service rows');
 check((await one('SELECT total_amount FROM reservation_costs WHERE reservation_details_id=?',[partial.leg])).total_amount===fareBefore.total_amount,'notes-only approval preserves a native admin negotiated base fare');
 for(const paid of [0,100,300]){
  const changeCase=await booking(300,paid),pending=await refreshNativeBalancePayment(changeCase.id);
  const change=await api('post',`/bookings/${changeCase.id}/change-requests`,{reason:'Increase chauffeur hours',requestedChanges:{legs:[{detailId:changeCase.leg,requestedHours:3}]}},201);
  const decision=await api('post',`/operations/change-requests/${change.id}/decision`,{decision:'APPROVED',resolutionNote:'Native financial regression'},200,true);
  const actualTotal=(await one('SELECT SUM(total_amount) AS total FROM reservation_costs WHERE reservation_id=? AND status=1',[changeCase.id])).total;
  check(decision.paymentAdjustment.amount===actualTotal-paid&&decision.paymentAdjustment.paymentId&&decision.paymentAdjustment.clientSecret,`approved price increase collects full native outstanding balance with ${paid} already paid`);
  if(pending.payment)check(decision.paymentAdjustment.paymentId===pending.payment.id,'approved change reuses the untouched deferred attempt');
 }
 const manual=await booking(300),manualPayment=await refreshNativeBalancePayment(manual.id);
 await row('reservation_payments',{reservation_id:manual.id,payment_amount:300,total_due:300,due_amount:0,payment_type:3,status:1,user_id:admin.id});
 view=await api('get','/bookings/'+manual.id);check(!view.canRetryPayment&&view.status==='CONFIRMED'&&(await one('SELECT status FROM app_payment_transactions WHERE id=?',[manualPayment.payment.id])).status==='CANCELLED','full native bank payment closes an untouched mobile payment and confirms the booking');
 const coverage=await query('SELECT * FROM vehicle_cities WHERE vehicle_id=?',[fixture.vehicle]);
 await query("UPDATE vehicle_cities SET city_id=0,country=' de ' WHERE vehicle_id=?",[fixture.vehicle]);
 const countries=await api('get','/catalog/countries?serviceCode=CHAUFFEUR');check(countries.items.some(c=>c.id===fixture.country),'country discovery accepts native text-only country coverage');
 const classes=await api('get',`/catalog/vehicle-classes?serviceCode=CHAUFFEUR&countryId=${fixture.country}&startAt=2027-10-01T10:00:00Z&endAt=2027-10-01T12:00:00Z`);
 check(classes.items.some(c=>c.id===fixture.vehicleClass),'class search agrees with text-only native coverage');
 for(const c of coverage)await query('UPDATE vehicle_cities SET city_id=?,country=? WHERE id=?',[c.city_id,c.country,c.id]);
 const {stdout}=await promisify(execFile)(process.execPath,['scripts/diagnose-website-availability.mjs','--country-id',String(fixture.country),'--service-code','CHAUFFEUR','--start-at','2027-10-01T10:00:00Z','--end-at','2027-10-01T12:00:00Z'],{maxBuffer:2*1024*1024});
 const diagnosis=JSON.parse(stdout.slice(stdout.indexOf('{')));check(diagnosis.mobileClasses.some(c=>c.id===fixture.vehicleClass)&&diagnosis.candidates.some(c=>c.vehicleId===fixture.vehicle),'read-only diagnostic runs actual catalog and explains each native candidate');
 console.log(`NATIVE BALANCE AND AVAILABILITY INTEGRATION: ${checks} passed`);
} finally {await pool.end();}
