// Existing expense/incident FKs in the supplied dump reference
// reservation_drivers.mobile_assignment_id, while pickup and dropoff have
// independent public IDs. Keep an inactive identity row only when that FK
// requires one; never duplicate an active operational driver assignment.
export async function ensureNativeAssignmentIdentity(connection, assignmentId) {
  const [known]=await connection.execute('SELECT id FROM reservation_drivers WHERE mobile_assignment_id=? FOR UPDATE',[assignmentId]);
  if(known.length)return;
  const [rows]=await connection.execute(`SELECT rd.*,a.driver_id,a.assignment_role
    FROM app_mobile_assignment_ids a JOIN reservation_drivers rd ON rd.id=a.reservation_driver_id
    WHERE a.id=? FOR UPDATE`,[assignmentId]);
  const row=rows[0];
  if(!row)throw new Error('Assignment identity does not exist');
  if(row.mobile_assignment_id==null){
    await connection.execute('UPDATE reservation_drivers SET mobile_assignment_id=? WHERE id=?',[assignmentId,row.id]);
    return;
  }
  await connection.execute(`INSERT INTO reservation_drivers
    (reservation_id,reservation_details_id,user_id,status,mobile_assignment_id,
     mobile_legacy_reservation_driver_id,mobile_driver_id,mobile_assignment_role,mobile_assignment_status,created_at,updated_at)
    VALUES (?,?,?,0,?,?,?,?,'CANCELLED',NOW(),NOW())`,
  [row.reservation_id,row.reservation_details_id,row.user_id,assignmentId,row.id,row.driver_id,row.assignment_role]);
}
