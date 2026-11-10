// Public IDs and role-specific state; native admin rows remain the assignment source.
export const MOBILE_DRIVER_ASSIGNMENTS = `(
 SELECT a.id,rd.reservation_id,rd.reservation_details_id,
        rd.id AS legacy_reservation_driver_id,a.driver_id,a.assignment_status AS status,
        a.scheduled_start_at,a.scheduled_end_at,a.acknowledged_at,a.declined_at,a.decline_reason,
        a.started_at,a.completed_at,a.assigned_by_user_id,a.created_at,a.updated_at,
        a.assignment_role AS mobile_assignment_role
 FROM app_mobile_assignment_ids a JOIN reservation_drivers rd ON rd.id=a.reservation_driver_id
 JOIN reservation_details native_leg ON native_leg.id=rd.reservation_details_id
 WHERE (a.current_slot=1 AND rd.status=1 AND rd.deleted_at IS NULL AND native_leg.status=1 AND native_leg.deleted_at IS NULL)
    OR a.assignment_status IN ('COMPLETED','NO_SHOW','CANCELLED','DECLINED')
)`;
