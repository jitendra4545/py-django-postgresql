import {describe,it,expect} from 'vitest';
import {computeQuoteBreakdown} from '../src/services/pricing-core.js';
import {breakdownFromQuote,describePricingSection} from '../src/services/payment-breakdown.js';
import {normalizeMessageInput} from '../src/services/message-input.js';
const lines=(rate,extra={})=>computeQuoteBreakdown({serviceCode:'TRANSFER',currency:'CHF',rateAmount:rate,rateIsTotal:true,durationDays:1,
  options:[],optionSelections:[],taxes:[{id:1,title:'VAT',amount:8.1}],...extra});
describe('customer cost information',()=>{
 it('renders the screenshot chauffeur rate and exact CHF tax/rounding',()=>{
  const q={currency:'CHF',total:1038,legs:[{billableHours:8,distanceKm:0,lines:lines(960)}]};
  const b=breakdownFromQuote(q,{serviceCode:'CHAUFFEUR'});
  expect(b.sections[0].rate).toMatchObject({unit:'HOUR',unitAmount:120,quantity:8,baseAmount:960});
  expect(b.sections[0].totals).toMatchObject({tax:77.75,roundingAdjustment:.25,total:1038});
 });
 it('shows rental collection separately and preserves the agreed base-only tax',()=>{
  const b=breakdownFromQuote({currency:'CHF',total:2011,legs:[{billableUnits:1,isPickupAndCollection:true,lines:lines(470,{oneWayCharge:1503})}]},{serviceCode:'CAR_RENTAL'});
  expect(b.sections[0].rate).toMatchObject({unit:'DAY',unitAmount:470,quantity:1});
  expect(b.sections[0].rows.find(r=>r.key==='oneWayCharge')).toMatchObject({label:'Pickup and collection fee',amount:1503});
  expect(b.sections[0].totals).toMatchObject({netCost:1973,tax:38.05,total:2011,roundingAdjustment:-.05});
 });
 it('describes transfers as a trip fare and includes named selected extras',()=>{
  const l=lines(200,{options:[{id:9,title:'Child seat',amount:10,based_on:2}],optionSelections:[{optionId:9,quantity:1}]});
  const b=breakdownFromQuote({currency:'CHF',total:l.total,legs:[{lines:l,distanceKm:20}]},{serviceCode:'TRANSFER'});
  expect(b.sections[0].rate.unit).toBe('TRIP');expect(b.sections[0].options[0].title).toBe('Child seat');expect(b.sections[0].tax.taxableBase).toBe(200);
 });
 it('keeps private coupon metadata private and reconciles every displayed row',()=>{
  const b=breakdownFromQuote({currency:'CHF',total:108,__native:{discounts:[10]},legs:[{billableHours:2,lines:{...lines(110),totalTax:8.1,total:108}}]},{serviceCode:'CHAUFFEUR'});
  expect(JSON.stringify(b)).not.toContain('__native');
  const s=b.sections[0];expect(Math.round(s.rows.reduce((t,r)=>t+r.amount,0)*100)).toBe(Math.round(s.totals.total*100));
 });
 it('shows a manually recorded price difference as an adjustment rather than fake rounding',()=>{
  const s=describePricingSection({serviceCode:'CAR_RENTAL',recorded:true,lines:{currency:'CHF',baseRate:100,totalTax:10,total:120},taxRate:8.1});
  expect(s.tax.basis).toBe('RECORDED');expect(s.tax.taxableBase).toBeNull();expect(s.totals.priceAdjustment).toBe(10);expect(s.totals.roundingAdjustment).toBe(0);
 });
});
describe('compatible chat inputs',()=>{
 it('accepts text without changing the existing body response contract',()=>expect(normalizeMessageInput({text:'Hello'})).toMatchObject({body:'Hello'}));
 it('preserves explicit body and infers document type when a document is supplied',()=>{
  expect(normalizeMessageInput({body:'Original',text:'Alias'}).body).toBe('Original');expect(normalizeMessageInput({documentId:3}).messageType).toBe('DOCUMENT');
 });
});
