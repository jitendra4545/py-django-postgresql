// Uses only an existing disposable import of the client's exact schema.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import request from 'supertest';
import {Server} from 'socket.io';
import {io as connectSocket} from 'socket.io-client';
import app from '../src/app.js';
import {pool,query,one} from '../src/db/pool.js';
import {signAccessToken,signRefreshToken,tokenHash} from '../src/services/tokens.js';
import {hashPassword} from '../src/services/passwords.js';
import {createNativeChatStream} from '../src/services/native-chat-stream.js';
import {registerSocketServer} from '../src/services/realtime.js';
import {draftFingerprint} from '../src/services/booking-service.js';
import {computeQuoteBreakdown} from '../src/services/pricing-core.js';
if(process.env.CLIENT_DB_TEST_DISPOSABLE!=='true')throw Error('Only run on a disposable imported schema');
let checks=0,io,server;const sockets=[];
const check=(v,m)=>{assert.ok(v,m);checks++;console.log('PASS',m);};
async function row(table,input={}){
 const columns=await query('SELECT COLUMN_NAME,DATA_TYPE,COLUMN_TYPE,IS_NULLABLE,COLUMN_DEFAULT,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[table]),data={...input};
 for(const c of columns){if(c.COLUMN_NAME in data||c.IS_NULLABLE==='YES'||c.COLUMN_DEFAULT!==null||c.EXTRA.includes('auto_increment'))continue;
 data[c.COLUMN_NAME]=['int','bigint','tinyint','smallint','double','decimal','float'].includes(c.DATA_TYPE)?1:c.DATA_TYPE==='date'?'2027-10-01':c.DATA_TYPE==='time'?'10:00:00':['datetime','timestamp'].includes(c.DATA_TYPE)?'2027-10-01 10:00:00':c.DATA_TYPE==='enum'?c.COLUMN_TYPE.match(/'([^']+)'/)[1]:('enh-'+randomUUID()).slice(0,25);}
 const keys=Object.keys(data),r=await query(`INSERT INTO \`${table}\` (${keys.map(k=>'`'+k+'`').join(',')}) VALUES (${keys.map(()=>'?').join(',')})`,Object.values(data));return r.insertId;
}
const accounts={};let hash;
async function account(name,role,agencyId){
 const email=name+'-'+randomUUID()+'@enhancements.test';const userId=await row('users',{user_name:email,email,full_name:name,password:hash,role,status:0});
 const type={5:'customers',3:'drivers',4:'agents'}[role];let profileId;
 if(type)profileId=await row(type,{user_id:userId,full_name:name,...(role===5?{uuid:randomUUID(),created_by:userId,email,phone_no:'+919999999999',status:1,is_registered:1}:{}),...(role===4?{agency_id:agencyId,created_by:userId,agent_type:1}:{})});
 const value={userId,profileId,role,email,token:signAccessToken({id:userId,role})};accounts[name]=value;return value;
}
async function api(method,path,body,expected=200,who='client'){
 const r=await request(app)[method]('/api/v1'+path).set('Authorization','Bearer '+accounts[who].token).set('Idempotency-Key',randomUUID()).send(body).timeout({deadline:12000});
 assert.equal(r.status,expected,path+': '+JSON.stringify(r.body));return r.body;
}
async function booking(customerId,total=100,status=1,service=1){
 const id=await row('reservations',{uuid:randomUUID(),reservation_no:'ENH-'+randomUUID(),customer_id:customerId,service_type:service,user_id:accounts.admin.userId,currency:'CHF',status,payment_status:0});
 const leg=await row('reservation_details',{reservation_id:id,status:1,is_extra_service:0,days:service===1?8:1,pick_up_date:'2027-10-01',drop_off_date:'2027-10-01',pick_up_time:'10:00:00',drop_off_time:'18:00:00',pick_up_location:'Geneva Airport',drop_off_location:'Geneva Center'});
 await row('reservation_costs',{reservation_id:id,reservation_details_id:leg,status:1,base_rate:total,total_amount:total,total_tax:0,optional_cost:0,discount:0});return {id,leg};
}
const connect=async(name)=>{
 const socket=connectSocket('http://127.0.0.1:'+server.address().port,{transports:['websocket'],auth:{accessToken:accounts[name].token},reconnection:false,forceNew:true});sockets.push(socket);
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('socket connection timeout')),4000);socket.once('connect',()=>{clearTimeout(timer);resolve();});socket.once('connect_error',e=>{clearTimeout(timer);reject(e);});});return socket;
};
const join=(socket,input)=>new Promise((resolve,reject)=>socket.timeout(4000).emit('conversation.join',input,(error,result)=>error?reject(error):resolve(result)));
try{
 const before=await query('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION');
 hash=await hashPassword('Test-passphrase-123');
 await account('admin',1);await account('client',5);await account('driver1',3);await account('driver2',3);await account('outsider',3);
 const agency=await row('agencies',{status:1});await account('agent',4,agency);
 const b=await booking(accounts.client.profileId);
 const conv=await api('post',`/communication/bookings/${b.id}/conversation`,{},201);
 const sent=await api('post',`/communication/conversations/${conv.id}/messages`,{text:'Client text alias'},201);
 check(sent.body==='Client text alias'&&sent.messageType==='TEXT'&&!('text'in sent),'text input works while original message response keys remain unchanged');
 await api('get',`/communication/conversations/${conv.id}/messages`,undefined,403,'outsider');
 const rd=await row('reservation_drivers',{reservation_id:b.id,reservation_details_id:b.leg,pick_up_driver_id:accounts.driver1.profileId,status:1,user_id:accounts.admin.userId});
 const inbox=await api('get','/communication/conversations',undefined,200,'driver1');check(inbox.items.some(c=>c.id===conv.id),'driver added after chat creation automatically discovers existing conversation');
 check((await api('get',`/communication/conversations/${conv.id}/messages`,undefined,200,'driver1')).items.some(m=>m.id===sent.id),'new chauffeur can read native booking messages');
 const concurrent=await Promise.all([1,2,3].map(()=>api('post',`/communication/bookings/${b.id}/conversation`,{},201)));
 check(concurrent.every(c=>c.id===conv.id),'concurrent conversation opens reuse one existing identity');
 const a=await api('post',`/communication/conversations/${conv.id}/messages`,{body:'First same-second reply'},201,'driver1');
 const c=await api('post',`/communication/conversations/${conv.id}/messages`,{body:'Second same-second reply'},201,'driver1');
 await query("UPDATE reservation_messages SET created_at='2026-11-12 12:00:00' WHERE mobile_message_id IN (?,?)",[a.id,c.id]);
 await api('post',`/communication/conversations/${conv.id}/read`,{lastMessageId:a.id},204);
 const receipt=await one('SELECT mr.read_at FROM reservation_message_recipients mr JOIN reservation_messages m ON m.id=mr.reservation_message_id WHERE m.mobile_message_id=? AND mr.user_id=?',[c.id,accounts.client.userId]);
 check(receipt.read_at===null,'read boundary does not consume later message with identical timestamp');
 await query('UPDATE reservation_drivers SET pick_up_driver_id=? WHERE id=?',[accounts.driver2.profileId,rd]);
 await api('get',`/communication/conversations/${conv.id}/messages`,undefined,403,'driver1');
 await api('post',`/communication/conversations/${conv.id}/messages`,{text:'No access'},403,'driver1');
 check((await api('get','/communication/conversations',undefined,200,'driver2')).items.some(c=>c.id===conv.id),'replacement chauffeur gains access and previous chauffeur loses read/send access');
 await query('UPDATE reservation_drivers SET pick_up_driver_id=? WHERE id=?',[accounts.driver1.profileId,rd]);
 check((await api('get','/communication/conversations',undefined,200,'driver1')).items.some(c=>c.id===conv.id),'reassigned returning chauffeur is restored from left_at membership');
 await query('UPDATE reservations SET agency_id=? WHERE id=?',[agency,b.id]);await query('UPDATE customers SET agency_id=? WHERE id=?',[agency,accounts.client.profileId]);
 const agentLink=await row('app_agent_customer_assignments',{agent_id:accounts.agent.profileId,customer_id:accounts.client.profileId,agency_id:agency,status:'ACTIVE',assigned_by_user_id:accounts.admin.userId,assigned_at:new Date()});
 check((await api('get','/communication/conversations',undefined,200,'agent')).items.some(c=>c.id===conv.id),'assigned agency agent joins existing conversation');
 await query("UPDATE app_agent_customer_assignments SET status='INACTIVE' WHERE id=?",[agentLink]);await api('get',`/communication/conversations/${conv.id}/messages`,undefined,403,'agent');check(true,'revoked agent assignment immediately loses chat access');
 server=http.createServer(app);io=new Server(server);registerSocketServer(io);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const clientSocket=await connect('client'),oldSocket=await connect('driver1');
 check((await join(clientSocket,{conversationId:conv.id})).ok&&(await join(oldSocket,conv.id)).ok,'socket accepts token alias and both documented join payload forms');
 const pollNative=createNativeChatStream();await pollNative();
 const nativeReceived=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('native message event timeout')),4000);clientSocket.once('message.created',m=>{clearTimeout(timer);resolve(m);});});
 const nativeId=await row('reservation_messages',{reservation_id:b.id,sender_id:accounts.admin.userId,body:'Admin portal message',created_at:new Date()});
 await pollNative();const nativeMessage=await nativeReceived;
 check(nativeMessage.id===nativeId&&nativeMessage.body==='Admin portal message','Laravel-native admin message is relayed through existing socket message event');
 const wrongSocket=await connect('outsider');check(!(await join(wrongSocket,conv.id)).ok,'unrelated chauffeur cannot join booking room');
 let leaked=false;oldSocket.on('message.created',()=>{leaked=true;});
 await query('UPDATE reservation_drivers SET pick_up_driver_id=? WHERE id=?',[accounts.driver2.profileId,rd]);
 const got=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('message event timeout')),4000);clientSocket.once('message.created',m=>{clearTimeout(timer);resolve(m);});});
 const live=await api('post',`/communication/conversations/${conv.id}/messages`,{text:'Live authorized update'},201);
 check((await got).id===live.id&&!leaked,'live message reaches current room and cannot leak to reassigned driver socket');
 const newSocket=await connect('driver2');check((await join(newSocket,{conversationId:conv.id})).ok,'new chauffeur joins room without recreating conversation');
 // Three service cost displays, with snapshot ownership/version checks.
 for(const [serviceCode,base,unitCount,collection] of [['CHAUFFEUR',960,8,0],['CAR_RENTAL',470,1,1503],['TRANSFER',200,1,0]]){
  const draft=await row('app_booking_drafts',{created_by_user_id:accounts.client.userId,customer_id:accounts.client.profileId,service_code:serviceCode,status:'QUOTED',details:'{}',revision:1,expires_at:'2027-12-31 00:00:00'});
  const stored=await one('SELECT * FROM app_booking_drafts WHERE id=?',[draft]);
  const lines=computeQuoteBreakdown({serviceCode,rateAmount:base,rateIsTotal:true,currency:'CHF',durationDays:1,options:[],optionSelections:[],taxes:[{id:1,title:'VAT',amount:8.1}],oneWayCharge:collection});
  const quote={currency:'CHF',total:lines.total,__native:{taxPolicy:'BASE_FEE_ONLY_V1'},legs:[{billableHours:unitCount,billableUnits:unitCount,durationDays:1,isPickupAndCollection:collection>0,lines}]};
  const snapshot=await row('app_quote_snapshots',{draft_id:draft,draft_revision:1,request_hash:draftFingerprint(stored),currency:'CHF',total_amount:lines.total,quote_data:JSON.stringify(quote),valid_until:'2027-12-31 00:00:00'});
  await query('UPDATE app_booking_drafts SET quote_snapshot_id=? WHERE id=?',[snapshot,draft]);
  const breakdown=await api('get',`/bookings/drafts/${draft}/payment-breakdown`);
  check(breakdown.sections[0].rate.unit==={CHAUFFEUR:'HOUR',CAR_RENTAL:'DAY',TRANSFER:'TRIP'}[serviceCode]&&breakdown.summary.total===lines.total,'draft cost information follows '+serviceCode+' calculation');
  if(serviceCode==='CHAUFFEUR')check(breakdown.sections[0].rate.unitAmount===120&&breakdown.sections[0].totals.tax===77.75&&breakdown.summary.total===1038,'chauffeur screenshot amounts reconcile exactly');
  if(serviceCode==='CAR_RENTAL')check(breakdown.summary.total===2011&&breakdown.sections[0].tax.amount===38.05,'rental collection remains separate from taxable base');
  await api('get',`/bookings/drafts/${draft}/payment-breakdown`,undefined,403,'agent');
 }
 const rental=await row('vehicle_classes',{title:'Rental example',rental_type:2,status:1,half_insurance_amount:0,half_insurance_text_en:'Included half coverage',full_insurance_amount:35,full_insurance_text_en:'Full coverage'});
 const extra=await row('rental_options',{title:'Child seat',title_en:'Child seat',rent_type:1,show_on_frontend:1,based_on:1,amount:6});await row('rental_option_classes',{rental_option_id:extra,vehicle_class_id:rental});
 const selection=await api('get',`/catalog/vehicle-classes/${rental}/booking-options?serviceCode=CAR_RENTAL`);
 check(selection.options.some(o=>o.id===extra)&&selection.defaultInsuranceType==='HALF'&&selection.insuranceChoices.some(i=>i.type==='FULL'&&i.unitAmount===35),'class extras and class-based insurance are distinct dynamic choices');
 const native=await booking(accounts.client.profileId,470,2,2);await query('UPDATE reservation_costs SET one_way_drop_off_charge=1503,total_tax=38.05,total_amount=2011 WHERE reservation_id=?',[native.id]);
 await row('reservation_payments',{reservation_id:native.id,status:1,total_due:2011,payment_amount:2000,due_amount:11,payment_type:3,user_id:accounts.admin.userId});
 const fee=await row('reservation_details',{reservation_id:native.id,status:1,is_extra_service:1,service_details:'Late parking',pick_up_date:'2027-10-02'});await row('reservation_costs',{reservation_id:native.id,reservation_details_id:fee,status:1,base_rate:50,total_amount:50,total_tax:0});
 const current=await api('get',`/bookings/${native.id}/payment-breakdown`);check(current.sections.some(s=>s.isExtraService&&s.title==='Late parking')&&current.summary.total===2061&&current.summary.paid===2000&&current.summary.amountDue===61,'recorded booking details include named later expense and actual remaining balance');
 // Account deletion uses real existing schema and prevents access afterward.
 await api('delete',`/operations/clients/${accounts.client.profileId}`,{confirm:true},403,'driver1');
 await api('delete','/auth/account',{confirm:true,password:'Incorrect'},401,'client');
 await api('delete','/auth/account',{confirm:false,password:'Test-passphrase-123'},422,'client');
 const blocked=await api('delete',`/operations/clients/${accounts.client.profileId}`,{confirm:true},409,'admin');check(blocked.error.code==='ACCOUNT_HAS_ACTIVE_BOOKINGS','active client booking blocks deletion');
 const blockedDriver=await api('delete',`/operations/chauffeurs/${accounts.driver2.profileId}`,{confirm:true},409,'admin');check(blockedDriver.error.code==='ACCOUNT_HAS_ACTIVE_ASSIGNMENTS','active chauffeur must be reassigned before deletion');
 const refreshId=randomUUID(),refresh=signRefreshToken(refreshId,accounts.client.userId);
 await row('app_refresh_tokens',{id:refreshId,user_id:accounts.client.userId,token_hash:tokenHash(refresh),expires_at:'2027-12-31 00:00:00'});
 await row('app_user_devices',{user_id:accounts.client.userId,device_id:'enhancement-device',platform:'ANDROID',push_token:'fake-test-token'});
 const invite=await row('app_account_invitations',{user_id:accounts.client.userId,email:accounts.client.email,token_hash:tokenHash('test-invite'),expires_at:'2027-12-31 00:00:00',created_by_user_id:accounts.admin.userId});
 await query('UPDATE reservations SET status=2 WHERE id=?',[b.id]);
 const recordCount=(await one('SELECT COUNT(*) AS n FROM reservations WHERE customer_id=?',[accounts.client.profileId])).n;
 const deleted=await api('delete','/auth/account',{confirm:true,password:'Test-passphrase-123'});
 check(deleted.deleted&&(await one('SELECT deleted_at FROM users WHERE id=?',[accounts.client.userId])).deleted_at,'client self deletion marks native user and profile deleted');
 await api('get','/client/profile',undefined,401,'client');
 check((await one('SELECT revoked_at FROM app_refresh_tokens WHERE id=?',[refreshId])).revoked_at&&(await one('SELECT push_token FROM app_user_devices WHERE user_id=?',[accounts.client.userId])).push_token===null,'deletion revokes refresh sessions and push tokens');
 check((await one('SELECT accepted_at FROM app_account_invitations WHERE id=?',[invite])).accepted_at,'outstanding invitation cannot reactivate deleted account');
 check((await one('SELECT COUNT(*) AS n FROM reservations WHERE customer_id=?',[accounts.client.profileId])).n===recordCount&&(await one('SELECT payment_amount FROM reservation_payments WHERE reservation_id=?',[native.id])).payment_amount===2000,'deletion preserves native booking and receipt history');
 const driverDeleted=await api('delete','/auth/account',{confirm:true,password:'Test-passphrase-123'},200,'outsider');check(driverDeleted.deleted,'chauffeur can delete own idle account');
 const agentDeleted=await api('delete','/auth/account',{confirm:true,password:'Test-passphrase-123'},200,'agent');check(agentDeleted.deleted&&(await one('SELECT deleted_at FROM agencies WHERE id=?',[agency])).deleted_at===null,'agent can delete own account without deleting shared agency');
 check(!clientSocket.connected||await new Promise(resolve=>{clientSocket.once('disconnect',()=>resolve(true));setTimeout(()=>resolve(!clientSocket.connected),200);}), 'account deletion disconnects live authenticated socket');
 const adminDelete=await api('delete',`/operations/chauffeurs/${accounts.driver1.profileId}`,{confirm:true},200,'admin');check(adminDelete.deleted,'administrator can delete an idle chauffeur by profile ID');
 const after=await query('SELECT TABLE_NAME,COLUMN_NAME,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION');assert.deepEqual(before,after);check(true,'all enhancements leave every existing table and column unchanged');
 console.log(`MOBILE ENHANCEMENTS INTEGRATION: ${checks} checks passed`);
}finally{
 for(const socket of sockets)socket.disconnect();
 if(io)await new Promise(resolve=>io.close(resolve));
 else if(server)await new Promise(resolve=>server.close(resolve));
 await pool.end();
}
