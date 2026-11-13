import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import mysql from 'mysql2/promise';
import request from 'supertest';
import app from '../src/app.js';
import {assertVehicleCapacity} from '../src/services/vehicle-capacity.js';
import {addMobileDriverExpense} from '../src/services/mobile-driver-expenses.js';
import {pool,query,one,transaction} from '../src/db/pool.js';
import {signAccessToken} from '../src/services/tokens.js';
import {applyNativeCoupon} from '../src/services/native-coupons.js';
import {computeQuoteBreakdown} from '../src/services/pricing-core.js';
import {availabilityDateParams,websiteVehiclePredicate,listAvailableVehicles} from '../src/services/vehicle-availability.js';
import {refreshNativeBalancePayment} from '../src/services/native-balance-payment.js';
import {syncNativeCommissions} from '../src/services/native-financials.js';
if(process.env.CLIENT_DB_TEST_DISPOSABLE!=='true')throw Error('Disposable exact-schema import required');
let checks=0;const check=(v,m)=>{assert.ok(v,m);checks++;console.log('PASS',m);};
const php=(input)=>{
 const result=spawnSync(process.env.PHP_CLI??'php',['-n',process.env.LEGACY_POLICY_RUNNER??'../website-backend/tests/shared-policy-runner.php'],{input:JSON.stringify(input),encoding:'utf8'});
 if(result.status!==0)throw Error('PHP verification failed: '+result.stderr);return JSON.parse(result.stdout);
};
async function row(table,input={}){
 const columns=await query('SELECT COLUMN_NAME,DATA_TYPE,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]),data={...input};
 for(const c of columns){if(c.COLUMN_NAME in data||c.IS_NULLABLE==='YES'||c.COLUMN_DEFAULT!==null||c.EXTRA.includes('auto_increment'))continue;
 data[c.COLUMN_NAME]=['int','bigint','tinyint','smallint','double','decimal','float'].includes(c.DATA_TYPE)?1:c.DATA_TYPE==='date'?'2027-10-01':c.DATA_TYPE==='time'?'10:00:00':['datetime','timestamp'].includes(c.DATA_TYPE)?'2027-10-01 10:00:00':c.DATA_TYPE==='enum'?c.COLUMN_TYPE.match(/'([^']+)'/)[1]:('enh-'+randomUUID()).slice(0,25);}
 const keys=Object.keys(data),r=await query(`INSERT INTO \`${table}\` (${keys.map(k=>'`'+k+'`').join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,Object.values(data));return r.insertId;
}
let raw;
try{
 const before=await query('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION');
 for(const serviceCode of ['CHAUFFEUR','CAR_RENTAL','TRANSFER']){
  for(const c of [{base:960,fee:0,discount:0,currency:'CHF',expectedTax:77.75,expectedTotal:1038},
    {base:470,fee:1503,discount:0,currency:'CHF',expectedTax:38.05,expectedTotal:2011},
    {base:100,fee:35,discount:20,currency:'EUR',expectedTax:6.48,expectedTotal:121},
    {base:10,fee:30,discount:20,currency:'CHF',expectedTax:0,expectedTotal:20}]){
    const native=php({action:'cost',cost:{base_rate:c.base,one_way_drop_off_charge:c.fee,discount:c.discount},rate:8.1,currency:c.currency});
    const mobile=computeQuoteBreakdown({serviceCode,rateAmount:c.base,rateIsTotal:true,durationDays:1,options:[],optionSelections:[],taxes:[{id:1,amount:8.1}],oneWayCharge:c.fee,discount:c.discount,currency:c.currency});
    check(native.total_tax===mobile.totalTax&&native.total_amount===mobile.total&&native.total_tax===c.expectedTax&&native.total_amount===c.expectedTotal,serviceCode+' PHP/Node exact tax and total parity '+c.base+'/'+c.fee+'/'+c.discount);
  }
 }
 for(const type of [1,2]){
  const native=php({action:'coupon',nets:[100,300],amount:30,type});
  const quote={currency:'CHF',legs:[100,300].map(base=>({lines:computeQuoteBreakdown({serviceCode:'TRANSFER',rateAmount:base,rateIsTotal:true,durationDays:1,options:[],optionSelections:[],taxes:[]})}))};
  applyNativeCoupon(quote,{id:1,coupon_code:'TEST',deduction_type:type,amount:30});
  assert.deepEqual(native,quote.__native.discounts);check(true,'fixed/percentage coupon allocation matches PHP and Node: type '+type);
 }
 check(php({action:'cost',cost:{base_rate:30},rate:8.1,currency:'CHF',extra:true}).total_tax===0,'native fee-only extras stay untaxed');
 const country=await row('countries',{code:'CH',name:'Policy Test Country',status:1});
 const availability=php({action:'availability',countryId:country,start:'2027-10-01 10:00:00',end:'2027-10-01 18:00:00'});
 assert.equal(availability.sql,websiteVehiclePredicate({withDates:true}));assert.deepEqual(availability.params,[1,country,...availabilityDateParams('2027-10-01T10:00:00Z','2027-10-01T18:00:00Z')]);check(true,'executed Laravel policy emits identical eligibility SQL and date binding order');
 const klass=await row('vehicle_classes',{rental_type:1,status:1});
 const vehicle=await row('vehicles',{vehicle_class_id:klass,status:1,online_booking_status:1,doa_fleet:null});
 await row('vehicle_service_types',{vehicle_id:vehicle,service_type:1});await row('vehicle_cities',{vehicle_id:vehicle,country:'CH'});
 const criteria={vehicleClassId:klass,countryId:country,startAt:'2027-10-01T10:00:00Z',endAt:'2027-10-01T18:00:00Z',serviceCode:'CHAUFFEUR'};
 check((await listAvailableVehicles(criteria)).length===1,'country coverage remains bookable without capacity metadata');
 await row('vehicle_dimensions',{vehicle_id:vehicle,seating_capacity:'2',boot_capacity:'1'});
 await assert.rejects(()=>assertVehicleCapacity(null,vehicle,6,0),{code:'VEHICLE_CAPACITY_EXCEEDED'});check(true,'known undersized physical vehicle is rejected during allocation');
 const block=await row('vehicle_blocks',{vehicle_id:vehicle,start_date:'2027-10-01',end_date:'2027-10-01',start_time:'17:00:00',end_time:'19:00:00'});
 check((await listAvailableVehicles(criteria)).length===0,'physical maintenance block excludes overlapping search');
 await query("UPDATE vehicle_blocks SET start_time='18:00:00' WHERE id=?",[block]);check((await listAvailableVehicles(criteria)).length===1,'touching timed block boundary is available');
 const busy=await row('reservations',{status:1,user_id:1});const busyLeg=await row('reservation_details',{reservation_id:busy,status:1,pick_up_date:'2027-10-01',drop_off_date:'2027-10-01',pick_up_time:'10:00:00',drop_off_time:'18:00:00'});
 await row('reservation_vehicles',{reservation_id:busy,reservation_details_id:busyLeg,vehicle_id:vehicle,status:1,pick_up_date:'2027-10-01',drop_off_date:'2027-10-01',pick_up_time:'10:00:00',drop_off_time:'18:00:00'});
 check((await listAvailableVehicles(criteria)).length===0,'active assignment excludes vehicle even when date ledger is missing');
 check((await listAvailableVehicles({...criteria,excludeReservationDetailId:busyLeg})).length===1,'existing leg can retain its own physical vehicle');
 await row('vehicle_reserved_dates',{reservation_id:busy,reservation_detail_id:busyLeg,vehicle_id:vehicle,reserved_date:'2027-10-01'});
 await query('UPDATE reservations SET status=3 WHERE id=?',[busy]);check((await listAvailableVehicles(criteria)).length===1,'cancelled parent does not retain stale ledger or active assignment holds');
 await query('UPDATE reservations SET status=1 WHERE id=?',[busy]);await query('UPDATE reservation_details SET status=0 WHERE id=?',[busyLeg]);check((await listAvailableVehicles(criteria)).length===1,'retired leg does not block current inventory');
 const good={orderId:'order-test',currency:'CHF',initialAmount:3000,refundedAmount:0,canceledAmount:0,transactions:[{type:'DEBIT',status:'SUCCESS',transactionId:'tx-1',currency:'CHF',initialAmount:3000}]};
 check(php({action:'receipt',order:good}).ok,'PayEngine successful server evidence accepted');
 for(const changed of [{...good,transactions:[]},{...good,transactions:[{...good.transactions[0],status:'PENDING'}]},{...good,transactions:[{...good.transactions[0],type:'PREAUTH'}]},{...good,initialAmount:100},{...good,currency:'EUR'},{...good,refundedAmount:100},{...good,transactions:[good.transactions[0],good.transactions[0]]}])check(!php({action:'receipt',order:changed}).ok,'unconfirmed or mismatching gateway evidence rejected');
 raw=await mysql.createConnection({host:process.env.DB_HOST??'127.0.0.1',port:Number(process.env.DB_PORT),user:process.env.DB_USER,password:process.env.DB_PASSWORD??'',database:process.env.DB_NAME,multipleStatements:true});
 await raw.query("SET NAMES utf8mb4 COLLATE utf8mb4_general_ci");
 const seed=fs.readFileSync(new URL('../sql/create-test-agent.workbench.sql',import.meta.url),'utf8');
 await raw.query(seed);const first=await one("SELECT id,password FROM users WHERE email='agent.qa@driveluxury.test'");
 const [[seedSession]]=await raw.query('SELECT COLLATION(@qa_email) AS emailCollation');
 check(seedSession.emailCollation==='utf8mb4_unicode_ci','Workbench seed overrides an incompatible session collation');
 await raw.query(seed);const second=await one("SELECT COUNT(*) AS n,MIN(id) AS id,MIN(password) AS password FROM users WHERE email='agent.qa@driveluxury.test'");
 check(second.n===1&&first.id===second.id&&first.password===second.password,'Workbench script is repeatable and never resets an existing test password');
 let login=await request(app).post('/api/v1/auth/login').send({email:'agent.qa@driveluxury.test',password:'DriveLuxury-QA-2026!'});assert.equal(login.status,200,JSON.stringify(login.body));check(true,'Workbench-created agent authenticates through real login API');
 const qa=await one(`SELECT a.id AS agentId,a.agency_id AS agencyId,c.id AS customerId
   FROM agents a JOIN users u ON u.id=a.user_id
   JOIN app_agent_customer_assignments aca ON aca.agent_id=a.id AND aca.status='ACTIVE'
   JOIN customers c ON c.id=aca.customer_id AND c.deleted_at IS NULL
   WHERE u.email='agent.qa@driveluxury.test' AND aca.agency_id=a.agency_id`);
 const agentRequest=(method,path,body)=>request(app)[method]('/api/v1'+path)
   .set('Authorization','Bearer '+login.body.tokens.accessToken).send(body);
 const roster=await agentRequest('get','/agent/clients');
 assert.equal(roster.status,200,JSON.stringify(roster.body));
 check(roster.body.items.some(item=>Number(item.id)===Number(qa.customerId)),'Workbench agent receives a ready-to-book assigned test client');
 const draft=await agentRequest('post','/bookings/drafts',{serviceCode:'CHAUFFEUR',customerId:qa.customerId});
 assert.equal(draft.status,201,JSON.stringify(draft.body));check(Boolean(draft.body.id),'test agent can create a client booking draft');
 const agentBooking=await row('reservations',{customer_id:qa.customerId,agency_id:qa.agencyId,user_id:first.id,status:1,payment_status:20,currency:'CHF',service_type:1,uuid:randomUUID(),created_by_agent_id:qa.agentId});
 const agentLeg=await row('reservation_details',{reservation_id:agentBooking,status:1,is_extra_service:0,pick_up_country_id:country,drop_off_country_id:country,pick_up_date:'2027-10-02',drop_off_date:'2027-10-02'});
 await row('reservation_costs',{reservation_id:agentBooking,reservation_details_id:agentLeg,base_rate:1100,discount:100,total_amount:1081,status:1});
 await transaction(connection=>syncNativeCommissions(connection,agentBooking,first.id));
 const agentDashboard=await agentRequest('get','/agent/dashboard');
 assert.equal(agentDashboard.status,200,JSON.stringify(agentDashboard.body));
 check(agentDashboard.body.clients===1&&agentDashboard.body.activeBookings===1,'agent dashboard reports assigned clients and all active agency bookings');
 check(Number(agentDashboard.body.commission.dueAmount)===100&&Number(agentDashboard.body.commission.paidAmount)===0,'agent dashboard commission matches legacy net-base agency formula');
 const agentCommissions=await agentRequest('get','/agent/commissions');
 assert.equal(agentCommissions.status,200,JSON.stringify(agentCommissions.body));
 check(agentCommissions.body.items.some(item=>Number(item.reservationId)===Number(agentBooking)&&Number(item.commissionAmount)===100),'agent commission list reads the active legacy commission row');
 const admin=await row('users',{user_name:randomUUID(),email:randomUUID()+'@policy.test',role:1,status:0});const client=await row('users',{user_name:randomUUID(),email:randomUUID()+'@policy.test',role:5,status:0});
 const customer=await row('customers',{user_id:client,uuid:randomUUID(),created_by:admin,status:1});
 const id=await row('reservations',{customer_id:customer,user_id:admin,status:2,payment_status:20,currency:'CHF',service_type:1,uuid:randomUUID()});
 const leg=await row('reservation_details',{reservation_id:id,status:1,is_extra_service:0,pick_up_country_id:country,drop_off_country_id:country,pick_up_date:'2027-10-01',drop_off_date:'2027-10-01'});
 await row('reservation_costs',{reservation_id:id,reservation_details_id:leg,base_rate:100,total_amount:100,status:1});await row('reservation_payments',{reservation_id:id,total_due:100,payment_amount:100,due_amount:0,status:1,user_id:admin});
 const auth={admin:signAccessToken({id:admin,role:1}),client:signAccessToken({id:client,role:5})};
 async function api(method,path,body,status=200,who='admin',key=randomUUID()){
  const r=await request(app)[method]('/api/v1'+path).set('Authorization','Bearer '+auth[who]).set('Idempotency-Key',key).send(body);
  assert.equal(r.status,status,path+': '+JSON.stringify(r.body));return r.body;
 }
 const key=randomUUID();const charge=await api('post',`/operations/bookings/${id}/customer-charges`,{title:'Parking after service',amount:30},201,'admin',key);
 check(charge.amount===30&&charge.tax===0,'explicit admin fee writes untaxed native cost');
 const again=await api('post',`/operations/bookings/${id}/customer-charges`,{title:'Parking after service',amount:30},200,'admin',key);check(again.reused&&again.chargeLegId===charge.chargeLegId,'retry cannot duplicate a customer charge');
 await api('post',`/operations/bookings/${id}/customer-charges`,{title:'Different amount',amount:35},409,'admin',key);
 await api('post',`/operations/bookings/${id}/customer-charges`,{title:'Unauthorized fee',amount:30},403,'client');check(true,'charge key conflicts and customer billing attempts are rejected');
 const view=await api('get',`/bookings/${id}/payment-breakdown`,undefined,200,'client');check(view.summary.total===130&&view.summary.paid===100&&view.summary.amountDue===30&&view.payment.canPay,'customer sees only new 30 balance after original 100 payment');
 const driver=await row('drivers',{full_name:'Expense Chauffeur'});const rd=await row('reservation_drivers',{reservation_id:id,reservation_details_id:leg,pick_up_driver_id:driver,status:1,user_id:admin});
 await api('get',`/bookings/${id}`,undefined,200,'client');
 const assignment=await one('SELECT id FROM app_mobile_assignment_ids WHERE reservation_driver_id=? AND current_slot=1',[rd]);
 const submitted=await transaction(c=>addMobileDriverExpense(c,{reservationId:id,assignmentId:assignment.id,driverId:driver,category:'PARKING',amount:25,currency:'CHF',incurredAt:'2027-10-01 10:00:00'}));
 const expense=submitted.insertId;
 await api('post',`/operations/bookings/${id}/customer-charges`,{title:'Driver parking',amount:25,expenseId:expense},409);
 await api('patch',`/operations/expenses/${expense}`,{status:'APPROVED'});
 const unchanged=await api('get',`/bookings/${id}/payment-breakdown`,undefined,200,'client');check(unchanged.summary.amountDue===30,'driver reimbursement approval alone does not bill customer');
 await api('post',`/operations/bookings/${id}/customer-charges`,{title:'Driver parking',amount:25,expenseId:expense},201);
 await api('post',`/operations/bookings/${id}/customer-charges`,{title:'Driver parking',amount:25,expenseId:expense},409);check(true,'approved driver expense can be billed only once across different request keys');
 await query("INSERT INTO activity_logs(subject_type,subject_id,feature_name,action,new_values,created_at) VALUES ('Reservation',?,'website_payment','created','{}',NOW())",[id]);
 check((await refreshNativeBalancePayment(id,client)).blocked,'unresolved website order disables simultaneous app payment');
 const pendingView=await api('get',`/bookings/${id}/payment-breakdown`,undefined,200,'client');check(!pendingView.payment.canPay,'payment breakdown disables Pay while website order is unresolved');
 const after=await query('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION');assert.deepEqual(before,after);check(true,'policy, charges and test-agent setup leave schema unchanged');
 console.log('SHARED POLICY INTEGRATION:',checks,'checks passed');
}finally{if(raw)await raw.end();await pool.end();}
