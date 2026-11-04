// Record mobile chauffeur status changes in the existing website trip-status
// history. The status catalog is owned by the website: do not invent IDs or
// overwrite any existing reservation_statuses rows.
export const writeLegacyDriverStatus = async (connection, {
  reservationId,
  reservationDetailsId,
  driverId,
  status,
  note = null,
  userId = null,
}) => {
  const [matches] = await connection.execute(
    `SELECT id FROM reservation_statuses
      WHERE status=1 AND
        (LOWER(REPLACE(slug,'-','_'))=LOWER(?)
          OR LOWER(REPLACE(name,' ','_'))=LOWER(?))
      ORDER BY id LIMIT 1`,
    [status, status],
  );
  const catalogStatusId = matches[0]?.id ?? null;
  // This legacy varchar is only 500 characters. The app's complete note stays
  // in the append-only app_booking_status_events journal.
  await connection.execute(
    `INSERT INTO reservation_driver_statuses
       (reservation_id,reservation_details_id,driver_id,reservation_status_id,
        status,note,source,created_at,updated_at)
     VALUES (?,?,?,?,?,?,'mobile_app',NOW(),NOW())`,
    [reservationId, reservationDetailsId, driverId, catalogStatusId, status,
      note?.slice(0, 500) ?? null],
  );
  if (catalogStatusId) {
    await connection.execute(
      `UPDATE reservation_details
          SET trip_status_id=?,trip_status_updated_by=?,trip_status_updated_at=NOW(),updated_at=NOW()
        WHERE id=? AND reservation_id=?`,
      [catalogStatusId, userId, reservationDetailsId, reservationId],
    );
  }
};
