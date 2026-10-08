import Decimal from 'decimal.js';

export const calculateCommissionAmount = (total, percentage) =>
  new Decimal(total ?? 0)
    .times(percentage ?? 0)
    .dividedBy(100)
    .toDecimalPlaces(2)
    .toNumber();

export const syncAgencyCommissions = async (connection, reservationId, actorUserId) => {
  const [reservations] = await connection.execute(
    `SELECT r.agency_id,a.commission
       FROM reservations r
       LEFT JOIN agencies a ON a.id=r.agency_id AND a.deleted_at IS NULL
      WHERE r.id=?`,
    [reservationId],
  );
  const reservation = reservations[0];
  if (!reservation?.agency_id) return { created: 0 };

  const percentage = Number(reservation.commission ?? 0);
  const [costs] = await connection.execute(
    `SELECT reservation_details_id,total_amount
       FROM reservation_costs
      WHERE reservation_id=? AND status=1`,
    [reservationId],
  );

  await connection.execute(
    `UPDATE agency_commissions
        SET deleted_at=NOW(),updated_at=NOW(),updated_by=?
      WHERE reservation_id=? AND is_custom_updated=0 AND deleted_at IS NULL`,
    [actorUserId, reservationId],
  );
  for (const cost of costs) {
    const commissionAmount = calculateCommissionAmount(cost.total_amount, percentage);
    await connection.execute(
      `INSERT INTO agency_commissions
        (is_custom_updated,reservation_id,reservation_details_id,agency_id,commission_amount,
         paid_amount,due_amount,commission_percentage,status,user_id,created_at,updated_at)
       VALUES (0,?,?,?,?,0,?,?,1,?,NOW(),NOW())`,
      [
        reservationId,
        cost.reservation_details_id,
        reservation.agency_id,
        commissionAmount,
        commissionAmount,
        percentage,
        actorUserId,
      ],
    );
  }
  return { created: costs.length, percentage };
};
