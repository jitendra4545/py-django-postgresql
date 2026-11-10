import {describe,it,expect} from 'vitest';
import {computeQuoteBreakdown,discountQuoteLines} from '../src/services/pricing-core.js';
import {applyNativeCoupon,loadNativeCoupon} from '../src/services/native-coupons.js';
import {nativeDriverWindow,bufferedDriverWindow} from '../src/services/native-driver-windows.js';
import {nativeStatusToMobile} from '../src/services/native-status-mapping.js';
import {currentNativeLocation} from '../src/services/native-locations.js';
import {assertNativePaymentBalance,syncNativeCommissions} from '../src/services/native-financials.js';
import {desiredRoles} from '../src/services/client-assignment-sync.js';

const quote=(extra={})=>computeQuoteBreakdown({serviceCode:'TRANSFER',rateAmount:100,rateIsTotal:true,durationDays:1,options:[],optionSelections:[],currency:'EUR',taxes:[],...extra});
describe('native VAT and option calculations',()=>{
 it('keeps EUR VAT cents',()=>expect(quote({rateAmount:412,taxes:[{id:1,amount:8.1}]}).totalTax).toBe(33.37));
 it('rounds combined tax rates once and reconciles the displayed lines',()=>{
  const q=quote({taxes:[{id:1,amount:1.4},{id:2,amount:1.4}]});
  expect(q.total).toBe(103);expect(q.totalTax).toBe(2.8);expect(q.taxes.reduce((s,t)=>s+t.amount,0)).toBe(2.8);
 });
 it('preserves CHF steps across multiple tax rows',()=>{
  const q=quote({currency:'CHF',rateAmount:1,taxes:[{id:1,amount:2.5},{id:2,amount:2.5}]});
  expect(q.totalTax).toBe(.05);expect(q.taxes.map(x=>x.amount)).toEqual([.05,0]);
 });
 it('uses native chauffeur units when supplied without changing durationDays',()=>{
  const q=quote({serviceCode:'CHAUFFEUR',durationDays:1,optionBillingUnits:8,options:[{id:1,amount:10,based_on:1,rate_type:2,taxable:0}],optionSelections:[{optionId:1,quantity:2}]});
  expect(q.options[0].amount).toBe(160);expect(q.options[0].rateType).toBe(2);
 });
 it('leaves optional costs untaxed under the confirmed base-fee-only policy',()=>expect(quote({options:[{id:1,amount:10,based_on:2,taxable:0}],optionSelections:[{optionId:1,quantity:1}],taxes:[{id:1,amount:10}]}).total).toBe(120));
 it('applies a discount before VAT while retaining existing line keys',()=>{
  const before=quote({taxes:[{id:1,amount:10}]});const after=discountQuoteLines(before,10,'EUR');
  expect(Object.keys(after).sort()).toEqual(Object.keys(before).sort());expect(after.total).toBe(99);expect(after.totalTax).toBe(9);
 });
});

describe('native coupons',()=>{
 it('allocates a fixed discount once across all legs',()=>{
  const q={currency:'EUR',legs:[{lines:quote()},{lines:quote({rateAmount:200})}],total:300};
  applyNativeCoupon(q,{id:1,coupon_code:'FIXED',deduction_type:1,amount:30});
  expect(q.__native.discounts).toEqual([10,20]);expect(q.total).toBe(270);
 });
 it('applies percentage discounts to each share and never goes below zero',()=>{
  const q={currency:'EUR',legs:[{lines:quote()}],total:100};
  applyNativeCoupon(q,{id:1,coupon_code:'PERCENT',deduction_type:2,amount:20});expect(q.total).toBe(80);
  applyNativeCoupon({currency:'EUR',legs:[{lines:quote()}]}, {id:2,deduction_type:1,amount:999});
 });
 it('rejects expired native coupon records',async()=>{
  await expect(loadNativeCoupon(async()=>[{id:1,status:1,deduction_type:2,amount:10,end_date:'2000-01-01'}],'OLD')).rejects.toMatchObject({code:'COUPON_INVALID'});
 });
 it('checks legacy use_at and actual redeemed reservation rows',async()=>{
  let n=0;const run=async()=>++n===1?[{id:1,status:1,deduction_type:2,amount:10,max_use:2,use_at:0}]:[{n:2}];
  await expect(loadNativeCoupon(run,'FULL')).rejects.toMatchObject({code:'COUPON_EXHAUSTED'});
 });
 it('rejects ambiguous duplicate coupon codes',async()=>await expect(loadNativeCoupon(async()=>[{id:1},{id:2}],'DUP')).rejects.toMatchObject({code:'COUPON_INVALID'}));
});

describe('native dispatch semantics',()=>{
 const job={pick_up_date:'2027-01-01',pick_up_time:'10:00:00',drop_off_date:'2027-01-05',drop_off_time:'18:00:00'};
 it('makes independent short delivery and collection tasks',()=>{
  expect(nativeDriverWindow({...job,service_type:2},'PICKUP')).toEqual({start:'2027-01-01 10:00:00',end:'2027-01-01 12:00:00'});
  expect(nativeDriverWindow({...job,service_type:2},'DROPOFF')).toEqual({start:'2027-01-05 18:00:00',end:'2027-01-05 20:00:00'});
 });
 it('ignores unusable transfer dropoff stamps',()=>expect(nativeDriverWindow({...job,service_type:3},'PICKUP').end).toBe('2027-01-01 12:00:00'));
 it('uses valid chauffeur duration but caps unreasonable dates',()=>{
  expect(nativeDriverWindow({...job,service_type:1},'PICKUP').end).toBe('2027-01-01 12:00:00');
  expect(nativeDriverWindow({...job,service_type:1,drop_off_date:'2027-01-01',drop_off_time:'16:00:00'},'PICKUP').end).toBe('2027-01-01 16:00:00');
 });
 it('applies the same default turnaround buffer',()=>expect(bufferedDriverWindow('2027-01-01T10:00:00Z','2027-01-01T12:00:00Z')).toEqual({start:'2027-01-01 09:00:00',end:'2027-01-01 13:00:00'}));
 it('maps chargeable trip outcomes without refunding a booking',()=>{
  expect(nativeStatusToMobile('cancelled_chargeable')).toBe('CANCELLED');expect(nativeStatusToMobile('no_show_chargeable')).toBe('NO_SHOW');
  expect(nativeStatusToMobile('confirmed')).toBe('ASSIGNED');expect(nativeStatusToMobile('confirmed',{driverHistory:true})).toBe('ACKNOWLEDGED');
 });
 it('does not keep an inactive native leg assigned',()=>expect(desiredRoles({status:1,detail_status:0,pick_up_driver_id:1})).toEqual([]));
});

describe('native admin location edits',()=>{
 it('drops stale coordinates and place IDs after an address edit',()=>{
  const p=currentNativeLocation({pickup_details:{address:'Old',latitude:1,longitude:2,placeId:'old'},pick_up_location:'New',pick_up_country_id:1,pick_up_city_id:2},'pickup');
  expect(p).toEqual({address:'New',countryId:1,cityId:2});
 });
 it('keeps verified coordinates when native locations have not changed',()=>expect(currentNativeLocation({pickup_details:{address:'Same',latitude:1,longitude:2},pick_up_location:'Same',pick_up_country_id:1,pick_up_city_id:2},'pickup').latitude).toBe(1));
});

describe('native payment balance guards',()=>{
 const connection=({total=100,paid=0,currency='€',status=1}={})=>({execute:async sql=>sql.includes('FROM reservations WHERE')?[[{id:1,currency,status}]]:sql.includes('FROM reservation_costs')?[[{total_amount:total}]]:[[{payment_amount:paid}]]});
 const pay={reservation_id:1,amount:100,currency:'EUR'};
 it('permits only the current native outstanding amount',async()=>expect((await assertNativePaymentBalance(connection(),pay)).matches).toBe(true));
 it('blocks charging a stale fare',async()=>await expect(assertNativePaymentBalance(connection({total:150}),pay)).rejects.toMatchObject({code:'PAYMENT_RECONCILIATION_REQUIRED'}));
 it('blocks charging money already recorded by admin',async()=>await expect(assertNativePaymentBalance(connection({paid:20}),pay)).rejects.toMatchObject({code:'PAYMENT_RECONCILIATION_REQUIRED'}));
 it('blocks changed currency',async()=>await expect(assertNativePaymentBalance(connection({currency:'CHF'}),pay)).rejects.toMatchObject({code:'PAYMENT_RECONCILIATION_REQUIRED'}));
 it('returns a reconciliation position for a late gateway success',async()=>expect((await assertNativePaymentBalance(connection({total:150}),pay,{allowMismatch:true})).matches).toBe(false));
 it('preserves manually overridden commission rows',async()=>{
  let calls=0;await syncNativeCommissions({execute:async()=>{calls++;return calls===1?[[{id:1,base_rate:100,discount:0,agency_id:1,commission:10}]]:[[{id:1,is_custom_updated:1,paid_amount:0}]];}},1,1);expect(calls).toBe(2);
 });
});
