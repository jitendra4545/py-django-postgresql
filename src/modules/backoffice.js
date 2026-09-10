import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../common/auth.js';
import { LegacyReservationStatus, LegacyRole, LegacyServiceType } from '../common/legacy.js';
import { asyncHandler, ok, validate } from '../common/http.js';
import { badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { env } from '../config/env.js';
import { exec, one, transaction } from '../db/pool.js';
import { notifyUser } from './notifications.js';
async function bookingCore(reservationId) {
    const row = await one('SELECT id,customer_id,service_type,status,reservation_no FROM reservations WHERE id=? AND deleted_at IS NULL', [reservationId]);
    if (!row)
        throw notFound('Booking');
    return row;
}
async function customerUser(customerId) {
    const row = await one('SELECT user_id FROM customers WHERE id=? AND deleted_at IS NULL', [customerId]);
    return row?.user_id ?? null;
}
async function driverUser(driverId) {
    const row = await one('SELECT user_id FROM drivers WHERE id=? AND deleted_at IS NULL', [driverId]);
    if (!row)
        throw notFound('Driver');
    return row.user_id;
}
async function agentUser(agentId) {
    const row = await one('SELECT user_id FROM agents WHERE id=? AND deleted_at IS NULL', [agentId]);
    if (!row)
        throw notFound('Agent');
    return row.user_id;
}
export const backofficeRouter = Router();
backofficeRouter.use(requireAuth, requireRoles(LegacyRole.ADMIN, LegacyRole.USER));
backofficeRouter.use((req, _res, next) => {
    if (!env.ALLOW_BACKOFFICE_TEST_API)
        return next(forbidden('Back-office testing API is disabled'));
    next();
});
backofficeRouter.post('/bookings/:id/decision', asyncHandler(async (req, res) => {
    const body = validate(z.object({ decision: z.enum(['CONFIRM', 'REJECT']), reason: z.string().max(2000).optional() }), req.body);
    const booking = await bookingCore(Number(req.params.id));
    if (booking.status === LegacyReservationStatus.COMPLETE)
        throw conflict('BOOKING_ALREADY_COMPLETED', 'Completed booking cannot be changed');
    const legacyStatus = body.decision === 'CONFIRM' ? LegacyReservationStatus.CONFIRMED : LegacyReservationStatus.CANCELLED;
    const eventStatus = body.decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED';
    await transaction(async (conn) => {
        await exec('UPDATE reservations SET status=?,updated_by=?,updated_at=NOW(),data_sync_to_zoho=0 WHERE id=?', [legacyStatus, req.auth.userId, booking.id], conn);
        await exec('INSERT INTO reservation_status_events (reservation_id,actor_user_id,actor_role,status,note,occurred_at) VALUES (?,?,\'BACKOFFICE\',?,?,NOW())', [booking.id, req.auth.userId, eventStatus, body.reason ?? null], conn);
        if (body.decision === 'REJECT')
            await exec('DELETE FROM vehicle_reserved_dates WHERE reservation_id=?', [booking.id], conn);
    });
    const uid = await customerUser(booking.customer_id);
    if (uid)
        await notifyUser(uid, `BOOKING_${eventStatus}`, `Booking ${eventStatus.toLowerCase()}`, body.decision === 'CONFIRM' ? `Reservation ${booking.reservation_no} is confirmed.` : `Reservation ${booking.reservation_no} was rejected.`, { reservationId: booking.id, reason: body.reason ?? '' });
    return ok(res, { reservationId: booking.id, status: eventStatus });
}));
backofficeRouter.post('/bookings/:id/assign-chauffeur', asyncHandler(async (req, res) => {
    const body = validate(z.object({ driverId: z.number().int().positive(), reservationDetailsId: z.number().int().positive().optional() }), req.body);
    const booking = await bookingCore(Number(req.params.id));
    if (![LegacyServiceType.CHAUFFEUR, LegacyServiceType.TRANSFER].includes(booking.service_type))
        throw badRequest('NOT_CHAUFFEUR_BOOKING', 'This booking is not a chauffeur/transfer service');
    if (booking.status !== LegacyReservationStatus.CONFIRMED)
        throw conflict('BOOKING_NOT_CONFIRMED', 'Confirm the booking before assigning a chauffeur');
    const detail = body.reservationDetailsId
        ? await one('SELECT id,pick_up_date,pick_up_time,drop_off_date,drop_off_time FROM reservation_details WHERE id=? AND reservation_id=? AND deleted_at IS NULL', [body.reservationDetailsId, booking.id])
        : await one('SELECT id,pick_up_date,pick_up_time,drop_off_date,drop_off_time FROM reservation_details WHERE reservation_id=? AND status=1 AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', [booking.id]);
    if (!detail)
        throw notFound('Reservation detail');
    const dUser = await driverUser(body.driverId);
    await transaction(async (conn) => {
        const existing = await one('SELECT id FROM reservation_drivers WHERE reservation_id=? AND reservation_details_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', [booking.id, detail.id], conn);
        if (existing) {
            await exec('UPDATE reservation_drivers SET pick_up_driver_id=?,drop_off_driver_id=?,status=1,updated_by=?,updated_at=NOW() WHERE id=?', [body.driverId, body.driverId, req.auth.userId, existing.id], conn);
        }
        else {
            await exec(`INSERT INTO reservation_drivers (reservation_id,reservation_details_id,pick_up_date,pick_up_time,pick_up_driver_id,drop_off_date,drop_off_time,drop_off_driver_id,user_id,status,created_at,updated_at)
                  VALUES (?,?,?,?,?,?,?,?,?,1,NOW(),NOW())`, [booking.id, detail.id, detail.pick_up_date, detail.pick_up_time, body.driverId, detail.drop_off_date, detail.drop_off_time, body.driverId, req.auth.userId], conn);
        }
        await exec('INSERT INTO reservation_status_events (reservation_id,reservation_details_id,actor_user_id,actor_role,status,note,metadata,occurred_at) VALUES (?,?,?,\'BACKOFFICE\',\'ASSIGNED\',\'Chauffeur assigned\',?,NOW())', [booking.id, detail.id, req.auth.userId, JSON.stringify({ driverId: body.driverId })], conn);
    });
    await notifyUser(dUser, 'NEW_CHAUFFEUR_ASSIGNMENT', 'New chauffeur assignment', `You have been assigned reservation ${booking.reservation_no}.`, { reservationId: booking.id, reservationDetailsId: detail.id });
    const customer = await customerUser(booking.customer_id);
    if (customer)
        await notifyUser(customer, 'CHAUFFEUR_ASSIGNED', 'Chauffeur assigned', `A chauffeur has been assigned to reservation ${booking.reservation_no}.`, { reservationId: booking.id, driverId: body.driverId });
    return ok(res, { reservationId: booking.id, reservationDetailsId: detail.id, driverId: body.driverId });
}));
backofficeRouter.post('/bookings/:id/assign-agent', asyncHandler(async (req, res) => {
    const body = validate(z.object({ agentId: z.number().int().positive(), reservationDetailsId: z.number().int().positive().optional(), vehicleId: z.number().int().positive().optional() }), req.body);
    const booking = await bookingCore(Number(req.params.id));
    if (booking.service_type !== LegacyServiceType.CAR_RENTAL)
        throw badRequest('NOT_RENTAL_BOOKING', 'Rental agent assignments are for car rental bookings');
    if (booking.status !== LegacyReservationStatus.CONFIRMED)
        throw conflict('BOOKING_NOT_CONFIRMED', 'Confirm the booking before assigning a rental agent');
    const detail = body.reservationDetailsId
        ? await one('SELECT id FROM reservation_details WHERE id=? AND reservation_id=? AND deleted_at IS NULL', [body.reservationDetailsId, booking.id])
        : await one('SELECT id FROM reservation_details WHERE reservation_id=? AND status=1 AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', [booking.id]);
    if (!detail)
        throw notFound('Reservation detail');
    const vehicle = body.vehicleId
        ? await one('SELECT vehicle_id FROM reservation_vehicles WHERE reservation_id=? AND reservation_details_id=? AND vehicle_id=? AND deleted_at IS NULL AND status=1', [booking.id, detail.id, body.vehicleId])
        : await one('SELECT vehicle_id FROM reservation_vehicles WHERE reservation_id=? AND reservation_details_id=? AND deleted_at IS NULL AND status=1 ORDER BY id DESC LIMIT 1', [booking.id, detail.id]);
    if (!vehicle)
        throw notFound('Assigned vehicle');
    const aUser = await agentUser(body.agentId);
    await exec(`INSERT INTO rental_agent_assignments (reservation_id,reservation_details_id,vehicle_id,agent_id,status,assigned_by,created_at,updated_at)
              VALUES (?,?,?,?,\'ASSIGNED\',?,NOW(),NOW())
              ON DUPLICATE KEY UPDATE agent_id=VALUES(agent_id),status='ASSIGNED',assigned_by=VALUES(assigned_by),updated_at=NOW()`, [booking.id, detail.id, vehicle.vehicle_id, body.agentId, req.auth.userId]);
    await exec('INSERT INTO reservation_status_events (reservation_id,reservation_details_id,actor_user_id,actor_role,status,note,metadata,occurred_at) VALUES (?,?,?,\'BACKOFFICE\',\'RENTAL_AGENT_ASSIGNED\',\'Rental agent assigned\',?,NOW())', [booking.id, detail.id, req.auth.userId, JSON.stringify({ agentId: body.agentId, vehicleId: vehicle.vehicle_id })]);
    await notifyUser(aUser, 'NEW_RENTAL_ASSIGNMENT', 'New rental assignment', `You have been assigned rental reservation ${booking.reservation_no}.`, { reservationId: booking.id });
    return ok(res, { reservationId: booking.id, reservationDetailsId: detail.id, agentId: body.agentId, vehicleId: vehicle.vehicle_id });
}));
backofficeRouter.patch('/bookings/:id/schedule', asyncHandler(async (req, res) => {
    const body = validate(z.object({ pickupDate: z.string().date().optional(), pickupTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(), dropoffDate: z.string().date().optional(), dropoffTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(), pickupLocation: z.string().max(191).optional(), dropoffLocation: z.string().max(191).optional(), note: z.string().max(2000).optional() }), req.body);
    const booking = await bookingCore(Number(req.params.id));
    const detail = await one('SELECT id FROM reservation_details WHERE reservation_id=? AND status=1 AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', [booking.id]);
    if (!detail)
        throw notFound('Reservation detail');
    const sets = [];
    const params = [];
    const map = { pickupDate: 'pick_up_date', pickupTime: 'pick_up_time', dropoffDate: 'drop_off_date', dropoffTime: 'drop_off_time', pickupLocation: 'pick_up_location', dropoffLocation: 'drop_off_location' };
    for (const [key, col] of Object.entries(map))
        if (body[key] !== undefined) {
            sets.push(`${col}=?`);
            params.push(body[key]);
        }
    if (sets.length)
        await exec(`UPDATE reservation_details SET ${sets.join(',')},updated_at=NOW() WHERE id=?`, [...params, detail.id]);
    await exec('INSERT INTO reservation_status_events (reservation_id,reservation_details_id,actor_user_id,actor_role,status,note,metadata,occurred_at) VALUES (?,?,?,\'BACKOFFICE\',\'SCHEDULE_CHANGED\',?,?,NOW())', [booking.id, detail.id, req.auth.userId, body.note ?? null, JSON.stringify(body)]);
    const customer = await customerUser(booking.customer_id);
    if (customer)
        await notifyUser(customer, 'SCHEDULE_CHANGED', 'Booking schedule changed', `Reservation ${booking.reservation_no} has been updated.`, { reservationId: booking.id });
    const driver = await one(`SELECT d.user_id FROM reservation_drivers rd JOIN drivers d ON d.id=rd.pick_up_driver_id WHERE rd.reservation_id=? AND rd.deleted_at IS NULL AND rd.status=1 ORDER BY rd.id DESC LIMIT 1`, [booking.id]);
    if (driver)
        await notifyUser(driver.user_id, 'SCHEDULE_CHANGED', 'Assigned ride changed', `Reservation ${booking.reservation_no} has updated schedule/details.`, { reservationId: booking.id });
    return ok(res, { reservationId: booking.id, changed: body });
}));
