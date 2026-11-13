import { nativeLegStatusSql } from './legacy-reservation-adapter.js';
import * as realtime from './realtime.js';
import { syncNativeStatusEvents } from './client-status-sync.js';
import { transaction, query } from '../db/pool.js';
import { insertNativeNotification } from './client-native-store.js';
import { nativeDriverWindow } from './native-driver-windows.js';

export const desiredRoles = (row) => {
  if(Number(row.status)!==1 || row.deleted_at || Number(row.parent_status)===3 || row.parent_deleted || row.detail_deleted || Number(row.detail_status??1)!==1 || Number(row.is_extra_service)===1)return [];
  const result=[];
  if(row.pick_up_driver_id)result.push(['PICKUP',Number(row.pick_up_driver_id)]);
  if(row.drop_off_driver_id)result.push(['DROPOFF',Number(row.drop_off_driver_id)]);
  if(result.length===2 && result[0][1]===result[1][1] && row.mobile_assignment_role==='BOTH')return [['BOTH',result[0][1]]];
  return result;
};

export async function reconcileNativeRows(connection,{reservationId=null,driverId=null,nativeId=null,notify=true,all=false}={}) {
  const events=[];
  const clauses=['1=1'],params=[];
  if(reservationId){clauses.push('rd.reservation_id=?');params.push(reservationId);}
  if(nativeId){clauses.push('rd.id=?');params.push(nativeId);}
  if(driverId){clauses.push('(rd.pick_up_driver_id=? OR rd.drop_off_driver_id=? OR EXISTS (SELECT 1 FROM app_mobile_assignment_ids am WHERE am.reservation_driver_id=rd.id AND am.driver_id=? AND am.current_slot=1))');params.push(driverId,driverId,driverId);}
  if(!all&&!reservationId&&!driverId&&!nativeId)clauses.push('(rd.updated_at>=DATE_SUB(NOW(),INTERVAL 2 DAY) OR d.drop_off_date>=CURRENT_DATE)');
  const [rows]=await connection.execute(`SELECT rd.*,r.service_type,d.is_extra_service,d.status AS detail_status,d.deleted_at AS detail_deleted,
    d.pick_up_date AS detail_pick_up_date,d.pick_up_time AS detail_pick_up_time,d.drop_off_date AS detail_drop_off_date,d.drop_off_time AS detail_drop_off_time,
    r.status AS parent_status,r.deleted_at AS parent_deleted,d.trip_status_updated_at,${nativeLegStatusSql('d')} AS mobile_leg_status,(SELECT u.role FROM users u WHERE u.id=d.trip_status_updated_by LIMIT 1) AS trip_actor_role,TIMESTAMP(COALESCE(rd.pick_up_date,d.pick_up_date),COALESCE(rd.pick_up_time,d.pick_up_time)) AS starts,
    TIMESTAMP(COALESCE(rd.drop_off_date,d.drop_off_date),COALESCE(rd.drop_off_time,d.drop_off_time)) AS ends
    FROM reservation_drivers rd JOIN reservation_details d ON d.id=rd.reservation_details_id JOIN reservations r ON r.id=rd.reservation_id
    WHERE ${clauses.join(' AND ')} ORDER BY rd.id FOR UPDATE`,params);
  for(const row of rows){
    if(all && row.mobile_assignment_id){
      const [saved]=await connection.execute('SELECT reservation_driver_id FROM app_mobile_assignment_ids WHERE id=? FOR UPDATE',[row.mobile_assignment_id]);
      if(!saved[0])await connection.execute('INSERT INTO app_mobile_assignment_ids(id) VALUES (?)',[row.mobile_assignment_id]);
      if(!saved[0]?.reservation_driver_id)await connection.execute(`UPDATE app_mobile_assignment_ids SET reservation_driver_id=?,assignment_role=?,driver_id=?,assignment_status=?,current_slot=NULL,
        scheduled_start_at=?,scheduled_end_at=?,acknowledged_at=?,declined_at=?,decline_reason=?,started_at=?,completed_at=?,assigned_by_user_id=?,created_at=?,updated_at=? WHERE id=?`,
      [row.id,row.mobile_assignment_role??'PICKUP',row.mobile_driver_id,row.mobile_assignment_status??'CANCELLED',row.scheduled_start_at??row.starts,row.scheduled_end_at??row.ends,
       row.acknowledged_at,row.declined_at,row.decline_reason,row.started_at,row.completed_at,row.assigned_by_user_id,row.created_at,row.updated_at,row.mobile_assignment_id]);
      if(desiredRoles(row).some(([role,driver])=>role===(row.mobile_assignment_role??'PICKUP')&&driver===Number(row.mobile_driver_id))){
        const [current]=await connection.execute('SELECT id FROM app_mobile_assignment_ids WHERE reservation_driver_id=? AND assignment_role=? AND current_slot=1',[row.id,row.mobile_assignment_role??'PICKUP']);
        if(!current.length)await connection.execute('UPDATE app_mobile_assignment_ids SET current_slot=1 WHERE id=?',[row.mobile_assignment_id]);
      }
    }
    const roles=desiredRoles(row);
    const [existing]=await connection.execute('SELECT * FROM app_mobile_assignment_ids WHERE reservation_driver_id=? AND current_slot=1 FOR UPDATE',[row.id]);
    for(const item of existing){
      if(!roles.some(([role,driver])=>role===item.assignment_role&&driver===Number(item.driver_id))){
        await connection.execute(`UPDATE app_mobile_assignment_ids SET current_slot=NULL,assignment_status=IF(assignment_status IN ('COMPLETED','NO_SHOW'),assignment_status,'CANCELLED'),updated_at=NOW() WHERE id=?`,[item.id]);
        if(notify){const event=await enqueue(connection,item.driver_id,row.reservation_id,item.id,'ASSIGNMENT_CANCELLED');if(event)events.push(event);}
        await connection.execute(`UPDATE app_conversation_participants cp JOIN app_conversations c ON c.id=cp.conversation_id
          JOIN drivers dr ON dr.user_id=cp.user_id SET cp.left_at=NOW()
          WHERE c.reservation_id=? AND dr.id=? AND cp.participant_role='CHAUFFEUR'`,[row.reservation_id,item.driver_id]);
      }
    }
    for(const [role,driver] of roles){
      const window=nativeDriverWindow(row,role);
      if(!window)continue;
      const active=existing.find(a=>a.assignment_role===role&&Number(a.driver_id)===driver);
      if(active){
        await connection.execute(`UPDATE app_mobile_assignment_ids SET scheduled_start_at=?,scheduled_end_at=?,
          assignment_status=IF(?=2,IF(assignment_status='NO_SHOW','NO_SHOW','COMPLETED'),IF(? IN (1,2) AND ? IS NOT NULL AND ?>=COALESCE(updated_at,'1970-01-01') AND ? IN ('ASSIGNED','ACKNOWLEDGED','PREPARING','ON_THE_WAY','ARRIVED','WAITING','PASSENGER_ONBOARD','IN_SERVICE','AT_STOP','DROPOFF_REACHED','COMPLETED','NO_SHOW','CANCELLED'),IF(?='ASSIGNED',IF(assignment_status='OFFERED','OFFERED','ACKNOWLEDGED'),?),assignment_status)) WHERE id=?`,
          [window.start,window.end,row.parent_status,row.trip_actor_role,row.trip_status_updated_at,row.trip_status_updated_at,row.mobile_leg_status,row.mobile_leg_status,row.mobile_leg_status,active.id]);continue;
      }
      let id=null;
      if(row.mobile_assignment_id && (!row.mobile_assignment_role || row.mobile_assignment_role===role)){
        const [reserved]=await connection.execute('SELECT id,reservation_driver_id FROM app_mobile_assignment_ids WHERE id=? FOR UPDATE',[row.mobile_assignment_id]);
        if(!reserved[0])await connection.execute('INSERT INTO app_mobile_assignment_ids(id) VALUES (?)',[row.mobile_assignment_id]);
        if(!reserved[0]?.reservation_driver_id)id=row.mobile_assignment_id;
      }
      if(!id){const [created]=await connection.execute('INSERT INTO app_mobile_assignment_ids(id) VALUES (NULL)');id=created.insertId;}
      await connection.execute(`UPDATE app_mobile_assignment_ids SET reservation_driver_id=?,assignment_role=?,driver_id=?,assignment_status=?,current_slot=1,
        scheduled_start_at=?,scheduled_end_at=?,assigned_by_user_id=?,created_at=COALESCE(created_at,NOW()),updated_at=NOW(),
        acknowledged_at=?,declined_at=?,decline_reason=?,started_at=?,completed_at=? WHERE id=?`,
      [row.id,role,driver,row.mobile_assignment_id===id?(row.mobile_assignment_status??'OFFERED'):'OFFERED',window.start,window.end,row.user_id,
        row.mobile_assignment_id===id?row.acknowledged_at:null,row.mobile_assignment_id===id?row.declined_at:null,row.mobile_assignment_id===id?row.decline_reason:null,
        row.mobile_assignment_id===id?row.started_at:null,row.mobile_assignment_id===id?row.completed_at:null,id]);
      if(notify){const event=await enqueue(connection,driver,row.reservation_id,id,'NEW_ASSIGNMENT');if(event)events.push(event);}
    }
  }
  return events;
}
async function enqueue(connection,driverId,reservationId,assignmentId,type){
 const [drivers]=await connection.execute('SELECT user_id FROM drivers WHERE id=? AND deleted_at IS NULL',[driverId]);
 if(!drivers[0]?.user_id)return;
 const userId=drivers[0].user_id;
 const payload={userId,type,title:type==='NEW_ASSIGNMENT'?'New chauffeur assignment':'Assignment updated',body:'Your service assignment has changed.',data:{reservationId,assignmentId}};
 const n=await insertNativeNotification(connection,payload);
 await connection.execute(`INSERT INTO app_push_delivery_jobs(notification_id,user_id,status,next_attempt_at,created_at,updated_at) VALUES (?,?,'PENDING',NOW(),NOW(),NOW())`,[n.insertId,userId]);
 return {...payload,id:n.insertId};
}
let flight=null;
async function runSync(options){
 const events=await transaction(async c=>{const events=await reconcileNativeRows(c,options);await syncNativeStatusEvents(c,options);return events;});
 for(const event of events){
  const {userId,...payload}=event;
  realtime.emitToUser(userId,'notification.created',payload);
  if(event.type==='ASSIGNMENT_CANCELLED'){
   const conversations=await query('SELECT id FROM app_conversations WHERE reservation_id=?',[event.data.reservationId]);
   for(const item of conversations)realtime.removeUserFromConversation?.(userId,item.id);
  }
 }
}
export async function syncClientAssignments(options={}) {
 if(Object.keys(options).length)return runSync(options);
 if(!flight)flight=runSync(options).finally(()=>{flight=null;});
 return flight;
}
