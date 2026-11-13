import { transaction } from '../db/pool.js';
import { AppError, forbidden, notFound } from '../common/errors.js';
import { writeActivityLog } from './activity-log.js';
import { disconnectUser } from './realtime.js';
import { nativeLifecycleSql } from './legacy-reservation-adapter.js';

export const DELETABLE_ACCOUNTS=Object.freeze({
  CLIENT:{table:'customers',role:5},CHAUFFEUR:{table:'drivers',role:3},AGENCY_AGENT:{table:'agents',role:4},
});

export async function deleteRoleAccount({kind,profileId,actor,reason=null}){
  const definition=DELETABLE_ACCOUNTS[kind];
  if(!definition)throw forbidden('This account type cannot be deleted through the mobile API');
  const result=await transaction(async connection=>{
    // Table and role are code-owned. Keep historical reservations and receipts;
    // Laravel uses deleted_at for the same user/profile soft deletion pattern.
    const [profiles]=await connection.execute(`SELECT id,user_id,deleted_at FROM ${definition.table} WHERE id=? FOR UPDATE`,[profileId]);
    const profile=profiles[0];
    if(!profile)throw notFound('Account profile not found');
    const [users]=await connection.execute('SELECT id,role,email,deleted_at FROM users WHERE id=? FOR UPDATE',[profile.user_id]);
    const user=users[0];
    if(!user||Number(user.role)!==definition.role)throw new AppError(409,'ACCOUNT_PROFILE_MISMATCH','This profile is not linked to the expected account role');
    if(Number(actor.role)!==1&&Number(actor.userId)!==Number(user.id))throw forbidden();
    if(profile.deleted_at&&user.deleted_at)return {userId:user.id,profileId:profile.id,role:kind,deleted:true};
    if(kind==='CLIENT'){
      const [bookings]=await connection.execute(`SELECT r.id FROM reservations r WHERE r.customer_id=? AND r.deleted_at IS NULL
        AND r.status IN (0,1) AND (${nativeLifecycleSql()}) NOT IN ('COMPLETED','CANCELLED','NO_SHOW','REJECTED')
        AND ((${nativeLifecycleSql()}) IN ('PREPARING','ON_THE_WAY','ARRIVED','WAITING','PASSENGER_ONBOARD','IN_SERVICE','AT_STOP','DROPOFF_REACHED')
          OR EXISTS(SELECT 1 FROM reservation_details d WHERE d.reservation_id=r.id AND d.status=1 AND d.deleted_at IS NULL
            AND COALESCE(d.is_extra_service,0)=0 AND TIMESTAMP(COALESCE(d.drop_off_date,d.pick_up_date),COALESCE(d.drop_off_time,'23:59:59'))>=NOW()))
        LIMIT 1 FOR UPDATE`,[profile.id]);
      if(bookings.length)throw new AppError(409,'ACCOUNT_HAS_ACTIVE_BOOKINGS','Complete or cancel active bookings before deleting this client account');
      const [inFlight]=await connection.execute(`SELECT p.id FROM app_payment_transactions p JOIN reservations r ON r.id=p.reservation_id
        WHERE r.customer_id=? AND p.status IN ('CREATED','REQUIRES_ACTION','PROCESSING','REFUND_PENDING') LIMIT 1 FOR UPDATE`,[profile.id]);
      if(inFlight.length)throw new AppError(409,'ACCOUNT_PAYMENT_IN_PROGRESS','Settle or cancel the current payment attempt before deleting this account');
    }
    if(kind==='CHAUFFEUR'){
      const [jobs]=await connection.execute(`SELECT rd.id FROM reservation_drivers rd JOIN reservations r ON r.id=rd.reservation_id
        JOIN reservation_details d ON d.id=rd.reservation_details_id
        WHERE (rd.pick_up_driver_id=? OR rd.drop_off_driver_id=?) AND rd.status=1 AND rd.deleted_at IS NULL
          AND r.status IN (0,1) AND r.deleted_at IS NULL AND d.status=1 AND d.deleted_at IS NULL AND COALESCE(d.is_extra_service,0)=0
          AND (${nativeLifecycleSql()}) NOT IN ('COMPLETED','CANCELLED','NO_SHOW','REJECTED')
          AND (TIMESTAMP(COALESCE(d.drop_off_date,d.pick_up_date),COALESCE(d.drop_off_time,'23:59:59'))>=NOW()
            OR (${nativeLifecycleSql()}) IN ('PREPARING','ON_THE_WAY','ARRIVED','WAITING','PASSENGER_ONBOARD','IN_SERVICE','AT_STOP','DROPOFF_REACHED'))
          LIMIT 1 FOR UPDATE`,[profile.id,profile.id]);
      if(jobs.length)throw new AppError(409,'ACCOUNT_HAS_ACTIVE_ASSIGNMENTS','Reassign or complete active trips before deleting this chauffeur account');
    }
    await connection.execute(`UPDATE ${definition.table} SET deleted_at=COALESCE(deleted_at,NOW()),updated_at=NOW()${kind==='CLIENT'?',status=0':''} WHERE id=?`,[profile.id]);
    await connection.execute('UPDATE users SET status=1,deleted_at=COALESCE(deleted_at,NOW()),remember_token=NULL,updated_at=NOW() WHERE id=?',[user.id]);
    await connection.execute('UPDATE app_refresh_tokens SET revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=?',[user.id]);
    await connection.execute('UPDATE app_user_devices SET push_token=NULL,updated_at=NOW() WHERE user_id=?',[user.id]);
    await connection.execute("UPDATE app_push_delivery_jobs SET status='SKIPPED',lock_token=NULL,locked_until=NULL,last_error='ACCOUNT_DELETED',updated_at=NOW() WHERE user_id=? AND status IN ('PENDING','RETRY','PROCESSING')",[user.id]);
    await connection.execute('UPDATE app_conversation_participants SET left_at=COALESCE(left_at,NOW()) WHERE user_id=?',[user.id]);
    await connection.execute('UPDATE app_account_invitations SET accepted_at=COALESCE(accepted_at,NOW()) WHERE user_id=?',[user.id]);
    await connection.execute('DELETE FROM password_resets WHERE email=?',[user.email]);
    if(kind==='CLIENT')await connection.execute('DELETE FROM customer_card_information WHERE customer_id=?',[profile.id]);
    if(kind==='CLIENT')await connection.execute("UPDATE app_agent_customer_assignments SET status='INACTIVE',updated_at=NOW() WHERE customer_id=?",[profile.id]);
    if(kind==='AGENCY_AGENT')await connection.execute("UPDATE app_agent_customer_assignments SET status='INACTIVE',updated_at=NOW() WHERE agent_id=?",[profile.id]);
    await writeActivityLog(connection,{subjectType:'User',subjectId:user.id,featureName:'account',action:'soft_deleted',
      description:'Account deleted through mobile API',oldValues:{role:definition.role},
      newValues:{deleted:true,profileId:profile.id,kind,reason},userId:actor.userId});
    return {userId:user.id,profileId:profile.id,role:kind,deleted:true};
  });
  disconnectUser(result.userId);
  return result;
}
