import { forbidden, notFound } from '../common/errors.js';
import { ROLES } from '../config/constants.js';
import { one } from '../db/pool.js';

export const assertCustomerAccess = async (auth, customerId) => {
  if (auth.role === ROLES.CLIENT && Number(auth.customerId) === Number(customerId)) return;
  if (auth.role === ROLES.AGENCY_AGENT) {
    const match = await one(
      `SELECT ac.id
         FROM app_agent_customer_assignments ac
        WHERE ac.agent_id = ? AND ac.customer_id = ? AND ac.status = 'ACTIVE'`,
      [auth.agentId, customerId],
    );
    if (match) return;
  }
  if ([ROLES.ADMIN, ROLES.STAFF].includes(auth.role)) return;
  throw forbidden();
};

export const getReservationForAccess = async (auth, reservationId) => {
  const reservation = await one(
    `SELECT r.*, arm.created_by_agent_id, arm.service_code, arm.lifecycle_status
       FROM reservations r
       LEFT JOIN app_reservation_meta arm ON arm.reservation_id = r.id
      WHERE r.id = ? AND r.deleted_at IS NULL`,
    [reservationId],
  );
  if (!reservation) throw notFound('Booking not found');

  if ([ROLES.ADMIN, ROLES.STAFF].includes(auth.role)) return reservation;
  if (auth.role === ROLES.CLIENT && Number(reservation.customer_id) === Number(auth.customerId))
    return reservation;
  if (auth.role === ROLES.AGENCY_AGENT && Number(reservation.agency_id) === Number(auth.agencyId)) {
    await assertCustomerAccess(auth, reservation.customer_id);
    return reservation;
  }
  if (auth.role === ROLES.CHAUFFEUR) {
    const assignment = await one(
      `SELECT id FROM app_driver_assignments
        WHERE reservation_id = ? AND driver_id = ? AND status NOT IN ('DECLINED','CANCELLED')`,
      [reservationId, auth.driverId],
    );
    if (assignment) return reservation;
  }
  throw forbidden();
};

export const getDraftForAccess = async (auth, draftId, connection = null, lock = false) => {
  const executor = connection ?? {
    execute: async (sql, params) => [
      await import('../db/pool.js').then(({ query }) => query(sql, params)),
    ],
  };
  const [rows] = await executor.execute(
    `SELECT * FROM app_booking_drafts WHERE id = ? ${lock ? 'FOR UPDATE' : ''}`,
    [draftId],
  );
  const draft = rows[0];
  if (!draft) throw notFound('Booking draft not found');
  if (
    Number(draft.created_by_user_id) !== Number(auth.userId) &&
    ![ROLES.ADMIN, ROLES.STAFF].includes(auth.role)
  ) {
    throw forbidden();
  }
  return draft;
};
