/**
 * Mobile chauffeur assignments are stored on the existing reservation_drivers
 * rows. The website pick_up_driver_id/drop_off_driver_id and numeric status stay
 * independent. mobile_assignment_id retains pre-migration public API IDs.
 *
 * Use this only in SELECT statements: updates must target reservation_drivers.
 */
export const MOBILE_DRIVER_ASSIGNMENTS = `(
  SELECT rd.mobile_assignment_id AS id,
         rd.reservation_id, rd.reservation_details_id,
         rd.mobile_legacy_reservation_driver_id AS legacy_reservation_driver_id,
         rd.mobile_driver_id AS driver_id,
         rd.mobile_assignment_status AS status,
         rd.scheduled_start_at, rd.scheduled_end_at,
         rd.acknowledged_at, rd.declined_at, rd.decline_reason,
         rd.started_at, rd.completed_at, rd.assigned_by_user_id,
         rd.created_at, rd.updated_at, rd.mobile_assignment_role
    FROM reservation_drivers rd
   WHERE rd.mobile_assignment_id IS NOT NULL
)`;
