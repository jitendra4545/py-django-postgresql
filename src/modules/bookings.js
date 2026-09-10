import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { requireAuth, requireRoles } from '../common/auth.js';
import { LegacyReservationStatus, LegacyRole, LegacyServiceType } from '../common/legacy.js';
import { asyncHandler, ok, validate } from '../common/http.js';
import { badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { db, exec, one, rows, transaction } from '../db/pool.js';
import { env } from '../config/env.js';
import { availableVehicles, calculateQuote } from './catalog.js';
import { paymentProvider } from '../integrations/payment.js';
import { notifyUser } from './notifications.js';
import { beginIdempotency, failIdempotency, finishIdempotency, getIdempotentResponse } from '../common/idempotency.js';
const detailsSchema = z.object({
    pickupLocation: z.string().min(2).max(191),
    dropoffLocation: z.string().max(191).optional().nullable(),
    pickupDate: z.string().date(),
    pickupTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    dropoffDate: z.string().date().optional().nullable(),
    dropoffTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional().nullable(),
    pickupCountryId: z.number().int().positive().optional(),
    dropoffCountryId: z.number().int().positive().optional(),
    pickupLatitude: z.number().min(-90).max(90).optional(),
    pickupLongitude: z.number().min(-180).max(180).optional(),
    pickupPlaceId: z.string().max(255).optional().nullable(),
    dropoffLatitude: z.number().min(-90).max(90).optional(),
    dropoffLongitude: z.number().min(-180).max(180).optional(),
    dropoffPlaceId: z.string().max(255).optional().nullable(),
    pickupCity: z.string().max(255).optional().nullable(),
    dropoffCity: z.string().max(255).optional().nullable(),
    approximateDistance: z.number().nonnegative().optional(),
    passengers: z.number().int().positive().max(50).optional(),
    flightNumber: z.string().max(191).optional().nullable(),
    notes: z.string().max(5000).optional().nullable(),
    passengerContact: z.object({ name: z.string().min(1).max(191), phone: z.string().max(191), email: z.string().email().max(191) }).optional()
});
const optionsSchema = z.object({
    vehicleId: z.number().int().positive(),
    optionIds: z.array(z.number().int().positive()).default([]),
    insurance: z.enum(['NONE', 'HALF', 'FULL']).default('NONE'),
    couponCode: z.string().max(191).optional()
});
function parseJson(value) {
    if (value == null)
        return null;
    return typeof value === 'string' ? JSON.parse(value) : value;
}
async function customerIdForUser(userId) {
    const customer = await one('SELECT id FROM customers WHERE user_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', [userId]);
    if (!customer)
        throw forbidden('Customer profile is required');
    return customer.id;
}
async function getDraft(id, userId, executor = db) {
    const row = await one('SELECT * FROM booking_drafts WHERE id=? AND user_id=?', [id, userId], executor);
    if (!row)
        throw notFound('Booking draft');
    return row;
}
function dateRange(from, to) {
    const result = [];
    let current = new Date(`${from}T00:00:00Z`);
    const end = new Date(`${to}T00:00:00Z`);
    while (current <= end) {
        result.push(current.toISOString().slice(0, 10));
        current = new Date(current.getTime() + 86400_000);
    }
    return result;
}
async function generateReservationNo(conn) {
    for (let i = 0; i < 5; i++) {
        const candidate = `DLM${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;
        const found = await one('SELECT id FROM reservations WHERE reservation_no=? LIMIT 1', [candidate], conn);
        if (!found)
            return candidate;
    }
    return `DLM${uuid().replace(/-/g, '').slice(0, 12).toUpperCase()}`;
}
async function addStatusEvent(conn, reservationId, detailId, userId, role, status, note, metadata) {
    await exec('INSERT INTO reservation_status_events (reservation_id,reservation_details_id,actor_user_id,actor_role,status,note,metadata,occurred_at) VALUES (?,?,?,?,?,?,?,NOW())', [reservationId, detailId, userId, role, status, note ?? null, metadata ? JSON.stringify(metadata) : null], conn);
}
export async function bookingView(reservationId, userId) {
    const booking = await one(`SELECT r.id,r.uuid,r.reservation_no,r.service_type,r.customer_id,r.currency,r.status,r.payment_status,r.payment_method,r.special_note,r.created_at,r.updated_at,
            rd.id AS reservation_details_id,rd.pick_up_location,rd.drop_off_location,rd.pick_up_date,rd.drop_off_date,rd.pick_up_time,rd.drop_off_time,rd.pick_up_city,rd.drop_off_city,rd.approximate_distance,rd.special_note AS detail_note,
            rv.vehicle_id,v.title AS vehicle_title,v.model AS vehicle_model,v.reg_no,vc.title AS vehicle_class,
            rc.base_rate,rc.optional_cost,rc.insurance_cost,rc.total_tax,rc.discount AS cost_discount,rc.total_amount
       FROM reservations r
       LEFT JOIN reservation_details rd ON rd.reservation_id=r.id AND rd.deleted_at IS NULL AND rd.status=1
       LEFT JOIN reservation_vehicles rv ON rv.reservation_id=r.id AND rv.reservation_details_id=rd.id AND rv.deleted_at IS NULL AND rv.status=1
       LEFT JOIN vehicles v ON v.id=rv.vehicle_id
       LEFT JOIN vehicle_classes vc ON vc.id=v.vehicle_class_id
       LEFT JOIN reservation_costs rc ON rc.reservation_id=r.id AND rc.reservation_details_id=rd.id AND rc.status=1
      WHERE r.id=? AND r.deleted_at IS NULL`, [reservationId]);
    if (!booking)
        throw notFound('Booking');
    if (userId) {
        const customer = await one('SELECT user_id FROM customers WHERE id=? LIMIT 1', [booking.customer_id]);
        if (!customer || customer.user_id !== userId)
            throw forbidden();
    }
    const flight = await one('SELECT flight_number,departure_time,arrival_time,terminal FROM reservation_flight_numbers WHERE reservation_id=? ORDER BY id DESC LIMIT 1', [reservationId]);
    const locations = await rows('SELECT location_type,address,latitude,longitude,place_id FROM mobile_booking_locations WHERE reservation_id=? ORDER BY id', [reservationId]);
    const events = await rows('SELECT status,note,latitude,longitude,metadata,occurred_at FROM reservation_status_events WHERE reservation_id=? ORDER BY occurred_at,id', [reservationId]);
    const options = await rows('SELECT rental_option_id,rental_option_text,quantity,amount,total_amount FROM reservation_optional_costs WHERE reservation_id=? AND deleted_at IS NULL AND status=1', [reservationId]);
    const payments = await rows('SELECT id,provider,provider_payment_id,amount,currency,status,payment_method_type,card_brand,card_last4,created_at,updated_at FROM mobile_payment_transactions WHERE reservation_id=? ORDER BY created_at DESC', [reservationId]);
    return { ...booking, flight, locations, options, payments, timeline: events };
}
async function createReservationFromDraft(draft, userId, paymentMethodType) {
    const payload = parseJson(draft.draft_json) ?? {};
    if (!payload.details || !payload.options)
        throw badRequest('INCOMPLETE_BOOKING_DRAFT', 'Service details and vehicle/options must be completed before checkout');
    const d = payload.details;
    const o = payload.options;
    const dropoffDate = d.dropoffDate ?? d.pickupDate;
    const dropoffTime = d.dropoffTime ?? d.pickupTime;
    const pickupCountryId = d.pickupCountryId ?? env.DEFAULT_COUNTRY_ID;
    const dropoffCountryId = d.dropoffCountryId ?? pickupCountryId;
    return transaction(async (conn) => {
        await conn.execute('SELECT id FROM vehicles WHERE id=? FOR UPDATE', [o.vehicleId]);
        const available = await availableVehicles({ serviceTypeId: draft.service_type_id, pickupDate: d.pickupDate, dropoffDate }, conn);
        if (!available.some((v) => v.id === o.vehicleId))
            throw conflict('VEHICLE_NOT_AVAILABLE', 'The selected vehicle is no longer available for the requested dates');
        const quote = await calculateQuote({
            serviceTypeId: draft.service_type_id, vehicleId: o.vehicleId, pickupDate: d.pickupDate, dropoffDate,
            pickupCountryId, approximateDistance: d.approximateDistance, optionIds: o.optionIds, insurance: o.insurance, couponCode: o.couponCode
        }, conn);
        const reservationNo = await generateReservationNo(conn);
        const reservationUuid = uuid();
        const initialStatus = env.AUTO_CONFIRM_BOOKINGS ? LegacyReservationStatus.CONFIRMED : LegacyReservationStatus.PENDING;
        const reservation = await exec(`INSERT INTO reservations (uuid,reservation_no,service_type,customer_id,reservation_form,currency,discount,user_id,status,payment_status,payment_method,is_pick_up_and_collection,dev_vehicle_reserved,is_invoice,office_location_id,invoice_office_id,responsible_person_id,created_at,updated_at,special_note,data_sync_to_zoho)
       VALUES (?,?,?,?,2,?,?,?,?,0,0,0,0,0,1,0,0,NOW(),NOW(),?,0)`, [reservationUuid, reservationNo, draft.service_type_id, draft.customer_id, quote.currency === 'EUR' ? '€' : quote.currency, quote.breakdown.discount, userId, initialStatus, d.notes ?? null], conn);
        const reservationId = reservation.insertId;
        const detail = await exec(`INSERT INTO reservation_details (reservation_id,is_extra_service,days,is_hourly,approximate_distance,pick_up_location,drop_off_location,pick_up_date,drop_off_date,pick_up_time,drop_off_time,pick_up_country_id,drop_off_country_id,pick_up_city,drop_off_city,pick_up_city_id,drop_off_city_id,service_details,provider_cost,other_cost,status,is_delete_history,created_at,updated_at,special_note)
       VALUES (?,0,?,0,?,?,?,?,?,?,?,?,?,?,?,?,0,0,?,0,NULL,1,0,NOW(),NOW(),?)`, [reservationId, quote.days, d.approximateDistance ?? 1, d.pickupLocation, d.dropoffLocation ?? null, d.pickupDate, dropoffDate, d.pickupTime, dropoffTime, pickupCountryId, dropoffCountryId, d.pickupCity ?? null, d.dropoffCity ?? null, JSON.stringify({ passengers: d.passengers, passengerContact: d.passengerContact }), d.notes ?? null], conn);
        const detailId = detail.insertId;
        await exec(`INSERT INTO reservation_vehicles (reservation_id,reservation_details_id,vehicle_id,pick_up_date,drop_off_date,pick_up_time,drop_off_time,status,user_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,1,?,NOW(),NOW())`, [reservationId, detailId, o.vehicleId, d.pickupDate, dropoffDate, d.pickupTime, dropoffTime, userId], conn);
        for (const date of dateRange(d.pickupDate, dropoffDate)) {
            await exec('INSERT INTO vehicle_reserved_dates (vehicle_id,reservation_id,reservation_detail_id,reserved_date,type,created_at,updated_at) VALUES (?,?,?,?,1,NOW(),NOW())', [o.vehicleId, reservationId, detailId, date], conn);
        }
        await exec('INSERT INTO mobile_booking_locations (reservation_id,reservation_details_id,location_type,address,latitude,longitude,place_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,NOW(),NOW())', [reservationId, detailId, 'PICKUP', d.pickupLocation, d.pickupLatitude ?? null, d.pickupLongitude ?? null, d.pickupPlaceId ?? null], conn);
        if (d.dropoffLocation) {
            await exec('INSERT INTO mobile_booking_locations (reservation_id,reservation_details_id,location_type,address,latitude,longitude,place_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,NOW(),NOW())', [reservationId, detailId, 'DROPOFF', d.dropoffLocation, d.dropoffLatitude ?? null, d.dropoffLongitude ?? null, d.dropoffPlaceId ?? null], conn);
        }
        if (d.flightNumber) {
            await exec('INSERT INTO reservation_flight_numbers (reservation_id,reservation_details_id,flight_number,created_at,updated_at) VALUES (?,?,?,NOW(),NOW())', [reservationId, detailId, d.flightNumber], conn);
        }
        if (d.dropoffLocation) {
            await exec('INSERT INTO reservation_itineraries (reservation_id,reservation_details_id,reservation_date,full_address,country_id,city,distance,duration,status,sort_numer,created_at,updated_at) VALUES (?,?,?,?,?,?,?,0,1,1,NOW(),NOW())', [reservationId, detailId, d.pickupDate, d.dropoffLocation, dropoffCountryId, d.dropoffCity ?? null, d.approximateDistance ?? 0], conn);
        }
        for (const option of quote.options) {
            await exec(`INSERT INTO reservation_optional_costs (reservation_id,rental_option_id,reservation_details_id,rental_option_text,rent_type,rate_type,quantity,based_on,amount,total_amount,status,user_id,created_at,updated_at)
         SELECT ?,id,?,?,rent_type,rate_type,?,?,amount,?,1,?,NOW(),NOW() FROM rental_options WHERE id=?`, [reservationId, detailId, option.title, option.quantity, option.basedOn, option.total, userId, option.id], conn);
        }
        if (o.insurance !== 'NONE') {
            await exec(`INSERT INTO reservation_insurances (reservation_id,reservation_details_id,vehicle_id,vehicle_insurance_text,vehicle_insurance_amount,status,user_id,created_at,updated_at)
         VALUES (?,?,?,?,?,1,?,NOW(),NOW())`, [reservationId, detailId, o.vehicleId, quote.insurance.text ?? o.insurance, quote.insurance.amount, userId], conn);
        }
        if (quote.coupon) {
            await conn.execute('SELECT id FROM discount_coupons WHERE id=? FOR UPDATE', [quote.coupon.id]);
            await exec('UPDATE reservations SET discount_coupon_id=? WHERE id=?', [quote.coupon.id, reservationId], conn);
            await exec('INSERT INTO reservation_discounts (reservation_id,reservation_details_id,discount_coupon_id,discount_amount,user_id,created_at,updated_at) VALUES (?,?,?,?,?,NOW(),NOW())', [reservationId, detailId, quote.coupon.id, quote.breakdown.discount, userId], conn);
            await exec('INSERT INTO reservation_discount_coupons (discount_coupon_id,reservation_id,coupon_value,coupon_type,discount_amount,status,created_at,updated_at) VALUES (?,?,?,?,?,1,NOW(),NOW())', [quote.coupon.id, reservationId, quote.coupon.amount, quote.coupon.deductionType, quote.breakdown.discount], conn);
            await exec('UPDATE discount_coupons SET use_at=COALESCE(use_at,0)+1,updated_at=NOW() WHERE id=?', [quote.coupon.id], conn);
        }
        await exec(`INSERT INTO reservation_costs (reservation_id,reservation_details_id,discount,base_rate,base_tax,optional_cost,one_way_drop_off_charge,car_with_driver_extra_cost,insurance_cost,net_cost,total_tax,total_amount,user_id,status,created_at,updated_at)
       VALUES (?,?,?,?,0,?,0,0,?,?,?,?,?,1,NOW(),NOW())`, [reservationId, detailId, quote.breakdown.discount, quote.breakdown.baseRate, quote.breakdown.optionalCost, quote.breakdown.insuranceCost, quote.breakdown.netCost, quote.breakdown.totalTax, quote.breakdown.totalAmount, userId], conn);
        await addStatusEvent(conn, reservationId, detailId, userId, 'CUSTOMER', initialStatus === 1 ? 'CONFIRMED' : 'PENDING_VALIDATION', 'Booking submitted from mobile app');
        const paymentId = uuid();
        await exec(`INSERT INTO mobile_payment_transactions (id,reservation_id,user_id,provider,provider_payment_id,amount,currency,status,payment_method_type,created_at,updated_at)
       VALUES (?,?,?,'pending',NULL,?,?,'REQUIRES_CONFIRMATION',?,NOW(),NOW())`, [paymentId, reservationId, userId, quote.breakdown.totalAmount, quote.currency, paymentMethodType], conn);
        await exec('UPDATE booking_drafts SET status=\'CHECKED_OUT\',quote_json=?,updated_at=NOW() WHERE id=?', [JSON.stringify(quote), draft.id], conn);
        return { reservationId, reservationNo, reservationStatus: initialStatus === 1 ? 'CONFIRMED' : 'PENDING_VALIDATION', paymentId, paymentMethodType, quote };
    });
}
export const bookingRouter = Router();
bookingRouter.use(requireAuth, requireRoles(LegacyRole.CUSTOMER));
bookingRouter.post('/drafts', asyncHandler(async (req, res) => {
    const body = validate(z.object({
        category: z.enum(['CHAUFFEUR', 'CAR_RENTAL']),
        variant: z.enum(['STANDARD', 'TRANSFER']).optional()
    }), req.body);
    const customerId = req.auth.customerId ?? await customerIdForUser(req.auth.userId);
    const serviceTypeId = body.category === 'CAR_RENTAL' ? LegacyServiceType.CAR_RENTAL : body.variant === 'TRANSFER' ? LegacyServiceType.TRANSFER : LegacyServiceType.CHAUFFEUR;
    const id = uuid();
    await exec('INSERT INTO booking_drafts (id,user_id,customer_id,category,service_type_id,draft_json,status,expires_at,created_at,updated_at) VALUES (?,?,?,?,?,JSON_OBJECT(),\'DRAFT\',DATE_ADD(NOW(),INTERVAL 24 HOUR),NOW(),NOW())', [id, req.auth.userId, customerId, body.category, serviceTypeId]);
    return ok(res, { id, category: body.category, serviceTypeId, status: 'DRAFT' }, 201);
}));
bookingRouter.get('/drafts/:id', asyncHandler(async (req, res) => {
    const draft = await getDraft(req.params.id, req.auth.userId);
    return ok(res, { ...draft, draft_json: parseJson(draft.draft_json), quote_json: parseJson(draft.quote_json) });
}));
bookingRouter.patch('/drafts/:id/details', asyncHandler(async (req, res) => {
    const body = validate(detailsSchema, req.body);
    const draft = await getDraft(req.params.id, req.auth.userId);
    if (draft.status === 'CHECKED_OUT')
        throw conflict('DRAFT_ALREADY_CHECKED_OUT', 'This draft is already checked out');
    const payload = parseJson(draft.draft_json) ?? {};
    payload.details = body;
    await exec('UPDATE booking_drafts SET draft_json=?,quote_json=NULL,status=\'DRAFT\',updated_at=NOW() WHERE id=?', [JSON.stringify(payload), draft.id]);
    return ok(res, { id: draft.id, details: body });
}));
bookingRouter.patch('/drafts/:id/options', asyncHandler(async (req, res) => {
    const body = validate(optionsSchema, req.body);
    const draft = await getDraft(req.params.id, req.auth.userId);
    if (draft.status === 'CHECKED_OUT')
        throw conflict('DRAFT_ALREADY_CHECKED_OUT', 'This draft is already checked out');
    const payload = parseJson(draft.draft_json) ?? {};
    if (!payload.details)
        throw badRequest('DETAILS_REQUIRED', 'Complete booking details before selecting a vehicle');
    payload.options = body;
    await exec('UPDATE booking_drafts SET draft_json=?,quote_json=NULL,status=\'DRAFT\',updated_at=NOW() WHERE id=?', [JSON.stringify(payload), draft.id]);
    return ok(res, { id: draft.id, options: body });
}));
bookingRouter.post('/drafts/:id/quote', asyncHandler(async (req, res) => {
    const draft = await getDraft(req.params.id, req.auth.userId);
    const payload = parseJson(draft.draft_json) ?? {};
    if (!payload.details || !payload.options)
        throw badRequest('INCOMPLETE_BOOKING_DRAFT', 'Details and vehicle/options are required');
    const d = payload.details;
    const o = payload.options;
    const quoteInput = {
        serviceTypeId: draft.service_type_id, vehicleId: o.vehicleId, pickupDate: d.pickupDate, dropoffDate: d.dropoffDate ?? d.pickupDate,
        pickupCountryId: d.pickupCountryId, approximateDistance: d.approximateDistance, optionIds: o.optionIds, insurance: o.insurance, couponCode: o.couponCode
    };
    const quote = await calculateQuote(quoteInput);
    await exec('UPDATE booking_drafts SET quote_json=?,status=\'QUOTED\',updated_at=NOW() WHERE id=?', [JSON.stringify(quote), draft.id]);
    return ok(res, quote);
}));
bookingRouter.post('/drafts/:id/checkout', asyncHandler(async (req, res) => {
    const scope = `booking-checkout:${req.params.id}`;
    const cached = await getIdempotentResponse(req, scope);
    if (cached)
        return res.status(cached.status).json(cached.body);
    await beginIdempotency(req, scope);
    try {
        const body = validate(z.object({ paymentMethodType: z.enum(['card', 'apple_pay', 'google_pay', 'mock']).default('mock') }), req.body ?? {});
        const draft = await getDraft(req.params.id, req.auth.userId);
        if (draft.status === 'CHECKED_OUT')
            throw conflict('DRAFT_ALREADY_CHECKED_OUT', 'This draft has already been checked out');
        const created = await createReservationFromDraft(draft, req.auth.userId, body.paymentMethodType);
        let payment;
        try {
            const intent = await paymentProvider.create({
                amount: created.quote.breakdown.totalAmount,
                currency: created.quote.currency,
                reservationId: created.reservationId,
                paymentMethodType: body.paymentMethodType
            });
            await exec('UPDATE mobile_payment_transactions SET provider=?,provider_payment_id=?,status=?,updated_at=NOW() WHERE id=?', [intent.provider, intent.providerPaymentId, intent.status, created.paymentId]);
            payment = { id: created.paymentId, ...intent, amount: created.quote.breakdown.totalAmount, currency: created.quote.currency };
        }
        catch (providerError) {
            await exec("UPDATE mobile_payment_transactions SET provider='payment-provider',status='FAILED',failure_reason=?,updated_at=NOW() WHERE id=?", [providerError instanceof Error ? providerError.message : 'Payment provider error', created.paymentId]);
            payment = { id: created.paymentId, status: 'FAILED', retryAllowed: true, amount: created.quote.breakdown.totalAmount, currency: created.quote.currency };
        }
        const result = { reservationId: created.reservationId, reservationNo: created.reservationNo, reservationStatus: created.reservationStatus, payment, quote: created.quote };
        const response = { success: true, data: result };
        await finishIdempotency(req, scope, 201, response);
        await notifyUser(req.auth.userId, 'BOOKING_SUBMITTED', 'Booking submitted', `Reservation ${result.reservationNo} was submitted.`, { reservationId: result.reservationId, status: result.reservationStatus });
        return res.status(201).json(response);
    }
    catch (error) {
        await failIdempotency(req, scope);
        throw error;
    }
}));
bookingRouter.get('/', asyncHandler(async (req, res) => {
    const customerId = req.auth.customerId ?? await customerIdForUser(req.auth.userId);
    const q = validate(z.object({ status: z.enum(['upcoming', 'completed', 'cancelled', 'all']).default('all') }), req.query);
    let condition = '';
    if (q.status === 'completed')
        condition = 'AND r.status=2';
    if (q.status === 'cancelled')
        condition = 'AND r.status=3';
    if (q.status === 'upcoming')
        condition = 'AND r.status IN (0,1)';
    const data = await rows(`SELECT r.id,r.reservation_no,r.service_type,r.currency,r.status,r.payment_status,r.created_at,
            rd.pick_up_location,rd.drop_off_location,rd.pick_up_date,rd.pick_up_time,v.title AS vehicle_title
       FROM reservations r
       LEFT JOIN reservation_details rd ON rd.reservation_id=r.id AND rd.deleted_at IS NULL AND rd.status=1
       LEFT JOIN reservation_vehicles rv ON rv.reservation_id=r.id AND rv.reservation_details_id=rd.id AND rv.deleted_at IS NULL AND rv.status=1
       LEFT JOIN vehicles v ON v.id=rv.vehicle_id
      WHERE r.customer_id=? AND r.deleted_at IS NULL ${condition}
      ORDER BY rd.pick_up_date DESC,r.id DESC LIMIT 200`, [customerId]);
    return ok(res, data);
}));
bookingRouter.get('/:id', asyncHandler(async (req, res) => {
    return ok(res, await bookingView(Number(req.params.id), req.auth.userId));
}));
bookingRouter.patch('/:id', asyncHandler(async (req, res) => {
    const reservationId = Number(req.params.id);
    const booking = await bookingView(reservationId, req.auth.userId);
    if (![LegacyReservationStatus.PENDING, LegacyReservationStatus.CONFIRMED].includes(Number(booking.status)))
        throw conflict('BOOKING_NOT_MODIFIABLE', 'Only pending or confirmed bookings can be modified');
    const body = validate(z.object({ pickupLocation: z.string().min(2).max(191).optional(), dropoffLocation: z.string().max(191).nullable().optional(), pickupDate: z.string().date().optional(), pickupTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/).optional(), notes: z.string().max(5000).nullable().optional() }), req.body);
    if (Object.keys(body).length === 0)
        throw badRequest('NO_CHANGES', 'No editable fields were provided');
    const detailId = Number(booking.reservation_details_id);
    await transaction(async (conn) => {
        if (body.pickupLocation !== undefined)
            await exec('UPDATE reservation_details SET pick_up_location=?,updated_at=NOW() WHERE id=?', [body.pickupLocation, detailId], conn);
        if (body.dropoffLocation !== undefined)
            await exec('UPDATE reservation_details SET drop_off_location=?,updated_at=NOW() WHERE id=?', [body.dropoffLocation, detailId], conn);
        if (body.pickupDate !== undefined)
            await exec('UPDATE reservation_details SET pick_up_date=?,updated_at=NOW() WHERE id=?', [body.pickupDate, detailId], conn);
        if (body.pickupTime !== undefined)
            await exec('UPDATE reservation_details SET pick_up_time=?,updated_at=NOW() WHERE id=?', [body.pickupTime, detailId], conn);
        if (body.notes !== undefined)
            await exec('UPDATE reservations SET special_note=?,updated_at=NOW(),data_sync_to_zoho=0 WHERE id=?', [body.notes, reservationId], conn);
        await addStatusEvent(conn, reservationId, detailId, req.auth.userId, 'CUSTOMER', 'BOOKING_MODIFIED', 'Customer modified eligible booking fields', body);
    });
    return ok(res, await bookingView(reservationId, req.auth.userId));
}));
bookingRouter.post('/:id/cancel', asyncHandler(async (req, res) => {
    const reservationId = Number(req.params.id);
    const booking = await bookingView(reservationId, req.auth.userId);
    if (Number(booking.status) === LegacyReservationStatus.COMPLETE)
        throw conflict('BOOKING_ALREADY_COMPLETED', 'Completed bookings cannot be cancelled');
    if (Number(booking.status) === LegacyReservationStatus.CANCELLED)
        return ok(res, booking);
    const body = validate(z.object({ reason: z.string().max(1000).optional() }), req.body ?? {});
    await transaction(async (conn) => {
        await exec('UPDATE reservations SET status=3,updated_at=NOW(),data_sync_to_zoho=0 WHERE id=?', [reservationId], conn);
        await exec('DELETE FROM vehicle_reserved_dates WHERE reservation_id=?', [reservationId], conn);
        await addStatusEvent(conn, reservationId, Number(booking.reservation_details_id), req.auth.userId, 'CUSTOMER', 'CANCELLED', body.reason ?? 'Cancelled by customer');
    });
    return ok(res, await bookingView(reservationId, req.auth.userId));
}));
bookingRouter.get('/:id/receipt', asyncHandler(async (req, res) => {
    const booking = await bookingView(Number(req.params.id), req.auth.userId);
    const invoices = await rows('SELECT id,invoice_id,invoice_type,payment_status,note,created_at FROM reservation_invoices WHERE reservation_id=? ORDER BY id DESC', [Number(req.params.id)]);
    return ok(res, { reservationNo: booking.reservation_no, currency: booking.currency, amount: booking.total_amount, paymentStatus: booking.payment_status, invoices });
}));
