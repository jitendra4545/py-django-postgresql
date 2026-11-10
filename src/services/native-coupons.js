import Decimal from 'decimal.js';
import { AppError } from '../common/errors.js';
import { discountQuoteLines } from './pricing-core.js';

export async function loadNativeCoupon(run,code,{lock=false}={}){
  const rows=await run(`SELECT * FROM discount_coupons WHERE coupon_code=? AND deleted_at IS NULL ${lock?'FOR UPDATE':''}`,[code]);
  if(rows.length!==1)throw new AppError(422,'COUPON_INVALID','Coupon code is invalid or ambiguous');
  const c=rows[0];
  const day=new Date().toISOString().slice(0,10);
  const date=v=>v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
  if(Number(c.status)!==1 || (c.start_date&&date(c.start_date)>day) || (c.end_date&&date(c.end_date)<day)
    || ![1,2].includes(Number(c.deduction_type)) || !Number.isFinite(Number(c.amount)) || Number(c.amount)<0
    || (Number(c.deduction_type)===2&&Number(c.amount)>100))throw new AppError(422,'COUPON_INVALID','Coupon is inactive, expired or incorrectly configured');
  const used=await run(lock
    ?'SELECT id FROM reservation_discount_coupons WHERE discount_coupon_id=? AND reservation_id IS NOT NULL FOR UPDATE'
    :'SELECT COUNT(*) AS n FROM reservation_discount_coupons WHERE discount_coupon_id=? AND reservation_id IS NOT NULL',[c.id]);
  // A checkout may already have an older repeatable-read snapshot. The locking
  // read must count the latest committed redemptions after obtaining the coupon.
  const usedCount=lock?used.length:Number(used[0]?.n??0);
  if(c.max_use!=null && Math.max(Number(c.use_at??0),usedCount)>=Number(c.max_use))throw new AppError(422,'COUPON_EXHAUSTED','Coupon usage limit has been reached');
  return c;
}

export function applyNativeCoupon(quote,coupon){
  const total=quote.legs.reduce((s,l)=>s.plus(l.lines.netCost),new Decimal(0));
  const discount=Decimal.min(total,Number(coupon.deduction_type)===2?total.times(coupon.amount).div(100):new Decimal(coupon.amount));
  let distributed=new Decimal(0), cumulative=new Decimal(0);
  const discounts=quote.legs.map((leg,index)=>{
    cumulative=cumulative.plus(leg.lines.netCost);
    const allocation=index===quote.legs.length-1?discount.minus(distributed):total.gt(0)?discount.times(cumulative).div(total).toDecimalPlaces(2).minus(distributed):new Decimal(0);
    distributed=distributed.plus(allocation);
    leg.lines=discountQuoteLines(leg.lines,allocation.toNumber(),quote.currency);
    return allocation.toNumber();
  });
  quote.total=quote.legs.reduce((s,l)=>s.plus(l.lines.total),new Decimal(0)).toNumber();
  // Stored in the immutable DB quote only; removed by the public quote response.
  quote.__native={...quote.__native,coupon:{id:coupon.id,code:coupon.coupon_code,amount:Number(coupon.amount),type:Number(coupon.deduction_type)},discounts};
  return quote;
}

export async function reserveNativeCoupon(connection,{draft,quote,reservationId,actorUserId}){
  const details=typeof draft.details==='string'?JSON.parse(draft.details):draft.details;
  if(!details.couponCode)return;
  const run=(sql,args)=>connection.execute(sql,args).then(([rows])=>rows);
  const c=await loadNativeCoupon(run,details.couponCode,{lock:true});
  const snap=quote.__native?.coupon;
  if(!snap || Number(snap.id)!==Number(c.id) || snap.amount!==Number(c.amount) || snap.type!==Number(c.deduction_type))
    throw new AppError(409,'QUOTE_STALE','Coupon changed; create a fresh quote');
  const discount=quote.__native.discounts.reduce((s,n)=>s.plus(n),new Decimal(0)).toNumber();
  await connection.execute(`INSERT INTO reservation_discount_coupons
    (discount_coupon_id,reservation_id,coupon_value,coupon_type,discount_amount,updated_by,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,1,NOW(),NOW())`,[c.id,reservationId,Math.trunc(c.amount),c.deduction_type,discount,actorUserId]);
  await connection.execute('UPDATE reservations SET discount=? WHERE id=?',[discount,reservationId]);
}
