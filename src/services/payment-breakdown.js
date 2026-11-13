import Decimal from 'decimal.js';
import { one, query } from '../db/pool.js';
import { AppError, notFound } from '../common/errors.js';
import { nativeCurrencySql, nativeServiceCodeSql } from './legacy-reservation-adapter.js';
import { draftFingerprint } from './booking-service.js';
import { assertCurrentQuoteTaxPolicy } from './quote-tax-policy.js';
import { loadBookingView } from './booking-view.js';

const n=value=>new Decimal(value??0).toDecimalPlaces(2,Decimal.ROUND_HALF_UP).toNumber();
const json=value=>typeof value==='string'?JSON.parse(value):value;
const plain=value=>String(value??'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
const sum=(items,field)=>n(items.reduce((total,item)=>total.plus(item[field]??0),new Decimal(0)));
const moneyText=(amount,currency)=>`${currency} ${Number(amount).toFixed(2)}`;

export function describePricingSection({serviceCode,sequenceNo=1,detailId=null,units=1,lines,discount=0,
  taxRate=null,options=[],distanceKm=null,isPickupAndCollection=false,isExtraService=false,title=null,recorded=false}){
  const currency=lines.currency??'EUR';
  const unit=isExtraService?'CHARGE':serviceCode==='CHAUFFEUR'?'HOUR':serviceCode==='CAR_RENTAL'?'DAY':'TRIP';
  const quantity=unit==='HOUR'||unit==='DAY'?Math.max(1,Number(units)||1):1;
  const unitRate=n(new Decimal(lines.baseRate??0).div(quantity));
  const optionsTotal=n(new Decimal(lines.taxableOptions??0).plus(lines.nonTaxableOptions??lines.optionalCost??0));
  const netCost=n(new Decimal(lines.baseRate??0).plus(optionsTotal).plus(lines.oneWayCharge??0).plus(lines.chauffeurExtraCost??0).plus(lines.insuranceCost??0));
  const tax=n(lines.totalTax),total=n(lines.total);
  const beforeRounding=Decimal.max(0,new Decimal(netCost).minus(discount)).plus(tax);
  const delta=n(new Decimal(total).minus(beforeRounding));
  const roundingAdjustment=Math.abs(delta)<=.5?delta:0;
  const priceAdjustment=Math.abs(delta)>.5?delta:0;
  const taxableBase=n(Decimal.max(0,new Decimal(lines.baseRate??0).minus(discount)));
  const validRate=taxRate!=null&&Number.isFinite(Number(taxRate))&&Number(taxRate)>=0&&(!recorded||(Number(taxRate)<=27&&new Decimal(taxRate).toDecimalPlaces(1).equals(taxRate)));
  const rawTax=validRate?new Decimal(taxableBase).times(taxRate).div(100):null;
  const expectedTax=rawTax?(currency==='CHF'?rawTax.div(.05).toDecimalPlaces(0,Decimal.ROUND_HALF_UP).times(.05):rawTax).toDecimalPlaces(2).toNumber():null;
  const baseOnly=!recorded||(expectedTax!==null&&Math.abs(expectedTax-tax)<.005);
  const rateLabel={HOUR:'Hourly rate',DAY:'Daily rate',TRIP:'Transfer fare',CHARGE:'Additional expense'}[unit];
  const quantityLabel=unit==='HOUR'?`${quantity} ${quantity===1?'hour':'hours'}`:unit==='DAY'?`${quantity} ${quantity===1?'day':'days'}`:unit==='CHARGE'?'1 charge':'1 trip';
  const rows=[
    {key:'baseFee',label:isExtraService?'Additional expense':unit==='TRIP'?'Transfer fare':`${quantityLabel} rate`,amount:n(lines.baseRate)},
    {key:'options',label:'Selected extras',amount:optionsTotal},
    {key:'oneWayCharge',label:isPickupAndCollection?'Pickup and collection fee':'One-way drop-off fee',amount:n(lines.oneWayCharge)},
    {key:'chauffeurExtraCost',label:'Additional distance charge',amount:n(lines.chauffeurExtraCost)},
    {key:'insuranceCost',label:'Insurance',amount:n(lines.insuranceCost)},
    {key:'discount',label:'Discount',amount:-n(discount)},
    {key:'tax',label:validRate&&baseOnly?`Tax (${Number(taxRate)}%)`:'Tax',amount:tax},
    {key:'roundingAdjustment',label:'Rounding adjustment',amount:roundingAdjustment},
    {key:'priceAdjustment',label:'Price adjustment recorded by operations',amount:priceAdjustment},
  ];
  return {detailId,sequenceNo,title:plain(title)||`Journey ${sequenceNo}`,serviceCode,isExtraService,
    currency,rate:{label:rateLabel,unit,quantity,quantityLabel,unitAmount:unitRate,baseAmount:n(lines.baseRate),
      calculation:unit==='DAY'||unit==='HOUR'?`${unitRate.toFixed(2)} × ${quantity} = ${moneyText(lines.baseRate,currency)}`:moneyText(lines.baseRate,currency)},
    distanceKm:distanceKm==null?null:Number(distanceKm),options:options.map(item=>({...item,title:plain(item.title),
      billingUnit:Number(item.basedOn)===1?(serviceCode==='CHAUFFEUR'?'HOUR':'DAY'):'BOOKING',
      billingUnits:Number(item.basedOn)===1?quantity:1})),rows,
    tax:{ratePercent:validRate?Number(taxRate):null,taxableBase:baseOnly?taxableBase:null,amount:tax,basis:baseOnly?'BASE_FEE_ONLY':'RECORDED',
      note:baseOnly?null:'Tax is shown as recorded by operations.'},
    totals:{baseFee:n(lines.baseRate),options:optionsTotal,oneWayCharge:n(lines.oneWayCharge),chauffeurExtraCost:n(lines.chauffeurExtraCost),
      insuranceCost:n(lines.insuranceCost),discount:n(discount),netCost,tax,roundingAdjustment,priceAdjustment,total}};
}

export function breakdownFromQuote(quote,{serviceCode,quoteId=null,quoteIsValid=true}={}){
  const currency=quote.currency;
  const sections=quote.legs.map((leg,index)=>describePricingSection({serviceCode,sequenceNo:leg.sequenceNo??index+1,
    units:serviceCode==='CHAUFFEUR'?leg.billableHours??leg.billableUnits:leg.billableUnits??leg.durationDays,
    discount:quote.__native?.discounts?.[index]??0,lines:{...leg.lines,currency},
    taxRate:(leg.lines.taxes??[]).reduce((total,t)=>total+Number(t.ratePercent??0),0),
    options:leg.lines.options??[],distanceKm:leg.distanceKm,isPickupAndCollection:leg.isPickupAndCollection}));
  const total=n(quote.total);
  return {scope:'DRAFT',reservationId:null,quoteId,serviceCode,currency,validUntil:quote.validUntil??null,quoteIsValid,
    sections,summary:{total,paid:0,amountDue:total},payment:{paymentId:null,paymentState:null,canPay:quoteIsValid}};
}

export async function loadDraftPaymentBreakdown(draft){
  const snapshot=await one('SELECT * FROM app_quote_snapshots WHERE id=? AND draft_id=?',[draft.quote_snapshot_id??0,draft.id]);
  if(!snapshot)throw new AppError(409,'QUOTE_REQUIRED','Create a quote before loading payment details');
  if(Number(snapshot.draft_revision)!==Number(draft.revision)||snapshot.request_hash!==draftFingerprint(draft))
    throw new AppError(409,'QUOTE_STALE','Create a fresh quote after changing this booking');
  const quote=json(snapshot.quote_data);
  assertCurrentQuoteTaxPolicy(quote);
  return breakdownFromQuote(quote,{serviceCode:draft.service_code,quoteId:snapshot.id,quoteIsValid:new Date(snapshot.valid_until)>new Date()});
}

export async function loadReservationPaymentBreakdown(reservationId){
  const booking=await loadBookingView(reservationId);
  const native=await one(`SELECT r.is_pick_up_and_collection,${nativeCurrencySql()} AS currency,
    ${nativeServiceCodeSql()} AS serviceCode FROM reservations r WHERE r.id=? AND r.deleted_at IS NULL`,[reservationId]);
  if(!native)throw notFound('Booking not found');
  const costs=await query(`SELECT c.*,d.days,d.is_extra_service,d.service_details,d.approximate_distance,
    (SELECT rt.tax FROM reservation_taxes rt WHERE rt.reservation_details_id=d.id AND rt.status=1 ORDER BY rt.id DESC LIMIT 1) AS tax_rate
    FROM reservation_costs c JOIN reservation_details d ON d.id=c.reservation_details_id AND d.status=1 AND d.deleted_at IS NULL
    WHERE c.reservation_id=? AND c.status=1 ORDER BY COALESCE(d.sequence_no,d.id),c.id`,[reservationId]);
  const allOptions=await query(`SELECT o.reservation_details_id,o.rental_option_id AS optionId,o.rental_option_text AS title,
    o.quantity,o.amount AS unitAmount,o.total_amount AS amount,o.based_on AS basedOn,o.rate_type AS rateType
    FROM reservation_optional_costs o JOIN reservation_details d ON d.id=o.reservation_details_id AND d.status=1 AND d.deleted_at IS NULL
    WHERE o.reservation_id=? AND o.status=1 AND o.deleted_at IS NULL ORDER BY o.id`,[reservationId]);
  const sections=costs.map((c,index)=>describePricingSection({serviceCode:native.serviceCode,sequenceNo:index+1,
    detailId:c.reservation_details_id,units:c.days,discount:c.discount,taxRate:c.tax_rate,
    distanceKm:c.approximate_distance,isPickupAndCollection:Boolean(native.is_pick_up_and_collection),
    isExtraService:Number(c.is_extra_service)===1,title:Number(c.is_extra_service)===1?plain(c.service_details)||'Additional expense':null,recorded:true,
    options:allOptions.filter(o=>Number(o.reservation_details_id)===Number(c.reservation_details_id)).map(({reservation_details_id:_id,...option})=>option),
    lines:{currency:native.currency,baseRate:c.base_rate,optionalCost:c.optional_cost,oneWayCharge:c.one_way_drop_off_charge,
      chauffeurExtraCost:c.car_with_driver_extra_cost,insuranceCost:c.insurance_cost,totalTax:c.total_tax,total:c.total_amount}}));
  const receipts=await query(`SELECT payment_amount FROM reservation_payments WHERE reservation_id=? AND status=1 AND deleted_at IS NULL
    AND (custom_invoices IS NULL OR custom_invoices=0)`,[reservationId]);
  const total=n(sections.reduce((v,s)=>v.plus(s.totals.total),new Decimal(0))),paid=sum(receipts,'payment_amount');
  return {scope:'RESERVATION',reservationId:Number(reservationId),quoteId:null,serviceCode:native.serviceCode,currency:native.currency,
    validUntil:null,quoteIsValid:null,sections,summary:{total,paid,amountDue:n(Decimal.max(0,new Decimal(total).minus(paid)))},
    payment:{paymentId:booking.paymentId,paymentState:booking.paymentState,canPay:booking.canRetryPayment}};
}
