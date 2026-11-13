import Decimal from 'decimal.js';
import { AppError } from '../common/errors.js';

const rounded = value => new Decimal(value ?? 0).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();

export async function syncNativeCommissions(connection, reservationId, actorUserId) {
  const [rows] = await connection.execute(`SELECT d.id,c.base_rate,c.discount,r.agency_id,a.commission
    FROM reservations r JOIN reservation_details d ON d.reservation_id=r.id AND d.status=1 AND d.deleted_at IS NULL AND COALESCE(d.is_extra_service,0)=0
    JOIN reservation_costs c ON c.reservation_details_id=d.id AND c.status=1
    JOIN agencies a ON a.id=r.agency_id AND a.deleted_at IS NULL
    WHERE r.id=? AND r.deleted_at IS NULL ORDER BY d.id,c.id FOR UPDATE`,[reservationId]);
  for(const row of rows){
    const [existing]=await connection.execute(`SELECT * FROM agency_commissions
      WHERE reservation_details_id=? AND status=1 AND deleted_at IS NULL ORDER BY id DESC FOR UPDATE`,[row.id]);
    // Preserve staff overrides and recorded payments. Retire duplicate active
    // history only when it has neither a custom override nor paid money.
    if(existing.some(x=>Number(x.is_custom_updated)===1))continue;
    if(existing.length>1)throw new AppError(409,'COMMISSION_REVIEW_REQUIRED','Multiple active commission records need operations review');
    const amount=rounded(Decimal.max(0,new Decimal(row.base_rate).minus(row.discount??0)).times(row.commission??0).div(100));
    if(existing[0]){
      await connection.execute(`UPDATE agency_commissions SET agency_id=?,commission_amount=?,
        commission_percentage=?,due_amount=?,updated_by=?,updated_at=NOW() WHERE id=?`,
      [row.agency_id,amount,row.commission??0,rounded(new Decimal(amount).minus(existing[0].paid_amount??0)),actorUserId,existing[0].id]);
    }else await connection.execute(`INSERT INTO agency_commissions
      (reservation_id,reservation_details_id,agency_id,commission_amount,paid_amount,due_amount,
       commission_percentage,status,user_id,created_at,updated_at) VALUES (?,?,?,?,0,?,?,1,?,NOW(),NOW())`,
    [reservationId,row.id,row.agency_id,amount,amount,row.commission??0,actorUserId]);
  }
}

export async function assertNativePaymentBalance(connection,payment,{lock=true,allowMismatch=false}={}) {
  const [parents]=await connection.execute(`SELECT id,currency,payment_status,status,deleted_at FROM reservations WHERE id=? ${lock?'FOR UPDATE':''}`,[payment.reservation_id]);
  const parent=parents[0];
  if(!parent)throw new AppError(409,'PAYMENT_HOLD_NOT_ACTIVE','The reservation is not payable');
  if(Number(parent.status)===3&&!allowMismatch)throw new AppError(409,'PAYMENT_HOLD_NOT_ACTIVE','The reservation is not payable');
  // Lock the current native cost/payment rows, not an aggregate snapshot.
  const [costs]=await connection.execute(`SELECT c.total_amount FROM reservation_costs c
    JOIN reservation_details d ON d.id=c.reservation_details_id AND d.status=1 AND d.deleted_at IS NULL
    WHERE c.reservation_id=? AND c.status=1 ${lock?'FOR UPDATE':''}`,[payment.reservation_id]);
  const [paid]=await connection.execute(`SELECT payment_amount FROM reservation_payments WHERE reservation_id=? AND status=1 AND deleted_at IS NULL AND (custom_invoices IS NULL OR custom_invoices=0) ${lock?'FOR UPDATE':''}`,[payment.reservation_id]);
  const total=costs.reduce((s,r)=>s.plus(r.total_amount??0),new Decimal(0));
  const collected=paid.reduce((s,r)=>s.plus(r.payment_amount??0),new Decimal(0));
  const balance=Decimal.max(0,total.minus(collected)).toDecimalPlaces(2,Decimal.ROUND_HALF_UP);
  const currency=parent.currency==='€'?'EUR':String(parent.currency).trim().toUpperCase();
  const matches=currency===payment.currency&&balance.equals(payment.amount)&&balance.gt(0)&&Number(parent.status)!==3&&!parent.deleted_at;
  if(!matches&&!allowMismatch) {
    throw new AppError(409,'PAYMENT_RECONCILIATION_REQUIRED','Operations changed the amount, currency or payments. Review the outstanding balance before charging.');
  }
  return {total:total.toNumber(),paid:collected.toNumber(),balance:balance.toNumber(),currency,matches};
}

export async function markNativeFinancialChange(connection,reservationId){
  await connection.execute('UPDATE reservations SET data_sync_to_zoho=0,updated_at=NOW() WHERE id=?',[reservationId]);
}
