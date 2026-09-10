import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../common/auth.js';
import { LegacyRole } from '../common/legacy.js';
import { asyncHandler, ok, validate } from '../common/http.js';
import { forbidden, notFound } from '../common/errors.js';
import { exec, one, rows } from '../db/pool.js';
import { bookingView } from './bookings.js';
async function clientProfile(userId) {
    const row = await one(`SELECT c.id,c.uuid,c.title,c.full_name,c.last_name,c.photo,c.email,c.date_of_birth,c.phone_no,c.country,c.country_id,c.city,c.zip_code,c.state,c.address_one,c.address_two,c.licence_no,c.licence_expired_date,c.passport_no,c.passport_expired_date,c.status,c.user_id
       FROM customers c WHERE c.user_id=? AND c.deleted_at IS NULL ORDER BY c.id DESC LIMIT 1`, [userId]);
    if (!row)
        throw forbidden('Customer profile is required');
    return row;
}
export const clientRouter = Router();
clientRouter.use(requireAuth, requireRoles(LegacyRole.CUSTOMER));
clientRouter.get('/dashboard', asyncHandler(async (req, res) => {
    const profile = await clientProfile(req.auth.userId);
    const bookings = await rows(`SELECT r.id,r.reservation_no,r.service_type,r.status,r.payment_status,rd.pick_up_date,rd.pick_up_time,rd.pick_up_location,rd.drop_off_location,v.title AS vehicle_title
       FROM reservations r LEFT JOIN reservation_details rd ON rd.reservation_id=r.id AND rd.status=1 AND rd.deleted_at IS NULL
       LEFT JOIN reservation_vehicles rv ON rv.reservation_id=r.id AND rv.reservation_details_id=rd.id AND rv.status=1 AND rv.deleted_at IS NULL
       LEFT JOIN vehicles v ON v.id=rv.vehicle_id WHERE r.customer_id=? AND r.deleted_at IS NULL
      ORDER BY CASE WHEN r.status IN (0,1) THEN 0 ELSE 1 END,rd.pick_up_date DESC,r.id DESC LIMIT 20`, [profile.id]);
    const current = bookings.find((b) => [0, 1].includes(Number(b.status))) ?? null;
    return ok(res, { profile, currentBooking: current, bookings });
}));
clientRouter.get('/profile', asyncHandler(async (req, res) => ok(res, await clientProfile(req.auth.userId))));
clientRouter.patch('/profile', asyncHandler(async (req, res) => {
    const body = validate(z.object({ fullName: z.string().min(2).max(191).optional(), lastName: z.string().max(255).nullable().optional(), phone: z.string().max(191).optional(), city: z.string().max(191).nullable().optional(), state: z.string().max(191).nullable().optional(), zipCode: z.string().max(191).nullable().optional(), addressOne: z.string().max(191).nullable().optional(), addressTwo: z.string().max(191).nullable().optional() }), req.body);
    const current = await clientProfile(req.auth.userId);
    const sets = [];
    const params = [];
    const map = { fullName: 'full_name', lastName: 'last_name', phone: 'phone_no', city: 'city', state: 'state', zipCode: 'zip_code', addressOne: 'address_one', addressTwo: 'address_two' };
    for (const [key, col] of Object.entries(map))
        if (body[key] !== undefined) {
            sets.push(`${col}=?`);
            params.push(body[key]);
        }
    if (sets.length)
        await exec(`UPDATE customers SET ${sets.join(',')},updated_at=NOW() WHERE id=?`, [...params, current.id]);
    if (body.fullName)
        await exec('UPDATE users SET full_name=?,updated_at=NOW() WHERE id=?', [body.fullName, req.auth.userId]);
    return ok(res, await clientProfile(req.auth.userId));
}));
clientRouter.get('/bookings/:id/tracking', asyncHandler(async (req, res) => {
    const booking = await bookingView(Number(req.params.id), req.auth.userId);
    const lastLocation = await one('SELECT driver_id,latitude,longitude,accuracy,speed,heading,recorded_at FROM driver_locations WHERE reservation_id=? ORDER BY recorded_at DESC,id DESC LIMIT 1', [Number(req.params.id)]);
    const checkpoints = await rows('SELECT checkpoint_type,latitude,longitude,note,occurred_at FROM trip_checkpoints WHERE reservation_id=? ORDER BY occurred_at,id', [Number(req.params.id)]);
    const driver = await one(`SELECT d.id,d.full_name,d.photo,d.phone,v.id AS vehicle_id,v.title AS vehicle_title,v.model,v.reg_no
       FROM reservation_drivers rd JOIN drivers d ON d.id=rd.pick_up_driver_id
       LEFT JOIN reservation_vehicles rv ON rv.reservation_id=rd.reservation_id AND rv.reservation_details_id=rd.reservation_details_id AND rv.status=1 AND rv.deleted_at IS NULL
       LEFT JOIN vehicles v ON v.id=rv.vehicle_id
      WHERE rd.reservation_id=? AND rd.status=1 AND rd.deleted_at IS NULL ORDER BY rd.id DESC LIMIT 1`, [Number(req.params.id)]);
    if (!booking)
        throw notFound('Booking');
    return ok(res, { reservationId: Number(req.params.id), bookingStatus: booking.status, driver, lastLocation, checkpoints });
}));
