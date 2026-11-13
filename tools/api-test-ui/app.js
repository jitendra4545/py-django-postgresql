/** Local-only interactive API lab, no credentials persisted in storage. */
const $=id=>document.getElementById(id);
const state={token:'',profile:null,draftId:null,reservationId:null,assignmentId:null,expenseId:null,incidentId:null};
const body=(fields)=>JSON.stringify(fields);
const getNumber=(id)=>{const n=Number($(id).value);if(!Number.isSafeInteger(n)||n<=0)throw Error(`Enter a valid positive ${id.replaceAll('-',' ')}.`);return n;};
const optionalNumber=(id)=>$(id).value.trim()?getNumber(id):undefined;
const dateIso=(id)=>{const raw=$(id).value;if(!raw)throw Error(`Enter ${id.replaceAll('-',' ')}.`);return new Date(raw).toISOString();};
const escapeSegment=value=>encodeURIComponent(String(value));
const pretty=result=>JSON.stringify(result,null,2);
function setTab(tab){
  document.querySelectorAll('.pane').forEach(p=>p.classList.toggle('active',p.id===tab));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  $('current-tab').textContent=tab.toUpperCase().replaceAll('-',' ');
  window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('[data-tab]').forEach(el=>el.addEventListener('click',()=>setTab(el.dataset.tab)));
document.querySelectorAll('[data-open]').forEach(el=>el.addEventListener('click',()=>setTab(el.dataset.open)));
function showError(error){$('response-meta').textContent='Request error';$('response-output').textContent=error.message||String(error);}
function resultLine({method,path,status,duration,ok}){
  $('response-meta').textContent=`${method} ${path} · ${status} · ${duration}ms ${ok?'✓':'✕'}`;
}
async function api(method,path,payload=null,{auth=true,headers={}}={}){
  if (!(path==='/health'||path.startsWith('/api/v1/')) || path.includes('://')) throw Error('Use a local API path beginning with /api/v1/ or /health.');
  const h={Accept:'application/json',...headers};
  if(auth&&state.token)h.Authorization=`Bearer ${state.token}`;
  if(payload!==null)h['Content-Type']='application/json';
  const start=performance.now();
  let response;
  try{response=await fetch('/api-proxy'+path,{method,headers:h,body:payload===null?undefined:body(payload)});}catch(err){throw Error('Local test server is unavailable: '+err.message);}
  const elapsed=Math.round(performance.now()-start);
  const raw=await response.text();
  let data;try{data=JSON.parse(raw);}catch{data={raw}};
  resultLine({method,path,status:response.status,duration:elapsed,ok:response.ok});
  $('response-output').textContent=pretty(data);
  if(!response.ok)throw Error(`HTTP ${response.status}: ${data.message??data.error??data.code??raw.slice(0,200)}`);
  return data;
}
function action(id,fn){$(id).addEventListener('click',async()=>{
  const button=$(id);button.disabled=true;const original=button.textContent;button.textContent='Working…';
  try{await fn();}catch(error){showError(error);}finally{button.disabled=false;button.textContent=original;if(id==='checkout-draft'&&!$('allow-checkout').checked)button.disabled=true;}
});}
$('login-form').addEventListener('submit',async(e)=>{
  e.preventDefault();
  try{
    const data=await api('POST','/api/v1/auth/login',{email:$('email').value,password:$('password').value},{auth:false});
    if(!data.tokens?.accessToken)throw Error('Login returned no access token.');
    state.token=data.tokens.accessToken;state.profile=data.user;
    $('password').value='';$('access-token').value='';
    $('auth-message').className='inline-message ok';$('auth-message').textContent=`Signed in as ${data.user?.fullName||data.user?.email||'account'}`;
    $('user-pill').textContent=`${data.user?.roleName||'Authenticated'} · ${data.user?.email||''}`;
  }catch(error){$('auth-message').className='inline-message error';$('auth-message').textContent=error.message;}
});
action('apply-token',async()=>{
  const token=$('access-token').value.trim().replace(/^Bearer\s+/i,'');
  if(!token)throw Error('Paste an access token first.');
  state.token=token;state.profile=null;$('access-token').value='';
  $('user-pill').textContent='Bearer token active';
  $('auth-message').className='inline-message ok';$('auth-message').textContent='Token loaded in memory. Test /auth/me to confirm its role.';
  try{const me=await api('GET','/api/v1/auth/me');$('user-pill').textContent=(me.user?.roleName||me.roleName||'Authenticated')+' · Token';}catch{/* Ignore a non-JSON diagnostic response. */}
});
action('clear-token',async()=>{state.token='';state.profile=null;$('password').value='';$('access-token').value='';$('user-pill').textContent='No session';$('auth-message').textContent='Token cleared';$('auth-message').className='inline-message';});
async function health(){try{await api('GET','/health',null,{auth:false});$('health-dot').className='dot up';$('health-text').textContent='Local backend online';}catch(error){$('health-dot').className='dot down';$('health-text').textContent='Backend unavailable';showError(error);}}
action('check-health',health);
action('load-services',async()=>{
  const data=await api('GET','/api/v1/catalog/services',null,{auth:false});
  const grid=$('services-list');grid.replaceChildren();
  if(!data.items?.length){const empty=document.createElement('div');empty.className='empty';empty.textContent='No service records returned. Check the services table.';grid.append(empty);return;}
  data.items.forEach(s=>{
    const b=document.createElement('button');b.className='service-card';
    const code=document.createElement('span');code.className='service-kicker';code.textContent=s.code??'UNMAPPED';
    const title=document.createElement('strong');title.textContent=s.title??'Untitled';
    const p=document.createElement('p');p.textContent=s.description??'No description';
    const meta=document.createElement('small');meta.textContent=`${s.bookingMode??'—'} · ID ${s.legacyServiceId??'—'}`;
    b.append(code,title,p,meta);
    b.addEventListener('click',()=>{if(['CHAUFFEUR','TRANSFER','CAR_RENTAL'].includes(s.code)){$('service-code').value=s.code;setTab('bookings');}});
    grid.append(b);
  });
});
action('load-countries',()=>api('GET','/api/v1/catalog/countries',null,{auth:false}));
action('load-classes',()=>api('GET',`/api/v1/catalog/vehicle-classes?serviceCode=${encodeURIComponent($('service-code').value)}&countryId=${getNumber('catalog-country-id')}`,null,{auth:false}));
action('create-draft',async()=>{
  const payload={serviceCode:$('service-code').value};const customerId=optionalNumber('customer-id');if(customerId)payload.customerId=customerId;
  const d=await api('POST','/api/v1/bookings/drafts',payload);
  state.draftId=d.id;$('draft-id').value=d.id;$('draft-id-label').textContent=d.id;
});
action('save-details',async()=>{
  const id=getNumber('draft-id');let details;
  try{details=JSON.parse($('draft-details').value);}catch(error){throw Error('Draft details must be valid JSON: '+error.message);}
  await api('PUT',`/api/v1/bookings/drafts/${id}/details`,details);
});
action('quote-draft',async()=>{await api('POST',`/api/v1/bookings/drafts/${getNumber('draft-id')}/quote`,{});});
$('allow-checkout').addEventListener('change',e=>{$('checkout-draft').disabled=!e.target.checked;});
action('checkout-draft',async()=>{
  if(!$('allow-checkout').checked)throw Error('Staging environment confirmation is required.');
  if(!confirm('Checkout writes a booking and creates a payment intent. Continue in STAGING only?'))return;
  const d=await api('POST',`/api/v1/bookings/drafts/${getNumber('draft-id')}/checkout`,{},
    {headers:{'Idempotency-Key':crypto.randomUUID()}});
  state.reservationId=d.bookingId;$('reservation-id').value=d.bookingId;$('ops-booking-id').value=d.bookingId;
});
action('list-bookings',()=>api('GET','/api/v1/bookings?page=1&perPage=20'));
action('view-booking',async()=>{
  const id=getNumber('reservation-id');const d=await api('GET',`/api/v1/bookings/${escapeSegment(id)}`);
  $('booking-summary').textContent=`${d.reservationNo??'Reservation'} · ${d.status??'—'}\nLegs: ${d.legs?.length??0} · Events: ${d.events?.length??0} · Assignments: ${d.assignments?.length??0}`;
  state.reservationId=id;$('ops-booking-id').value=id;
  if(d.legs?.[0]?.id)$('ops-leg-id').value=d.legs[0].id;
  if(d.assignments?.[0]?.id){$('driver-assignment').value=d.assignments[0].id;state.assignmentId=d.assignments[0].id;}
});
action('view-tracking',()=>api('GET',`/api/v1/bookings/${getNumber('reservation-id')}/tracking`));
action('driver-dashboard',()=>api('GET','/api/v1/chauffeur/dashboard'));
action('fetch-assignment',async()=>{
  const id=getNumber('driver-assignment');const d=await api('GET',`/api/v1/chauffeur/assignments/${id}`);
  $('assignment-summary').textContent=`${d.reservation_no??'Reservation'} · ${d.status??'—'}\n${d.pick_up_location??'Pickup not set'} → ${d.drop_off_location??'Dropoff not set'}`;
  state.assignmentId=id;
});
action('ack-assignment',async()=>api('POST',`/api/v1/chauffeur/assignments/${getNumber('driver-assignment')}/acknowledge`,{}));
action('update-driver-status',async()=>{
  await api('POST',`/api/v1/chauffeur/assignments/${getNumber('driver-assignment')}/status`,
    {status:$('driver-status').value,...($('driver-status-note').value.trim()?{note:$('driver-status-note').value.trim()}:{})});
});
action('submit-expense',async()=>{
  const amount=Number($('expense-amount').value);if(!Number.isFinite(amount)||amount<=0)throw Error('Amount must be positive.');
  const data=await api('POST',`/api/v1/chauffeur/assignments/${getNumber('driver-assignment')}/expenses`,{
    category:$('expense-category').value,amount,currency:$('expense-currency').value.trim().toUpperCase(),
    ...( $('expense-description').value.trim()?{description:$('expense-description').value.trim()}:{}),incurredAt:new Date().toISOString()
  });
  state.expenseId=data.id;$('expense-id-label').textContent=data.id;$('review-expense-id').value=data.id;
});
action('submit-incident',async()=>{
  const payload={type:$('incident-type').value,severity:$('incident-severity').value,
    description:$('incident-description').value,documentIds:[]};
  const damage=optionalNumber('incident-damage-id');if(damage)payload.vehicleDamageId=damage;
  const data=await api('POST',`/api/v1/chauffeur/assignments/${getNumber('driver-assignment')}/incidents`,payload);
  state.incidentId=data.id;$('incident-id-label').textContent=data.id;$('review-incident-id').value=data.id;
});
action('load-pending',()=>api('GET','/api/v1/operations/bookings/pending'));
action('assign-driver',async()=>{
  const data=await api('POST',`/api/v1/operations/bookings/${getNumber('ops-booking-id')}/legs/${getNumber('ops-leg-id')}/assign-chauffeur`,{
    driverId:getNumber('ops-driver-id'),scheduledStartAt:dateIso('ops-start'),scheduledEndAt:dateIso('ops-end'),assignmentRole:$('ops-role').value
  });
  $('ops-assignment-id').textContent=data.id;$('driver-assignment').value=data.id;
});
action('review-expense',()=>api('PATCH',`/api/v1/operations/expenses/${getNumber('review-expense-id')}`,{
  status:$('review-expense-status').value,...($('review-expense-note').value.trim()?{reviewNote:$('review-expense-note').value.trim()}:{})
}));
action('review-incident',()=>api('PATCH',`/api/v1/operations/incidents/${getNumber('review-incident-id')}`,{
  status:$('review-incident-status').value,...($('review-incident-note').value.trim()?{resolutionNote:$('review-incident-note').value.trim()}:{})
}));
action('manual-send',async()=>{
  const path=$('manual-path').value.trim();const method=$('manual-method').value;let payload=null;
  if(method!=='GET'){try{payload=JSON.parse($('manual-body').value.trim()||'{}');}catch{throw Error('Manual request JSON is invalid');}}
  await api(method,path,payload);
});
action('clear-console',async()=>{$('response-output').textContent='Ready for the next request.';$('response-meta').textContent='Cleared';});
const later=new Date(Date.now()+45*60_000);$('ops-start').value=new Date(later.getTime()-later.getTimezoneOffset()*60000).toISOString().slice(0,16);
const laterEnd=new Date(later.getTime()+60*60_000);$('ops-end').value=new Date(laterEnd.getTime()-laterEnd.getTimezoneOffset()*60000).toISOString().slice(0,16);
$('draft-details').value=JSON.stringify({
  vehicleClassId:1,
  passenger:{fullName:'Test Passenger',phone:'+41790000000',count:1,luggageCount:1},
  legs:[{startAt:new Date(Date.now()+48*3600000).toISOString(),
    endAt:new Date(Date.now()+49*3600000).toISOString(),
    pickup:{address:'Sample pickup address',countryId:1,cityId:1},
    dropoff:{address:'Sample dropoff address',countryId:1,cityId:1}}],
  options:[]
},null,2);
health();
