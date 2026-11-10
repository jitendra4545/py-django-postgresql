import { MOBILE_BOOKING_STATUS_EVENTS } from './mobile-status-events.js';
import { one, query } from '../db/pool.js';
import { notFound } from '../common/errors.js';
import { MOBILE_DRIVER_ASSIGNMENTS } from './driver-assignment-storage.js';
import { paymentAction } from './booking-payment-policy.js';
import {currentNativeLocation} from './native-locations.js';
import { refreshNativeBalancePayment } from './native-balance-payment.js';

export const loadBookingView = async (reservationId) => {
  const booking = await one(
    `SELECT r.id, r.uuid, r.reservation_no AS reservationNo, r.customer_id AS customerId,
            r.agency_id AS agencyId, r.status AS legacyStatus, r.payment_status AS paymentStatus,
            r.created_at AS createdAt, arm.service_code AS serviceCode,
            arm.lifecycle_status AS status, arm.source_channel AS sourceChannel,
            arm.created_by_agent_id AS createdByAgentId, arm.currency_code AS currency
       FROM reservations r
       JOIN reservations arm ON arm.id=r.id
      WHERE r.id = ? AND r.deleted_at IS NULL`,
    [reservationId],
  );
  if (!booking) throw notFound('Booking not found');
  const balancePayment = await refreshNativeBalancePayment(reservationId);
  if(balancePayment.lifecycleStatus) booking.status=balancePayment.lifecycleStatus;

  const [legs, costs, events, assignments, payments, quote, lineage] = await Promise.all([
    query(
      `SELECT rd.id, rd.pick_up_date AS pickupDate, rd.pick_up_time AS pickupTime,
              rd.drop_off_date AS dropoffDate, rd.drop_off_time AS dropoffTime,
              rd.pick_up_location AS pickupAddress, rd.drop_off_location AS dropoffAddress,
              COALESCE(rlm.sequence_no,rlm.id) AS sequenceNo,
              COALESCE((SELECT v.vehicle_class_id FROM reservation_vehicles rv JOIN vehicles v ON v.id=rv.vehicle_id WHERE rv.reservation_details_id=rd.id AND rv.status=1 AND rv.deleted_at IS NULL ORDER BY rv.id DESC LIMIT 1),rlm.vehicle_class_id) AS vehicleClassId,
              COALESCE(rlm.passenger_count,1) AS passengerCount, COALESCE(rlm.luggage_count,0) AS luggageCount,
              rd.pick_up_country_id,rd.pick_up_city_id,rd.pick_up_city,rd.drop_off_country_id,rd.drop_off_city_id,rd.drop_off_city,
              rlm.pickup_details AS pickupDetails, rlm.dropoff_details AS dropoffDetails,
              COALESCE((SELECT fn.flight_number FROM reservation_flight_numbers fn WHERE fn.reservation_details_id=rd.id ORDER BY fn.id DESC LIMIT 1),rlm.flight_number) AS flightNumber, rlm.mobile_leg_status AS status
         FROM reservation_details rd
         JOIN reservation_details rlm ON rlm.id = rd.id
        WHERE rd.reservation_id = ? AND rd.status=1 AND rd.deleted_at IS NULL AND COALESCE(rd.is_extra_service,0)=0
        ORDER BY COALESCE(rlm.sequence_no,rd.id),rd.id`,
      [reservationId],
    ),
    query(
      `SELECT reservation_details_id AS legId, base_rate AS baseRate, optional_cost AS optionalCost,
              total_tax AS totalTax, total_amount AS totalAmount
         FROM reservation_costs WHERE reservation_id = ? AND status = 1
          AND EXISTS(SELECT 1 FROM reservation_details live WHERE live.id=reservation_details_id AND live.status=1 AND live.deleted_at IS NULL)`,
      [reservationId],
    ),
    query(
      `SELECT id, reservation_details_id AS legId, assignment_id AS assignmentId,
              status, note, occurred_at AS occurredAt
         FROM ${MOBILE_BOOKING_STATUS_EVENTS} mobile_event WHERE reservation_id = ? ORDER BY occurred_at, id`,
      [reservationId],
    ),
    query(
      `SELECT ada.id, ada.reservation_details_id AS legId, ada.status,
              ada.scheduled_start_at AS scheduledStartAt, ada.scheduled_end_at AS scheduledEndAt,
              d.full_name AS chauffeurName, d.photo AS chauffeurPhoto
         FROM ${MOBILE_DRIVER_ASSIGNMENTS} ada
         JOIN drivers d ON d.id = ada.driver_id
        WHERE ada.reservation_id = ? AND ada.status <> 'CANCELLED'
        ORDER BY ada.created_at DESC`,
      [reservationId],
    ),
    query(
      `SELECT id, provider, provider_reference AS providerReference, amount, currency, status,
              provider_payload AS providerPayload, created_at AS createdAt
         FROM app_payment_transactions WHERE reservation_id = ? ORDER BY id DESC`,
      [reservationId],
    ),
    one(
      `SELECT (q.valid_until > NOW()) AS quoteIsValid
         FROM reservations r LEFT JOIN app_quote_snapshots q ON q.id=r.quote_snapshot_id
        WHERE r.id=?`,
      [reservationId],
    ),
    query('SELECT id,old_detail_id FROM reservation_details WHERE reservation_id=?',[reservationId]),
  ]);
  const action = paymentAction({
    payment: payments[0],
    lifecycleStatus: booking.status,
    legacyStatus: booking.legacyStatus,
    quoteIsValid: quote?.quoteIsValid,
  });
  if (balancePayment.blocked) action.canRetryPayment = false;
  // Provider payload can include payment-provider metadata; never expose it in
  // booking details. Keep the existing payments array response shape.
  const safePayments = payments.map(({
    id, provider, providerReference, amount, currency, status, createdAt,
  }) => ({ id, provider, providerReference, amount, currency, status, createdAt }));
  const parentById=new Map(lineage.map(row=>[Number(row.id),Number(row.old_detail_id)]));
  const currentByOld=new Map();
  for(const leg of legs){let id=Number(leg.id),guard=0;while(id&&guard++<30&&!currentByOld.has(id)){currentByOld.set(id,leg.id);id=parentById.get(id);}}
  const currentLegs=legs.map(leg=>{
    const {pick_up_country_id,pick_up_city_id,pick_up_city,drop_off_country_id,drop_off_city_id,drop_off_city,...output}=leg;
    const row={...leg,pick_up_location:leg.pickupAddress,drop_off_location:leg.dropoffAddress,pickup_details:leg.pickupDetails,dropoff_details:leg.dropoffDetails};
    return {...output,pickupDetails:currentNativeLocation(row,'pickup'),dropoffDetails:currentNativeLocation(row,'dropoff')};
  });
  return { ...booking, legs:currentLegs, costs, events:events.map(e=>({...e,legId:currentByOld.get(Number(e.legId))??e.legId})), assignments, payments: safePayments, ...action };
};
