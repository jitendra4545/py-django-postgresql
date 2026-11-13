import {createHash} from 'node:crypto';
import Decimal from 'decimal.js';
import {transaction} from '../db/pool.js';
import {AppError,notFound} from '../common/errors.js';
import {writeActivityLog} from './activity-log.js';
import {markNativeFinancialChange} from './native-financials.js';

const digest=value=>createHash('sha256').update(value).digest('hex');
const parse=value=>typeof value==='string'?JSON.parse(value):value;
export async function addCustomerCharge({reservationId,actorUserId,title,amount,expenseId=null,idempotencyKey}){
  const amountWhole=new Decimal(amount).toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toNumber();
  if(amountWhole<=0)throw new AppError(422,'INVALID_CUSTOMER_CHARGE','Charge must round to a positive whole-currency amount');
  const reference=digest(idempotencyKey),requestHash=digest(JSON.stringify({title,amount:amountWhole,expenseId}));
  return transaction(async connection=>{
    // Serialize all balance-changing charge creation for this reservation.
    const [parents]=await connection.execute('SELECT id,currency,status,payment_status FROM reservations WHERE id=? AND deleted_at IS NULL FOR UPDATE',[reservationId]);
    const parent=parents[0];if(!parent)throw notFound('Booking not found');
    if(Number(parent.status)===3)throw new AppError(409,'BOOKING_CANCELLED','A cancelled booking needs financial review before adding charges');
    const [logs]=await connection.execute("SELECT new_values FROM activity_logs WHERE subject_type='Reservation' AND subject_id=? AND feature_name='customer_charge' AND action='created' ORDER BY id",[reservationId]);
    for(const log of logs){
      const entry=parse(log.new_values);
      if(entry.reference===reference){
        if(entry.requestHash!==requestHash)throw new AppError(409,'IDEMPOTENCY_CONFLICT','This key already refers to a different charge');
        return {...entry.result,reused:true};
      }
      if(expenseId&&Number(entry.expenseId)===Number(expenseId))throw new AppError(409,'EXPENSE_ALREADY_BILLED','This driver expense already has a customer charge');
    }
    if(expenseId){
      const [expenses]=await connection.execute('SELECT * FROM app_driver_expenses WHERE id=? AND reservation_id=? FOR UPDATE',[expenseId,reservationId]);
      const expense=expenses[0];if(!expense)throw notFound('Driver expense not found for this booking');
      if(expense.status!=='APPROVED')throw new AppError(409,'EXPENSE_NOT_APPROVED','Review and approve the driver expense before billing it');
      const currency=parent.currency==='€'?'EUR':parent.currency;
      if(expense.currency!==currency)throw new AppError(409,'EXPENSE_CURRENCY_MISMATCH','Expense currency differs from the booking');
      if(amountWhole>new Decimal(expense.amount).toDecimalPlaces(0,Decimal.ROUND_HALF_UP).toNumber())throw new AppError(422,'CHARGE_EXCEEDS_EXPENSE','Customer charge cannot exceed the approved expense');
    }
    const [legs]=await connection.execute('SELECT pick_up_country_id,drop_off_country_id,pick_up_date,pick_up_time FROM reservation_details WHERE reservation_id=? AND status=1 AND deleted_at IS NULL AND is_extra_service=0 ORDER BY id LIMIT 1',[reservationId]);
    const leg=legs[0];if(!leg)throw new AppError(409,'BOOKING_LEG_REQUIRED','A native booking leg is required for this charge');
    const [detail]=await connection.execute(`INSERT INTO reservation_details
      (reservation_id,is_extra_service,days,approximate_distance,pick_up_location,drop_off_location,pick_up_date,drop_off_date,
       pick_up_time,drop_off_time,pick_up_country_id,drop_off_country_id,service_details,status,created_at,updated_at)
      VALUES (?,1,1,0,'--','--',DATE(?),DATE(?),?,?,?, ?,?,1,NOW(),NOW())`,
      [reservationId,leg.pick_up_date,leg.pick_up_date,leg.pick_up_time,leg.pick_up_time,leg.pick_up_country_id,leg.drop_off_country_id,title]);
    await connection.execute(`INSERT INTO reservation_costs
      (reservation_id,reservation_details_id,discount,base_rate,base_tax,optional_cost,one_way_drop_off_charge,
       car_with_driver_extra_cost,insurance_cost,net_cost,total_tax,total_amount,user_id,status,created_at,updated_at)
      VALUES (?,?,0,?,0,0,0,0,0,?,0,?,?,1,NOW(),NOW())`,
      [reservationId,detail.insertId,amountWhole,amountWhole,amountWhole,actorUserId]);
    const result={reservationId,chargeLegId:detail.insertId,amount:amountWhole,currency:parent.currency==='€'?'EUR':parent.currency,tax:0,sourceExpenseId:expenseId};
    await writeActivityLog(connection,{subjectType:'Reservation',subjectId:reservationId,featureName:'customer_charge',featureId:detail.insertId,
      action:'created',description:title,newValues:{reference,requestHash,expenseId,result},userId:actorUserId});
    await markNativeFinancialChange(connection,reservationId);
    return {...result,reused:false};
  });
}
