import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../common/async-handler.js';
import { validate } from '../common/validate.js';
import { query, one } from '../db/pool.js';
import { pageResponse } from '../common/pagination.js';
import { getReservationForAccess } from '../services/access.js';
import { nativeDriverWindow } from '../services/native-driver-windows.js';
import { refreshNativeBalancePayment } from '../services/native-balance-payment.js';

// Mounted after the existing operations ADMIN/STAFF authorization middleware.
// Read-only staff views fill gaps in the original mutation-only mobile API.
const router=Router();
const queues={
 changes:{table:'app_booking_change_requests',columns:'x.id,x.reservation_id AS reservationId,x.status,x.reason,x.requested_changes AS requestedChanges,x.created_at AS createdAt'},
 cancellations:{table:'app_booking_cancellation_requests',columns:'x.id,x.reservation_id AS reservationId,x.status,x.reason,x.created_at AS createdAt'},
 expenses:{table:'app_driver_expenses',columns:'x.id,x.reservation_id AS reservationId,x.assignment_id AS assignmentId,x.driver_id AS driverId,x.category,x.amount,x.currency,x.status,x.description,x.incurred_at AS incurredAt'},
 incidents:{table:'reservation_service_incidents',columns:'x.id,x.reservation_id AS reservationId,x.assignment_id AS assignmentId,x.type,x.severity,x.description,x.status,x.created_at AS createdAt'},
};
const directories={
 customers:{from:'customers x',where:'x.deleted_at IS NULL',columns:'x.id,x.full_name AS fullName,x.email,x.phone_no AS phone,x.agency_id AS agencyId',search:['x.full_name','x.email']},
 agents:{from:'agents x JOIN users u ON u.id=x.user_id AND u.deleted_at IS NULL',where:'x.deleted_at IS NULL',columns:'x.id,x.full_name AS fullName,u.email,x.agency_id AS agencyId,x.user_id AS userId',search:['x.full_name','u.email']},
 agencies:{from:'agencies x',where:'x.deleted_at IS NULL',columns:'x.id,x.name AS fullName,x.status',search:['x.name']},
 chauffeurs:{from:'drivers x JOIN users u ON u.id=x.user_id AND u.deleted_at IS NULL',where:'x.deleted_at IS NULL',columns:'x.id,x.full_name AS fullName,u.email,x.phone,x.user_id AS userId,u.status AS accountStatus',search:['x.full_name','u.email']},
};
router.get('/workspace',validate(z.object({
 view:z.enum(['summary','queue','directory','booking']).default('summary'),
 kind:z.enum(['changes','cancellations','expenses','incidents','customers','agents','agencies','chauffeurs']).optional(),
 reservationId:z.coerce.number().int().positive().optional(),
 search:z.string().max(100).default(''),status:z.string().regex(/^[A-Z_]{1,40}$/).optional(),
 page:z.coerce.number().int().min(1).max(100000).default(1),perPage:z.coerce.number().int().min(1).max(100).default(20),
}).superRefine((q,ctx)=>{
 if(q.view==='queue'&&!queues[q.kind])ctx.addIssue({code:'custom',message:'Choose a review queue',path:['kind']});
 if(q.view==='directory'&&!directories[q.kind])ctx.addIssue({code:'custom',message:'Choose a directory',path:['kind']});
 if(q.view==='booking'&&!q.reservationId)ctx.addIssue({code:'custom',message:'reservationId is required',path:['reservationId']});
}),'query'),asyncHandler(async(req,res)=>{
 const q=req.query;
 res.set('Cache-Control','no-store');
 if(q.view==='summary'){
  const [counts]=await query(`SELECT
   (SELECT COUNT(*) FROM reservations WHERE deleted_at IS NULL AND status=1) AS activeBookings,
   (SELECT COUNT(*) FROM app_booking_change_requests WHERE status='PENDING') AS pendingChanges,
   (SELECT COUNT(*) FROM app_booking_cancellation_requests WHERE status='PENDING') AS pendingCancellations,
   (SELECT COUNT(*) FROM app_driver_expenses WHERE status='SUBMITTED') AS pendingExpenses,
   (SELECT COUNT(*) FROM reservation_service_incidents WHERE status IN ('OPEN','IN_REVIEW')) AS openIncidents,
   (SELECT COUNT(*) FROM contacts WHERE mobile_request_kind IN ('VIP','CONCIERGE') AND mobile_request_status IN ('SUBMITTED','IN_REVIEW')) AS manualInquiries`);
  return res.json({counts});
 }
 if(q.view==='booking'){
  await getReservationForAccess(req.auth,q.reservationId);
  const balance=await refreshNativeBalancePayment(q.reservationId);
  const [legs,extras,vehicles,costs,payments]=await Promise.all([
   query(`SELECT d.*,r.service_type FROM reservation_details d JOIN reservations r ON r.id=d.reservation_id
    WHERE d.reservation_id=? AND d.status=1 AND d.deleted_at IS NULL ORDER BY d.id`,[q.reservationId]),
   query(`SELECT o.id,o.reservation_details_id AS legId,o.rental_option_id AS optionId,o.rental_option_text AS title,
    o.quantity,o.based_on AS basedOn,o.amount AS unitAmount,o.total_amount AS amount FROM reservation_optional_costs o
    JOIN reservation_details d ON d.id=o.reservation_details_id AND d.status=1 AND d.deleted_at IS NULL
    WHERE o.reservation_id=? AND o.status=1 AND o.deleted_at IS NULL ORDER BY o.id`,[q.reservationId]),
   query(`SELECT rv.id,rv.reservation_details_id AS legId,rv.vehicle_id AS vehicleId,v.title,v.reg_no AS registrationNumber,
    v.vehicle_class_id AS vehicleClassId FROM reservation_vehicles rv JOIN vehicles v ON v.id=rv.vehicle_id
    JOIN reservation_details d ON d.id=rv.reservation_details_id AND d.status=1 AND d.deleted_at IS NULL
    WHERE rv.reservation_id=? AND rv.status=1 AND rv.deleted_at IS NULL`,[q.reservationId]),
   query(`SELECT c.reservation_details_id AS legId,c.base_rate AS baseRate,c.discount,c.optional_cost AS optionalCost,
    c.total_tax AS totalTax,c.total_amount AS totalAmount FROM reservation_costs c JOIN reservation_details d
    ON d.id=c.reservation_details_id AND d.status=1 AND d.deleted_at IS NULL WHERE c.reservation_id=? AND c.status=1`,[q.reservationId]),
   query('SELECT id,payment_amount AS amount,payment_date AS paidAt,note,status FROM reservation_payments WHERE reservation_id=? AND status=1 AND deleted_at IS NULL ORDER BY id DESC',[q.reservationId]),
  ]);
  return res.json({reservationId:q.reservationId,extras,vehicles,costs,nativePayments:payments,
   financialPosition:balance.position??null,financialReview:balance.blocked?balance.reason:null,
   legs:legs.filter(d=>Number(d.is_extra_service)!==1).map(d=>({id:d.id,status:d.mobile_leg_status,
   vehicleClassId:vehicles.find(v=>v.legId===d.id)?.vehicleClassId??d.vehicle_class_id,countryId:d.pick_up_country_id,cityId:d.pick_up_city_id,
   pickupAddress:d.pick_up_location,dropoffAddress:d.drop_off_location,passengerCount:d.passenger_count??1,luggageCount:d.luggage_count??0,
   vehicleStartAt:dateIso(d.pick_up_date,d.pick_up_time),vehicleEndAt:dateIso(d.drop_off_date??d.pick_up_date,d.drop_off_time??'23:59:59'),
   pickupWindow:nativeDriverWindow(d,'PICKUP'),dropoffWindow:nativeDriverWindow(d,'DROPOFF')}))});
 }
 const offset=(q.page-1)*q.perPage;
 let rows,count;
 if(q.view==='queue'){
  const def=queues[q.kind],args=q.status?[q.status]:[],filter=q.status?'x.status=?':'1=1';
  [rows,count]=await Promise.all([
   query(`SELECT ${def.columns},r.reservation_no AS reservationNo FROM ${def.table} x LEFT JOIN reservations r ON r.id=x.reservation_id
    WHERE ${filter} ORDER BY x.id DESC LIMIT ? OFFSET ?`,[...args,q.perPage,offset]),
   one(`SELECT COUNT(*) AS total FROM ${def.table} x WHERE ${filter}`,args),
  ]);
 }else{
  const def=directories[q.kind],args=q.search?def.search.map(()=>'%'+q.search+'%'):[],filter=def.where+(q.search?' AND ('+def.search.map(c=>`${c} LIKE ?`).join(' OR ')+')':'');
  [rows,count]=await Promise.all([
   query(`SELECT ${def.columns} FROM ${def.from} WHERE ${filter} ORDER BY x.id DESC LIMIT ? OFFSET ?`,[...args,q.perPage,offset]),
   one(`SELECT COUNT(*) AS total FROM ${def.from} WHERE ${filter}`,args),
  ]);
 }
 res.json(pageResponse(rows,Number(count.total),q.page,q.perPage));
}));
export default router;
function dateIso(day,time){if(!day)return null;return `${day instanceof Date?day.toISOString().slice(0,10):String(day).slice(0,10)}T${String(time??'00:00:00').slice(0,8)}Z`;}
