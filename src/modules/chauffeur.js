import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../common/auth.js';
import { LegacyRole, LegacyReservationStatus } from '../common/legacy.js';
import { asyncHandler, ok, validate } from '../common/http.js';
import { badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { exec, one, rows, transaction } from '../db/pool.js';
import { notifyUser } from './notifications.js';
import { emitToReservation, emitToUser } from '../realtime/socket.js';
import { upload } from '../common/upload.js';
import { storeBuffer } from '../integrations/storage.js';
import { env } from '../config/env.js';
import { beginIdempotency, failIdempotency, finishIdempotency, getIdempotentResponse } from '../common/idempotency.js';
const statusOrder = ['ASSIGNED', 'ON_THE_WAY', 'ARRIVED', 'CUSTOMER_COLLECTED', 'IN_SERVICE', 'DROP_OFF_REACHED', 'COMPLETED'];
async function driverId(req) {
    if (req.auth?.driverId)
        return req.auth.driverId;
    const driver = await one('SELECT id FROM drivers WHERE user_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', [req.auth.userId]);
    if (!driver)
        throw forbidden('Driver profile is required');
    return driver.id;
}
async function assignmentFor(reservationId, driver) {
    const row = await one(`SELECT rdv.reservation_id,rdv.reservation_details_id,r.status AS reservation_status,r.customer_id,
            ? AS driver_id,rd.pick_up_location,rd.drop_off_location,rd.pick_up_date,rd.pick_up_time,rv.vehicle_id
       FROM reservation_drivers rdv
       JOIN reservations r ON r.id=rdv.reservation_id AND r.deleted_at IS NULL
       JOIN reservation_details rd ON rd.id=rdv.reservation_details_id AND rd.deleted_at IS NULL
       LEFT JOIN reservation_vehicles rv ON rv.reservation_id=r.id AND rv.reservation_details_id=rd.id AND rv.deleted_at IS NULL AND rv.status=1
      WHERE rdv.reservation_id=? AND rdv.deleted_at IS NULL AND rdv.status=1
        AND (rdv.pick_up_driver_id=? OR rdv.drop_off_driver_id=?)
      ORDER BY rdv.id DESC LIMIT 1`, [driver, reservationId, driver, driver]);
    if (!row)
        throw forbidden('This ride is not assigned to the authenticated chauffeur');
    return row;
}
async function latestRideStatus(reservationId) {
    const row = await one('SELECT checkpoint_type FROM trip_checkpoints WHERE reservation_id=? ORDER BY occurred_at DESC,id DESC LIMIT 1', [reservationId]);
    return row?.checkpoint_type ?? 'ASSIGNED';
}
async function customerUserId(customerId) {
    const row = await one('SELECT user_id FROM customers WHERE id=? AND deleted_at IS NULL', [customerId]);
    return row?.user_id ?? null;
}
function assertNextStatus(current, next) {
    if (current === next)
        return;
    const currentIndex = statusOrder.indexOf(current);
    const nextIndex = statusOrder.indexOf(next);
    if (nextIndex !== currentIndex + 1)
        throw conflict('INVALID_STATUS_TRANSITION', `Ride status cannot move from ${current} to ${next}`);
}
export const chauffeurRouter = Router();
chauffeurRouter.use(requireAuth, requireRoles(LegacyRole.DRIVER));
chauffeurRouter.get('/dashboard', asyncHandler(async (req, res) => {
    const id = await driverId(req);
    const assignments = await rows(`SELECT r.id AS reservation_id,r.reservation_no,r.status,rd.id AS reservation_details_id,rd.pick_up_date,rd.pick_up_time,rd.pick_up_location,rd.drop_off_location,
            c.full_name AS customer_name,v.title AS vehicle_title
       FROM reservation_drivers x
       JOIN reservations r ON r.id=x.reservation_id AND r.deleted_at IS NULL
       JOIN reservation_details rd ON rd.id=x.reservation_details_id AND rd.deleted_at IS NULL
       LEFT JOIN customers c ON c.id=r.customer_id
       LEFT JOIN reservation_vehicles rv ON rv.reservation_id=r.id AND rv.reservation_details_id=rd.id AND rv.deleted_at IS NULL AND rv.status=1
       LEFT JOIN vehicles v ON v.id=rv.vehicle_id
      WHERE x.deleted_at IS NULL AND x.status=1 AND (x.pick_up_driver_id=? OR x.drop_off_driver_id=?)
        AND r.status IN (0,1)
      ORDER BY rd.pick_up_date,rd.pick_up_time LIMIT 100`, [id, id]);
    return ok(res, { driverId: id, assignments });
}));
chauffeurRouter.get('/rides', asyncHandler(async (req, res) => {
    const id = await driverId(req);
    const data = await rows(`SELECT r.id AS reservation_id,r.reservation_no,r.status,rd.id AS reservation_details_id,rd.pick_up_date,rd.pick_up_time,rd.pick_up_location,rd.drop_off_location,c.full_name AS customer_name
       FROM reservation_drivers x JOIN reservations r ON r.id=x.reservation_id JOIN reservation_details rd ON rd.id=x.reservation_details_id
       LEFT JOIN customers c ON c.id=r.customer_id
      WHERE x.deleted_at IS NULL AND x.status=1 AND (x.pick_up_driver_id=? OR x.drop_off_driver_id=?)
      ORDER BY rd.pick_up_date DESC,rd.pick_up_time DESC LIMIT 200`, [id, id]);
    return ok(res, data);
}));
chauffeurRouter.get('/rides/:id', asyncHandler(async (req, res) => {
    const id = await driverId(req);
    const ride = await assignmentFor(Number(req.params.id), id);
    const detail = await one(`SELECT r.id,r.reservation_no,r.service_type,r.status,r.special_note,c.full_name AS customer_name,c.phone_no AS customer_phone,
            rd.*,v.id AS vehicle_id,v.title AS vehicle_title,v.model,v.reg_no
       FROM reservations r JOIN reservation_details rd ON rd.reservation_id=r.id AND rd.status=1 AND rd.deleted_at IS NULL
       LEFT JOIN customers c ON c.id=r.customer_id
       LEFT JOIN reservation_vehicles rv ON rv.reservation_id=r.id AND rv.reservation_details_id=rd.id AND rv.status=1 AND rv.deleted_at IS NULL
       LEFT JOIN vehicles v ON v.id=rv.vehicle_id WHERE r.id=? LIMIT 1`, [ride.reservation_id]);
    return ok(res, { ...detail, rideStatus: await latestRideStatus(ride.reservation_id) });
}));
chauffeurRouter.post('/rides/:id/start', asyncHandler(async (req, res) => {
    const id = await driverId(req);
    const ride = await assignmentFor(Number(req.params.id), id);
    if (ride.reservation_status !== LegacyReservationStatus.CONFIRMED)
        throw conflict('BOOKING_NOT_CONFIRMED', 'The booking must be confirmed before the chauffeur can start service');
    const current = await latestRideStatus(ride.reservation_id);
    if (current !== 'ASSIGNED')
        return ok(res, { status: current, alreadyStarted: true });
    const now = new Date();
    await transaction(async (conn) => {
        await exec('INSERT INTO trip_checkpoints (reservation_id,reservation_details_id,driver_id,checkpoint_type,occurred_at,created_at) VALUES (?,?,?,\'ON_THE_WAY\',?,NOW())', [ride.reservation_id, ride.reservation_details_id, id, now], conn);
        await exec('INSERT INTO reservation_status_events (reservation_id,reservation_details_id,actor_user_id,actor_role,status,note,occurred_at) VALUES (?,?,?,\'DRIVER\',\'ON_THE_WAY\',\'Chauffeur started service\',?)', [ride.reservation_id, ride.reservation_details_id, req.auth.userId, now], conn);
    });
    const customerUser = await customerUserId(ride.customer_id);
    if (customerUser)
        await notifyUser(customerUser, 'DRIVER_ON_THE_WAY', 'Your chauffeur is on the way', 'Your chauffeur has started heading to the pickup location.', { reservationId: ride.reservation_id });
    emitToReservation(ride.reservation_id, 'ride.status', { reservationId: ride.reservation_id, status: 'ON_THE_WAY' });
    return ok(res, { status: 'ON_THE_WAY' });
}));
chauffeurRouter.post('/rides/:id/checkpoints', asyncHandler(async (req, res) => {
    const body = validate(z.object({
        type: z.enum(['ARRIVED', 'CUSTOMER_COLLECTED', 'IN_SERVICE', 'DROP_OFF_REACHED', 'COMPLETED']),
        latitude: z.number().min(-90).max(90).optional(), longitude: z.number().min(-180).max(180).optional(), note: z.string().max(1000).optional()
    }), req.body);
    const id = await driverId(req);
    const ride = await assignmentFor(Number(req.params.id), id);
    const current = await latestRideStatus(ride.reservation_id);
    assertNextStatus(current, body.type);
    const now = new Date();
    await transaction(async (conn) => {
        await exec('INSERT INTO trip_checkpoints (reservation_id,reservation_details_id,driver_id,checkpoint_type,latitude,longitude,note,occurred_at,created_at) VALUES (?,?,?,?,?,?,?,?,NOW())', [ride.reservation_id, ride.reservation_details_id, id, body.type, body.latitude ?? null, body.longitude ?? null, body.note ?? null, now], conn);
        await exec('INSERT INTO reservation_status_events (reservation_id,reservation_details_id,actor_user_id,actor_role,status,note,latitude,longitude,occurred_at) VALUES (?,?,?,\'DRIVER\',?,?,?,?,?,?)', [ride.reservation_id, ride.reservation_details_id, req.auth.userId, body.type, body.note ?? null, body.latitude ?? null, body.longitude ?? null, now], conn);
        if (body.type === 'COMPLETED')
            await exec('UPDATE reservations SET status=2,updated_at=NOW(),data_sync_to_zoho=0 WHERE id=?', [ride.reservation_id], conn);
    });
    const customerUser = await customerUserId(ride.customer_id);
    if (customerUser)
        await notifyUser(customerUser, `RIDE_${body.type}`, `Ride update: ${body.type.replaceAll('_', ' ')}`, `Reservation ${ride.reservation_id} is now ${body.type.replaceAll('_', ' ').toLowerCase()}.`, { reservationId: ride.reservation_id, status: body.type });
    emitToReservation(ride.reservation_id, 'ride.status', { reservationId: ride.reservation_id, status: body.type, latitude: body.latitude, longitude: body.longitude, occurredAt: now.toISOString() });
    return ok(res, { status: body.type, occurredAt: now.toISOString() });
}));
chauffeurRouter.post('/rides/:id/location', asyncHandler(async (req, res) => {
    const body = validate(z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180), accuracy: z.number().nonnegative().optional(), speed: z.number().nonnegative().optional(), heading: z.number().min(0).max(360).optional(), recordedAt: z.string().datetime().optional() }), req.body);
    const id = await driverId(req);
    const ride = await assignmentFor(Number(req.params.id), id);
    const status = await latestRideStatus(ride.reservation_id);
    if (!['ON_THE_WAY', 'ARRIVED', 'CUSTOMER_COLLECTED', 'IN_SERVICE', 'DROP_OFF_REACHED'].includes(status))
        throw conflict('GPS_NOT_ALLOWED', `GPS sharing is not allowed while ride status is ${status}`);
    const recordedAt = body.recordedAt ? new Date(body.recordedAt) : new Date();
    await exec('INSERT INTO driver_locations (driver_id,reservation_id,reservation_details_id,latitude,longitude,accuracy,speed,heading,recorded_at,created_at) VALUES (?,?,?,?,?,?,?,?,?,NOW())', [id, ride.reservation_id, ride.reservation_details_id, body.latitude, body.longitude, body.accuracy ?? null, body.speed ?? null, body.heading ?? null, recordedAt]);
    const locationPayload = { reservationId: ride.reservation_id, driverId: id, ...body, recordedAt: recordedAt.toISOString() };
    emitToReservation(ride.reservation_id, 'ride.location', locationPayload);
    const customerUser = await customerUserId(ride.customer_id);
    if (customerUser)
        emitToUser(customerUser, 'ride.location', locationPayload);
    return ok(res, { accepted: true, status });
}));
chauffeurRouter.get('/rides/:id/locations', asyncHandler(async (req, res) => {
    const id = await driverId(req);
    await assignmentFor(Number(req.params.id), id);
    const data = await rows('SELECT latitude,longitude,accuracy,speed,heading,recorded_at FROM driver_locations WHERE reservation_id=? ORDER BY recorded_at DESC LIMIT 500', [Number(req.params.id)]);
    return ok(res, data);
}));
chauffeurRouter.get('/expense-types', asyncHandler(async (_req, res) => {
    return ok(res, await rows('SELECT id,code,title FROM expense_types WHERE status=1 ORDER BY id'));
}));
chauffeurRouter.post('/rides/:id/expenses', upload.single('receipt'), asyncHandler(async (req, res) => {
    const scope = `driver-expense:${req.params.id}`;
    const cached = await getIdempotentResponse(req, scope);
    if (cached)
        return res.status(cached.status).json(cached.body);
    await beginIdempotency(req, scope);
    try {
        const body = validate(z.object({ expenseTypeId: z.coerce.number().int().positive(), amount: z.coerce.number().positive(), currency: z.string().max(8).default(env.DEFAULT_CURRENCY), note: z.string().max(2000).optional() }), req.body);
        const id = await driverId(req);
        const ride = await assignmentFor(Number(req.params.id), id);
        const type = await one('SELECT id FROM expense_types WHERE id=? AND status=1', [body.expenseTypeId]);
        if (!type)
            throw notFound('Expense type');
        let receiptPath = null;
        if (req.file)
            receiptPath = (await storeBuffer(req.file.buffer, req.file.originalname, req.file.mimetype, `expenses/${id}`)).path;
        const result = await exec('INSERT INTO driver_expenses (reservation_id,reservation_details_id,driver_id,expense_type_id,amount,currency,receipt_path,note,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,\'SUBMITTED\',NOW(),NOW())', [ride.reservation_id, ride.reservation_details_id, id, body.expenseTypeId, body.amount, body.currency, receiptPath, body.note ?? null]);
        const response = { success: true, data: { id: result.insertId, reservationId: ride.reservation_id, ...body, receiptPath, status: 'SUBMITTED' } };
        await finishIdempotency(req, scope, 201, response);
        return res.status(201).json(response);
    }
    catch (error) {
        await failIdempotency(req, scope);
        throw error;
    }
}));
chauffeurRouter.get('/expenses', asyncHandler(async (req, res) => {
    const id = await driverId(req);
    const data = await rows(`SELECT e.*,t.code,t.title FROM driver_expenses e JOIN expense_types t ON t.id=e.expense_type_id WHERE e.driver_id=? ORDER BY e.created_at DESC LIMIT 200`, [id]);
    return ok(res, data);
}));
chauffeurRouter.get('/history', asyncHandler(async (req, res) => {
    const id = await driverId(req);
    const data = await rows(`SELECT r.id AS reservation_id,r.reservation_no,rd.pick_up_date,rd.pick_up_location,rd.drop_off_location,r.status,
            COALESCE(x.pick_up_driver_cost,0)+COALESCE(x.drop_off_driver_cost,0) AS legacy_earnings
       FROM reservation_drivers x JOIN reservations r ON r.id=x.reservation_id JOIN reservation_details rd ON rd.id=x.reservation_details_id
      WHERE (x.pick_up_driver_id=? OR x.drop_off_driver_id=?) AND r.status=2 ORDER BY rd.pick_up_date DESC LIMIT 200`, [id, id]);
    return ok(res, { rides: data, earningsRule: 'Displayed from legacy reservation_drivers costs. The client specification leaves final earnings rules TBC.' });
}));
chauffeurRouter.get('/documents', asyncHandler(async (req, res) => {
    const id = await driverId(req);
    return ok(res, await rows('SELECT id,file_name,file_path,created_at,updated_at FROM driver_files WHERE driver_id=? ORDER BY id DESC', [id]));
}));
chauffeurRouter.post('/documents', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file)
        throw badRequest('FILE_REQUIRED', 'A file is required');
    const id = await driverId(req);
    const stored = await storeBuffer(req.file.buffer, req.file.originalname, req.file.mimetype, `driver-documents/${id}`);
    const result = await exec('INSERT INTO driver_files (driver_id,file_name,file_path,created_at,updated_at) VALUES (?,?,?,NOW(),NOW())', [id, req.file.originalname, stored.path]);
    return ok(res, { id: result.insertId, fileName: req.file.originalname, filePath: stored.path }, 201);
}));
