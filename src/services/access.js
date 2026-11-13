import { nativeServiceCodeSql, nativeCurrencySql, nativeLifecycleSql } from './legacy-reservation-adapter.js';
import { syncClientAssignments } from './client-assignment-sync.js';
import { MOBILE_DRIVER_ASSIGNMENTS } from './driver-assignment-storage.js';
import { forbidden, notFound } from '../common/errors.js';
import { ROLES } from '../config/constants.js';
import { one } from '../db/pool.js';

export const assertCustomerAccess = async (auth, customerId) => {
  if (auth.role === ROLES.CLIENT && Number(auth.customerId) === Number(customerId)) return;
  if (auth.role === ROLES.AGENCY_AGENT) {
    const match = await one(
      `SELECT ac.id
         FROM app_agent_customer_assignments ac JOIN customers c ON c.id=ac.customer_id AND c.deleted_at IS NULL JOIN agents a ON a.id=ac.agent_id AND a.deleted_at IS NULL
        WHERE (c.agency_id IS NULL OR c.agency_id=ac.agency_id)
          AND a.agency_id=ac.agency_id AND ac.agency_id=?
          AND ac.agent_id = ? AND ac.customer_id = ? AND ac.status = 'ACTIVE'`,
      [auth.agencyId, auth.agentId, customerId],
    );
    if (match) return;
  }
  if ([ROLES.ADMIN, ROLES.STAFF].includes(auth.role)) return;
  throw forbidden();
};

export const getReservationForAccess = async (auth, reservationId) => {
  await syncClientAssignments({reservationId});
  const reservation = await one(
    `SELECT r.*, ${nativeServiceCodeSql()} AS service_code, ${nativeLifecycleSql()} AS lifecycle_status, ${nativeCurrencySql()} AS currency_code
       FROM reservations r
       LEFT JOIN reservations arm ON arm.id=r.id
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
      `SELECT id FROM ${MOBILE_DRIVER_ASSIGNMENTS} mobile_assignment
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
