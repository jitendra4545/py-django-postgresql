import {nativeStatusToMobile} from './native-status-mapping.js';
// Import native admin driver history into the same public timeline without
// inserting a second native status row. Existing public event IDs are retained.
export async function syncNativeStatusEvents(connection,{reservationId=null,driverId=null}={}) {
 const params=[],where=["h.mobile_event_id IS NULL","UPPER(REPLACE(COALESCE(s.slug,h.status),'-','_')) IN ('OFFERED','ACKNOWLEDGED','PREPARING','ON_THE_WAY','ARRIVED','WAITING','PASSENGER_ONBOARD','IN_SERVICE','AT_STOP','DROPOFF_REACHED','COMPLETED','NO_SHOW','CANCELLED','ASSIGNED','CONFIRMED','COMPLETED_TRIP','NO_SHOW_CHARGEABLE','CANCELLED_CHARGEABLE')"];
 if(reservationId){where.push('h.reservation_id=?');params.push(reservationId);}
 if(driverId){where.push('h.driver_id=?');params.push(driverId);}
 const [rows]=await connection.execute(`SELECT h.*,UPPER(REPLACE(COALESCE(s.slug,h.status),'-','_')) AS canonical_status,
   dr.user_id AS actor_id FROM reservation_driver_statuses h LEFT JOIN reservation_statuses s ON s.id=h.reservation_status_id
   LEFT JOIN drivers dr ON dr.id=h.driver_id WHERE ${where.join(' AND ')} ORDER BY h.id LIMIT 1000 FOR UPDATE`,params);
 const known=new Set(['OFFERED','ACKNOWLEDGED','PREPARING','ON_THE_WAY','ARRIVED','WAITING','PASSENGER_ONBOARD','IN_SERVICE','AT_STOP','DROPOFF_REACHED','COMPLETED','NO_SHOW','CANCELLED','ASSIGNED']);
 for(const row of rows){
  row.canonical_status=nativeStatusToMobile(row.canonical_status,{driverHistory:true});
  if(!known.has(row.canonical_status))continue;
  const [ids]=await connection.execute('INSERT INTO app_mobile_status_event_ids(id) VALUES (NULL)');
  await connection.execute(`INSERT INTO activity_logs(subject_type,subject_id,feature_name,features_id,action,user_id,created_at,
    mobile_event_id,mobile_reservation_details_id,mobile_assignment_id,mobile_event_status,mobile_note,mobile_occurred_at)
    VALUES ('Reservation',?,'mobile_booking_status',?,?,?,?,?,?,?,?,?,?)`,
    [row.reservation_id,row.reservation_details_id,row.canonical_status,row.actor_id,row.created_at??new Date(),ids.insertId,
     row.reservation_details_id,row.mobile_assignment_id,row.canonical_status,row.note,row.created_at??new Date()]);
  await connection.execute('UPDATE reservation_driver_statuses SET mobile_event_id=? WHERE id=?',[ids.insertId,row.id]);
 }
}
