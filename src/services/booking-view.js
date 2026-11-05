import { one, query } from '../db/pool.js';
import { notFound } from '../common/errors.js';

export const loadBookingView = async (reservationId) => {
  const booking = await one(
    `SELECT r.id, r.uuid, r.reservation_no AS reservationNo, r.customer_id AS customerId,
            r.agency_id AS agencyId, r.status AS legacyStatus, r.payment_status AS paymentStatus,
            r.created_at AS createdAt, arm.service_code AS serviceCode,
            arm.lifecycle_status AS status, arm.source_channel AS sourceChannel,
            arm.created_by_agent_id AS createdByAgentId, arm.currency_code AS currency
       FROM reservations r
       JOIN app_reservation_meta arm ON arm.reservation_id = r.id
      WHERE r.id = ? AND r.deleted_at IS NULL`,
    [reservationId],
  );
  if (!booking) throw notFound('Booking not found');

  const [legs, costs, events, assignments, payments] = await Promise.all([
    query(
      `SELECT rd.id, rd.pick_up_date AS pickupDate, rd.pick_up_time AS pickupTime,
              rd.drop_off_date AS dropoffDate, rd.drop_off_time AS dropoffTime,
              rd.pick_up_location AS pickupAddress, rd.drop_off_location AS dropoffAddress,
              rlm.sequence_no AS sequenceNo, rlm.vehicle_class_id AS vehicleClassId,
              rlm.passenger_count AS passengerCount, rlm.luggage_count AS luggageCount,
              rlm.pickup_details AS pickupDetails, rlm.dropoff_details AS dropoffDetails,
              rlm.flight_number AS flightNumber, rlm.status
         FROM reservation_details rd
         JOIN app_reservation_leg_meta rlm ON rlm.reservation_details_id = rd.id
        WHERE rd.reservation_id = ? AND rd.deleted_at IS NULL
        ORDER BY rlm.sequence_no`,
      [reservationId],
    ),
    query(
      `SELECT reservation_details_id AS legId, base_rate AS baseRate, optional_cost AS optionalCost,
              total_tax AS totalTax, total_amount AS totalAmount
         FROM reservation_costs WHERE reservation_id = ? AND status = 1`,
      [reservationId],
    ),
    query(
      `SELECT id, reservation_details_id AS legId, assignment_id AS assignmentId,
              status, note, occurred_at AS occurredAt
         FROM app_booking_status_events WHERE reservation_id = ? ORDER BY occurred_at, id`,
      [reservationId],
    ),
    query(
      `SELECT ada.id, ada.reservation_details_id AS legId, ada.status,
              ada.scheduled_start_at AS scheduledStartAt, ada.scheduled_end_at AS scheduledEndAt,
              d.full_name AS chauffeurName, d.photo AS chauffeurPhoto
         FROM app_driver_assignments ada
         JOIN drivers d ON d.id = ada.driver_id
        WHERE ada.reservation_id = ? AND ada.status <> 'CANCELLED'
        ORDER BY ada.created_at DESC`,
      [reservationId],
    ),
    query(
      `SELECT id, provider, provider_reference AS providerReference, amount, currency, status, created_at AS createdAt
         FROM app_payment_transactions WHERE reservation_id = ? ORDER BY created_at DESC`,
      [reservationId],
    ),
  ]);
  return { ...booking, legs, costs, events, assignments, payments };
};
