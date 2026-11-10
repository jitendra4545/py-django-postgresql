import {describe,it,expect} from 'vitest';
import {computeQuoteBreakdown,discountQuoteLines} from '../src/services/pricing-core.js';
import {applyNativeCoupon} from '../src/services/native-coupons.js';
import {QUOTE_TAX_POLICY,assertCurrentQuoteTaxPolicy} from '../src/services/quote-tax-policy.js';

const quote=(args={})=>computeQuoteBreakdown({serviceCode:'TRANSFER',rateAmount:100,rateIsTotal:true,durationDays:1,
 options:[{id:1,title:'Child seat',amount:10,based_on:2,rate_type:1,taxable:1}],
 optionSelections:[{optionId:1,quantity:2}],taxes:[{id:1,amount:10}],oneWayCharge:10,chauffeurExtraCost:5,insuranceCost:15,...args});
describe('confirmed base-fee-only tax',()=>{
 for(const serviceCode of ['CHAUFFEUR','TRANSFER','CAR_RENTAL'])for(const currency of ['EUR','CHF']){
  it(`${serviceCode} in ${currency} taxes the base and excludes every additional component`,()=>{
   const q=quote({serviceCode,currency});
   expect(q).toMatchObject({baseRate:100,taxableOptions:0,nonTaxableOptions:20,netCost:150,totalTax:10,total:160});
  });
 }
 it('keeps untaxed extras in the payable amount after a coupon',()=>{
  const q=discountQuoteLines(quote(),50,'EUR');expect(q.totalTax).toBe(5);expect(q.total).toBe(105);
 });
 it('caps the taxable base at zero when discount exceeds base fee',()=>{
  const q=discountQuoteLines(quote(),120,'EUR');expect(q.totalTax).toBe(0);expect(q.total).toBe(30);
 });
 it('retains CHF five cent tax rounding without taxing added fees',()=>{
  const q=quote({rateAmount:412,taxes:[{id:1,amount:8.1}],currency:'CHF'});expect(q.totalTax).toBe(33.35);expect(q.total).toBe(495);
 });
 it('preserves the private policy marker when applying a native coupon',()=>{
  const q={currency:'EUR',__native:{taxPolicy:QUOTE_TAX_POLICY},legs:[{lines:quote()}]};
  applyNativeCoupon(q,{id:1,coupon_code:'TEN',deduction_type:2,amount:10});
  expect(q.__native.taxPolicy).toBe(QUOTE_TAX_POLICY);expect(q.legs[0].lines.totalTax).toBe(8.5);expect(q.total).toBe(144);
 });
 it('accepts only quotes calculated using the current tax policy',()=>{
  expect(()=>assertCurrentQuoteTaxPolicy({__native:{taxPolicy:QUOTE_TAX_POLICY}})).not.toThrow();
  for(const old of [{},{__native:{}},{__native:{taxPolicy:'OLD'}}])expect(()=>assertCurrentQuoteTaxPolicy(old)).toThrowError(expect.objectContaining({code:'QUOTE_STALE'}));
 });
});
