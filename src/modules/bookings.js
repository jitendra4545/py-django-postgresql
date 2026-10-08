import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../common/async-handler.js';
import { requireAuth, requireRoles } from '../common/auth.js';
import { conflict, notFound } from '../common/errors.js';
import { idempotent, storeIdempotencyResponse } from '../common/idempotency.js';
import { pageResponse, pagination } from '../common/pagination.js';
import { validate } from '../common/validate.js';
import { ROLES } from '../config/constants.js';
import { env } from '../config/env.js';
import { one, query, transaction } from '../db/pool.js';
import {
  assertCustomerAccess,
  getDraftForAccess,
  getReservationForAccess,
} from '../services/access.js';
import {
  buildDraftQuote,
  createLegacyReservation,
  draftFingerprint,
} from '../services/booking-service.js';
import { loadBookingView } from '../services/booking-view.js';
import { createPaymentIntent } from '../services/payment-provider.js';

const router = Router();
router.use(requireAuth, requireRoles(ROLES.CLIENT, ROLES.AGENCY_AGENT, ROLES.ADMIN, ROLES.STAFF));

const locationSchema = z.object({
  address: z.string().min(3).max(500),
  buildingName: z.string().max(191).optional(),
  unit: z.string().max(50).optional(),
  floor: z.string().max(50).optional(),
  instructions: z.string().max(1000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  countryId: z.number().int().positive(),
  cityId: z.number().int().nonnegative().optional(),
  city: z.string().max(191).optional(),
});
const legSchema = z.object({
  startAt: z.string().datetime(),
  endAt: z.string().datetime().optional(),
  pickup: locationSchema,
  dropoff: locationSchema.optional(),
  stops: z.array(locationSchema).max(10).default([]),
  approximateDistanceKm: z.number().nonnegative().optional(),
  isHourly: z.boolean().default(false),
  notes: z.string().max(1000).optional(),
});
const detailsSchema = z.object({
  vehicleClassId: z.number().int().positive(),
  passenger: z.object({
    fullName: z.string().min(2).max(191),
    email: z.string().email().optional(),
    phone: z.string().min(6).max(30),
    count: z.number().int().positive().max(50).default(1),
    luggageCount: z.number().int().nonnegative().max(100).default(0),
    flightNumber: z.string().max(40).optional(),
  }),
  legs: z.array(legSchema).min(1).max(20),
  options: z
    .array(
      z.object({
        optionId: z.number().int().positive(),
        quantity: z.number().int().positive().max(20).default(1),
      }),
    )
    .default([]),
  notes: z.string().max(2000).optional(),
});

const bookingChangeSchema = z
  .object({
    vehicleClassId: z.number().int().positive().optional(),
    passenger: detailsSchema.shape.passenger.partial().optional(),
    legs: z
      .array(
        z.object({
          detailId: z.number().int().positive(),
          startAt: z.string().datetime().optional(),
          endAt: z.string().datetime().optional(),
          pickup: locationSchema.partial().optional(),
          dropoff: locationSchema.partial().nullable().optional(),
          stops: z.array(locationSchema).max(10).optional(),
          approximateDistanceKm: z.number().nonnegative().optional(),
          isHourly: z.boolean().optional(),
          notes: z.string().max(1000).nullable().optional(),
        }),
      )
      .max(20)
      .optional(),
    options: detailsSchema.shape.options.optional(),
    notes: z.string().max(2000).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'At least one booking change is required');

router.post(
  '/drafts',
  validate(
    z.object({
      serviceCode: z.enum(['CHAUFFEUR', 'TRANSFER', 'CAR_RENTAL']),
      customerId: z.number().int().positive().optional(),
    }),
  ),
  asyncHandler(async (request, response) => {
    const customerId =
      request.auth.role === ROLES.CLIENT ? request.auth.customerId : request.body.customerId;
    if (!customerId) throw notFound('A client must be selected');
    await assertCustomerAccess(request.auth, customerId);
    const result = await query(
      `INSERT INTO app_booking_drafts
        (created_by_user_id, created_by_agent_id, customer_id, agency_id, service_code,
         status, details, revision, expires_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'DRAFT', JSON_OBJECT(), 1, DATE_ADD(NOW(), INTERVAL 24 HOUR), NOW(), NOW())`,
      [
        request.auth.userId,
        request.auth.agentId ?? null,
        customerId,
        request.auth.agencyId ?? null,
        request.body.serviceCode,
      ],
    );
    response.status(201).json({ id: result.insertId, status: 'DRAFT' });
  }),
);

router.get(
  '/drafts/:draftId',
  asyncHandler(async (request, response) => {
    const draft = await getDraftForAccess(request.auth, request.params.draftId);
    response.json({
      ...draft,
      details: typeof draft.details === 'string' ? JSON.parse(draft.details) : draft.details,
    });
  }),
);

router.put(
  '/drafts/:draftId/details',
  validate(detailsSchema),
  asyncHandler(async (request, response) => {
    const draft = await getDraftForAccess(request.auth, request.params.draftId);
    if (draft.status === 'CHECKED_OUT') throw conflict('Checked-out drafts cannot be changed');
    await query(
      `UPDATE app_booking_drafts
          SET details = ?, status = 'READY', revision = revision + 1,
              quote_snapshot_id = NULL, updated_at = NOW()
        WHERE id = ?`,
      [JSON.stringify(request.body), draft.id],
    );
    response.json({ id: draft.id, status: 'READY' });
  }),
);

router.post(
  '/drafts/:draftId/quote',
  asyncHandler(async (request, response) => {
    const draft = await getDraftForAccess(request.auth, request.params.draftId);
    const quote = await buildDraftQuote(draft);
    const result = await query(
      `INSERT INTO app_quote_snapshots
      (draft_id, draft_revision, request_hash, currency, total_amount, quote_data, valid_until, created_at)
     VALUES (?, ?, ?, 'EUR', ?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE), NOW())`,
      [draft.id, draft.revision, draftFingerprint(draft), quote.total, JSON.stringify(quote)],
    );
    await query(
      "UPDATE app_booking_drafts SET quote_snapshot_id = ?, status = 'QUOTED', updated_at = NOW() WHERE id = ?",
      [result.insertId, draft.id],
    );
    response.json({ quoteId: result.insertId, ...quote });
  }),
);

router.post(
  '/drafts/:draftId/checkout',
  idempotent('BOOKING_CHECKOUT'),
  asyncHandler(async (request, response) => {
    const created = await transaction(async (connection) => {
      const draft = await getDraftForAccess(request.auth, request.params.draftId, connection, true);
      if (draft.status === 'CHECKED_OUT') throw conflict('This draft has already been checked out');
      if (!draft.quote_snapshot_id) throw conflict('Create a quote before checkout');
      const [quotes] = await connection.execute(
        `SELECT * FROM app_quote_snapshots
          WHERE id = ? AND draft_id = ? AND valid_until > NOW() FOR UPDATE`,
        [draft.quote_snapshot_id, draft.id],
      );
      const snapshot = quotes[0];
      if (
        !snapshot ||
        Number(snapshot.draft_revision) !== Number(draft.revision) ||
        snapshot.request_hash !== draftFingerprint(draft)
      ) {
        throw conflict('The quote expired or the draft changed; create a new quote');
      }
      const quote =
        typeof snapshot.quote_data === 'string'
          ? JSON.parse(snapshot.quote_data)
          : snapshot.quote_data;
      const booking = await createLegacyReservation(connection, {
        draft,
        quote,
        auth: request.auth,
      });
      await connection.execute(
        `INSERT INTO app_payment_transactions
          (reservation_id, user_id, provider, amount, currency, status, idempotency_key, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'EUR', 'CREATED', ?, NOW(), NOW())`,
        [
          booking.reservationId,
          request.auth.userId,
          env.PAYMENT_PROVIDER,
          quote.total,
          request.get('Idempotency-Key') ?? null,
        ],
      );
      const [paymentRows] = await connection.execute('SELECT LAST_INSERT_ID() AS id');
      await connection.execute(
        "UPDATE app_booking_drafts SET status = 'CHECKED_OUT', reservation_id = ?, updated_at = NOW() WHERE id = ?",
        [booking.reservationId, draft.id],
      );
      return { ...booking, paymentId: paymentRows[0].id, amount: quote.total };
    });
    let payment;
    try {
      payment = await createPaymentIntent({
        paymentId: created.paymentId,
        amount: created.amount,
        currency: 'EUR',
        reservationId: created.reservationId,
      });
    } catch (error) {
      payment = { status: 'FAILED', error: 'Payment provider is temporarily unavailable' };
      await query(
        `UPDATE app_payment_transactions SET status='FAILED',provider_payload=?,updated_at=NOW() WHERE id=?`,
        [JSON.stringify({ message: error.message }), created.paymentId],
      );
    }
    if (payment.providerReference) {
      await query(
        'UPDATE app_payment_transactions SET provider_reference = ?, provider_payload = ?, status = ?, updated_at = NOW() WHERE id = ?',
        [
          payment.providerReference,
          JSON.stringify(payment.raw ?? {}),
          payment.status,
          created.paymentId,
        ],
      );
    }
    const payload = {
      bookingId: created.reservationId,
      reservationNo: created.reservationNo,
      payment: { id: created.paymentId, ...payment },
    };
    await storeIdempotencyResponse(request, 201, payload);
    response.status(201).json(payload);
  }),
);

router.get(
  '/',
  asyncHandler(async (request, response) => {
    const { page, perPage, offset } = pagination(request.query);
    const clauses = ['r.deleted_at IS NULL'];
    const params = [];
    if (request.auth.role === ROLES.CLIENT) {
      clauses.push('r.customer_id = ?');
      params.push(request.auth.customerId);
    }
    if (request.auth.role === ROLES.AGENCY_AGENT) {
      clauses.push(
        `r.customer_id IN (SELECT customer_id FROM app_agent_customer_assignments WHERE agent_id = ? AND status = 'ACTIVE')`,
      );
      params.push(request.auth.agentId);
    }
    if (request.query.status) {
      clauses.push('arm.lifecycle_status = ?');
      params.push(request.query.status);
    }
    const where = clauses.join(' AND ');
    const items = await query(
      `SELECT r.id, r.reservation_no AS reservationNo, r.customer_id AS customerId,
            arm.service_code AS serviceCode, arm.lifecycle_status AS status,
            dates.firstServiceDate, dates.lastServiceDate,
            costs.totalAmount, arm.currency_code AS currency
       FROM reservations r
       JOIN app_reservation_meta arm ON arm.reservation_id = r.id
       LEFT JOIN (
         SELECT reservation_id, MIN(pick_up_date) AS firstServiceDate,
                MAX(drop_off_date) AS lastServiceDate
           FROM reservation_details WHERE deleted_at IS NULL GROUP BY reservation_id
       ) dates ON dates.reservation_id = r.id
       LEFT JOIN (
         SELECT reservation_id, SUM(total_amount) AS totalAmount
           FROM reservation_costs WHERE status = 1 GROUP BY reservation_id
       ) costs ON costs.reservation_id = r.id
      WHERE ${where}
      ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      [...params, perPage, offset],
    );
    const count = await one(
      `SELECT COUNT(*) AS total FROM reservations r JOIN app_reservation_meta arm ON arm.reservation_id=r.id WHERE ${where}`,
      params,
    );
    response.json(pageResponse(items, Number(count.total), page, perPage));
  }),
);

router.get(
  '/:reservationId',
  asyncHandler(async (request, response) => {
    await getReservationForAccess(request.auth, request.params.reservationId);
    response.json(await loadBookingView(request.params.reservationId));
  }),
);

router.post(
  '/:reservationId/change-requests',
  validate(
    z.object({
      reason: z.string().min(5).max(2000),
      requestedChanges: bookingChangeSchema,
    }),
  ),
  asyncHandler(async (request, response) => {
    const reservation = await getReservationForAccess(request.auth, request.params.reservationId);
    if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(reservation.lifecycle_status)) {
      throw conflict(`A ${reservation.lifecycle_status.toLowerCase()} booking cannot be changed`);
    }
    const pending = await one(
      `SELECT id FROM app_booking_change_requests WHERE reservation_id=? AND status='PENDING'`,
      [request.params.reservationId],
    );
    if (pending) throw conflict('A change request is already pending');
    const result = await transaction(async (connection) => {
      const [created] = await connection.execute(
        `INSERT INTO app_booking_change_requests
          (reservation_id, requested_by_user_id, status, previous_lifecycle_status, reason, requested_changes, created_at, updated_at)
         VALUES (?, ?, 'PENDING', ?, ?, ?, NOW(), NOW())`,
        [
          request.params.reservationId,
          request.auth.userId,
          reservation.lifecycle_status,
          request.body.reason,
          JSON.stringify(request.body.requestedChanges),
        ],
      );
      await connection.execute(
        `UPDATE app_reservation_meta SET lifecycle_status='CHANGE_REQUESTED',updated_at=NOW() WHERE reservation_id=?`,
        [request.params.reservationId],
      );
      await connection.execute(
        `INSERT INTO app_booking_status_events (reservation_id,status,actor_user_id,note,occurred_at,created_at) VALUES (?,'CHANGE_REQUESTED',?,?,NOW(),NOW())`,
        [request.params.reservationId, request.auth.userId, request.body.reason],
      );
      return created;
    });
    response.status(201).json({ id: result.insertId, status: 'PENDING' });
  }),
);

router.post(
  '/:reservationId/cancellation-requests',
  validate(z.object({ reason: z.string().min(5).max(2000) })),
  asyncHandler(async (request, response) => {
    const reservation = await getReservationForAccess(request.auth, request.params.reservationId);
    if (['COMPLETED', 'CANCELLED', 'REJECTED'].includes(reservation.lifecycle_status)) {
      throw conflict(`A ${reservation.lifecycle_status.toLowerCase()} booking cannot be cancelled`);
    }
    const existing = await one(
      `SELECT id FROM app_booking_cancellation_requests WHERE reservation_id = ? AND status = 'PENDING'`,
      [request.params.reservationId],
    );
    if (existing) throw conflict('A cancellation request is already pending');
    const result = await transaction(async (connection) => {
      const [created] = await connection.execute(
        `INSERT INTO app_booking_cancellation_requests
          (reservation_id, requested_by_user_id, status, previous_lifecycle_status, reason, created_at, updated_at)
         VALUES (?, ?, 'PENDING', ?, ?, NOW(), NOW())`,
        [
          request.params.reservationId,
          request.auth.userId,
          reservation.lifecycle_status,
          request.body.reason,
        ],
      );
      await connection.execute(
        `UPDATE app_reservation_meta SET lifecycle_status='CANCELLATION_REQUESTED',updated_at=NOW() WHERE reservation_id=?`,
        [request.params.reservationId],
      );
      await connection.execute(
        `INSERT INTO app_booking_status_events (reservation_id,status,actor_user_id,note,occurred_at,created_at) VALUES (?,'CANCELLATION_REQUESTED',?,?,NOW(),NOW())`,
        [request.params.reservationId, request.auth.userId, request.body.reason],
      );
      return created;
    });
    response.status(201).json({ id: result.insertId, status: 'PENDING' });
  }),
);

router.post(
  '/vip-requests',
  validate(
    z.object({
      customerId: z.number().int().positive().optional(),
      airport: z.string().min(2),
      terminal: z.string().optional(),
      serviceAt: z.string().datetime(),
      passengerCount: z.number().int().positive(),
      flightNumber: z.string().optional(),
      requestText: z.string().max(3000).optional(),
    }),
  ),
  asyncHandler(async (request, response) => {
    const customerId =
      request.auth.role === ROLES.CLIENT ? request.auth.customerId : request.body.customerId;
    if (!customerId) throw notFound('A client must be selected');
    await assertCustomerAccess(request.auth, customerId);
    const result = await query(
      `INSERT INTO app_vip_requests (customer_id, agency_id, created_by_user_id, airport, terminal, service_at, passenger_count, flight_number, request_text, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', NOW(), NOW())`,
      [
        customerId,
        request.auth.agencyId ?? null,
        request.auth.userId,
        request.body.airport,
        request.body.terminal ?? null,
        request.body.serviceAt.slice(0, 19).replace('T', ' '),
        request.body.passengerCount,
        request.body.flightNumber ?? null,
        request.body.requestText ?? null,
      ],
    );
    response.status(201).json({ id: result.insertId, status: 'SUBMITTED' });
  }),
);

router.get(
  '/manual-requests/vip',
  asyncHandler(async (request, response) => {
    const unrestricted = [ROLES.ADMIN, ROLES.STAFF].includes(request.auth.role);
    const clause = unrestricted
      ? '1=1'
      : request.auth.role === ROLES.CLIENT
        ? 'customer_id=?'
        : 'agency_id=?';
    const params = unrestricted
      ? []
      : [request.auth.role === ROLES.CLIENT ? request.auth.customerId : request.auth.agencyId];
    const items = await query(
      `SELECT id,customer_id AS customerId,airport,terminal,service_at AS serviceAt,
              passenger_count AS passengerCount,flight_number AS flightNumber,request_text AS requestText,
              status,operations_note AS operationsNote,created_at AS createdAt
         FROM app_vip_requests WHERE ${clause} ORDER BY created_at DESC LIMIT 200`,
      params,
    );
    response.json({ items });
  }),
);

router.post(
  '/concierge-requests',
  validate(
    z.object({
      customerId: z.number().int().positive().optional(),
      category: z.string().min(2).max(100),
      requestedFor: z.string().datetime().optional(),
      city: z.string().max(191).optional(),
      requestText: z.string().min(10).max(5000),
    }),
  ),
  asyncHandler(async (request, response) => {
    const customerId =
      request.auth.role === ROLES.CLIENT ? request.auth.customerId : request.body.customerId;
    if (!customerId) throw notFound('A client must be selected');
    await assertCustomerAccess(request.auth, customerId);
    const result = await query(
      `INSERT INTO app_concierge_requests (customer_id, agency_id, created_by_user_id, category, requested_for, city, request_text, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', NOW(), NOW())`,
      [
        customerId,
        request.auth.agencyId ?? null,
        request.auth.userId,
        request.body.category,
        request.body.requestedFor?.slice(0, 19).replace('T', ' ') ?? null,
        request.body.city ?? null,
        request.body.requestText,
      ],
    );
    response.status(201).json({ id: result.insertId, status: 'SUBMITTED' });
  }),
);

router.get(
  '/manual-requests/concierge',
  asyncHandler(async (request, response) => {
    const unrestricted = [ROLES.ADMIN, ROLES.STAFF].includes(request.auth.role);
    const clause = unrestricted
      ? '1=1'
      : request.auth.role === ROLES.CLIENT
        ? 'customer_id=?'
        : 'agency_id=?';
    const params = unrestricted
      ? []
      : [request.auth.role === ROLES.CLIENT ? request.auth.customerId : request.auth.agencyId];
    const items = await query(
      `SELECT id,customer_id AS customerId,category,requested_for AS requestedFor,city,
              request_text AS requestText,status,operations_note AS operationsNote,created_at AS createdAt
         FROM app_concierge_requests WHERE ${clause} ORDER BY created_at DESC LIMIT 200`,
      params,
    );
    response.json({ items });
  }),
);

export default router;
