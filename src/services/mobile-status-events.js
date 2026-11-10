/**
 * Canonical mobile lifecycle timeline is stored in activity_logs.
 * reservation_driver_statuses is a same-transaction mirror of driver events.
 * Public IDs come from an ID-only allocator, never from website audit-log IDs.
 */

export const MOBILE_BOOKING_STATUS_EVENTS = `(
  SELECT COALESCE(a.mobile_event_id,a.id) AS id,
         a.subject_id AS reservation_id,
         a.mobile_reservation_details_id AS reservation_details_id,
         a.mobile_assignment_id AS assignment_id,
         a.mobile_event_status AS status,
         a.user_id AS actor_user_id,
         a.mobile_note AS note,
         a.mobile_latitude AS latitude,
         a.mobile_longitude AS longitude,
         a.mobile_occurred_at AS occurred_at,
         a.created_at
    FROM activity_logs a
   WHERE a.subject_type='Reservation'
     AND a.feature_name='mobile_booking_status'
     AND a.mobile_event_status IS NOT NULL
)`;

export const recordBookingStatusEvent = async (connection, {
  reservationId,
  reservationDetailsId = null,
  assignmentId = null,
  status,
  actorUserId = null,
  note = null,
  latitude = null,
  longitude = null,
  occurredAt = null,
}) => {
  // Use the caller's transaction so status writes and both history records
  // commit or roll back together.
  const [publicId] = await connection.execute(
    'INSERT INTO app_mobile_status_event_ids VALUES (NULL)',
  );
  const [audit] = await connection.execute(
    `INSERT INTO activity_logs
       (subject_type,subject_id,feature_name,features_id,action,description,
        old_values,new_values,user_id,ip_address,created_at,
        mobile_event_id,mobile_reservation_details_id,mobile_assignment_id,
        mobile_event_status,mobile_note,mobile_latitude,mobile_longitude,mobile_occurred_at)
     VALUES ('Reservation',?,'mobile_booking_status',?,?,?,NULL,NULL,?,NULL,NOW(),
             ?,?,?,?,?,?,?,COALESCE(?,NOW()))`,
    [
      reservationId,
      reservationDetailsId,
      status,
      note?.slice(0,191) ?? null,
      actorUserId,
      publicId.insertId,
      reservationDetailsId,
      assignmentId,
      status,
      note,
      latitude,
      longitude,
      occurredAt,
    ],
  );
  if(reservationDetailsId!=null)await connection.execute('UPDATE reservation_details SET trip_status_updated_by=?,trip_status_updated_at=NOW() WHERE id=?',[actorUserId,reservationDetailsId]);
  if (assignmentId != null && reservationDetailsId != null) {
    const [assignments] = await connection.execute(
      'SELECT driver_id AS mobile_driver_id FROM app_mobile_assignment_ids WHERE id=?',
      [assignmentId],
    );
    if (!assignments[0]) {
      throw new Error(`Mobile assignment ${assignmentId} was not found for status event`);
    }
    await connection.execute(
      `INSERT INTO reservation_driver_statuses
       (reservation_id,reservation_details_id,driver_id,reservation_status_id,
        status,note,source,ip,created_at,updated_at,mobile_event_id,mobile_assignment_id)
       VALUES (?,?,?,(SELECT id FROM reservation_statuses WHERE UPPER(REPLACE(slug,'-','_'))=? LIMIT 1),?,?,'mobile_app',NULL,NOW(),NOW(),?,?)`,
      [
        reservationId,
        reservationDetailsId,
        assignments[0].mobile_driver_id,
        status,
        status.slice(0,30),
        note?.slice(0,500) ?? null,
        publicId.insertId,
        assignmentId,
      ],
    );
  }
  return { id: publicId.insertId, auditId: audit.insertId };
};
