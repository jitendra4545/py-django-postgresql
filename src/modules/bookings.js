import { insertNativeInquiry } from '../services/client-native-store.js';
import { recordBookingStatusEvent } from '../services/mobile-status-events.js';
import { PAYMENT_OPTIONS, paymentAction, updatedProviderPayload } from '../services/booking-payment-policy.js';
import { bookingListStatusCondition } from '../services/booking-list-status.js';
import { refreshNativeBalancePayment } from '../services/native-balance-payment.js';
import { assertCurrentQuoteTaxPolicy } from '../services/quote-tax-policy.js';
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
import {assertNativePaymentBalance} from '../services/native-financials.js';
import { stripeServiceErrorCode } from '../services/stripe-network.js';
import { loadTrackingView } from '../services/tracking.js';
import { normalizeChauffeurDetails } from '../services/chauffeur-hours.js';
import { listReservationInvoices } from '../services/invoice-provider.js';

const router = Router();
router.use(requireAuth, requireRoles(ROLES.CLIENT, ROLES.AGENCY_AGENT, ROLES.ADMIN, ROLES.STAFF));

router.get(
  '/:reservationId/tracking',
  asyncHandler(async (request, response) => {
    await getReservationForAccess(request.auth, request.params.reservationId);
    response.json(await loadTrackingView(request.params.reservationId));
  }),
);

router.get(
  '/:reservationId/invoices',
  asyncHandler(async (request, response) => {
    await getReservationForAccess(request.auth, request.params.reservationId);
    response.json({ items: await listReservationInvoices(request.params.reservationId) });
  }),
);

const locationSchema = z.object({
  address: z.string().min(3).max(500),
  buildingName: z.string().max(191).optional(),
  unit: z.string().max(50).optional(),
  floor: z.string().max(50).optional(),
  instructions: z.string().max(1000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  placeId: z.string().min(3).max(191).optional(),
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
  requestedHours: z.number().int().min(2).max(720).optional(),
  notes: z.string().max(1000).optional(),
});
const detailsSchema = z.object({
  vehicleClassId: z.number().int().positive(),
  // Omission allows an included (free) half-coverage policy to be selected
  // by the quote service. Explicit NONE is still honored for compatibility.
  insuranceType: z.enum(['NONE', 'HALF', 'FULL']).optional(),
  // A blank coupon field in the booking form is not an applied coupon.
  couponCode: z.string().trim().max(64).optional(),
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
    passenger: detailsSchema.shape.passenger.omit({count:true,luggageCount:true}).partial().extend({
      count:z.number().int().positive().max(50).optional(),
      luggageCount:z.number().int().nonnegative().max(100).optional(),
    }).optional(),
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
          requestedHours: z.number().int().min(2).max(720).optional(),
          notes: z.string().max(1000).nullable().optional(),
        }),
      )
      .max(20)
      .optional(),
    // Patch input must preserve absence. Wrapping the draft's default([])
    // schema in optional() lets Zod inject [], which erases agreed extras.
    options: z.array(z.object({optionId:z.number().int().positive(),quantity:z.number().int().positive().max(20).default(1)})).optional(),
    insuranceType: detailsSchema.shape.insuranceType.optional(),
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
      [JSON.stringify(normalizeChauffeurDetails(draft.service_code, request.body)), draft.id],
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
     VALUES (?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE), NOW())`,
      [
        draft.id,
        draft.revision,
        draftFingerprint(draft),
        quote.currency,
        quote.total,
        JSON.stringify(quote),
      ],
    );
    await query(
      "UPDATE app_booking_drafts SET quote_snapshot_id = ?, status = 'QUOTED', updated_at = NOW() WHERE id = ?",
      [result.insertId, draft.id],
    );
    const {__native,...publicQuote}=quote;
    response.json({ quoteId: result.insertId, ...publicQuote });
  }),
);

router.post(
  '/drafts/:draftId/checkout',
  validate(z.object({ paymentOption: z.enum(['PAY_NOW', 'PAY_LATER']).default('PAY_NOW') }).default({})),
  idempotent('BOOKING_CHECKOUT'),
  asyncHandler(async (request, response) => {
    const paymentOption = request.body.paymentOption;
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
      assertCurrentQuoteTaxPolicy(quote);
      const booking = await createLegacyReservation(connection, {
        draft,
        quote,
        auth: request.auth,
      });
      const [createdPayment] = await connection.execute(
        `INSERT INTO app_payment_transactions
          (reservation_id, user_id, provider, amount, currency, status, idempotency_key,
           provider_payload, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          booking.reservationId,
          request.auth.userId,
          env.PAYMENT_PROVIDER,
          quote.total,
          quote.currency,
          paymentOption === PAYMENT_OPTIONS.PAY_LATER ? 'DEFERRED' : 'CREATED',
          request.get('Idempotency-Key') ?? null,
          JSON.stringify({ checkoutPaymentOption: paymentOption }),
        ],
      );
      if (paymentOption === PAYMENT_OPTIONS.PAY_LATER) {
        // Persist a real reservation and its vehicle allocation, but leave the
        // legacy paid flag at 0. Unlike a temporary PAY_NOW hold, this does not
        // expire with the 30-minute quote.
        await connection.execute(
          `UPDATE reservations SET lifecycle_status='PAYMENT_DUE',updated_at=NOW() WHERE id=?`,
          [booking.reservationId],
        );
        await recordBookingStatusEvent(connection, {
          reservationId: booking.reservationId,
          status: 'PAYMENT_DUE',
          actorUserId: request.auth.userId,
          note: 'Reservation saved with Pay Later; payment is outstanding',
        });
      }
      await connection.execute(
        "UPDATE app_booking_drafts SET status = 'CHECKED_OUT', reservation_id = ?, updated_at = NOW() WHERE id = ?",
        [booking.reservationId, draft.id],
      );
      return {
        ...booking,
        paymentId: createdPayment.insertId,
        amount: quote.total,
        currency: quote.currency,
      };
    });
    if (paymentOption === PAYMENT_OPTIONS.PAY_LATER) {
      const payload = {
        bookingId: created.reservationId,
        reservationNo: created.reservationNo,
        status: 'PAYMENT_DUE',
        paymentOption,
        canRetryPayment: true,
        payment: { id: created.paymentId, status: 'DEFERRED' },
      };
      await storeIdempotencyResponse(request, 201, payload);
      return response.status(201).json(payload);
    }
    let payment;
    try {
      await transaction(connection=>assertNativePaymentBalance(connection,{reservation_id:created.reservationId,amount:created.amount,currency:created.currency}));
      payment = await createPaymentIntent({
        paymentId: created.paymentId,
        amount: created.amount,
        currency: created.currency,
        reservationId: created.reservationId,
      });
      await transaction(connection=>assertNativePaymentBalance(connection,{reservation_id:created.reservationId,amount:created.amount,currency:created.currency}));
    } catch (error) {
      const code = stripeServiceErrorCode(error);
      console.error('PaymentIntent initialization failed; same payment may be recovered', {
        paymentId: created.paymentId,
        code,
        errorType: error?.type ?? error?.name,
      });
      payment = {
        status: 'FAILED',
        error:
          code === 'STRIPE_UNREACHABLE'
            ? 'Backend cannot reach Stripe. Restore connectivity and use payment retry for this payment ID.'
            : 'Stripe payment setup failed; check server configuration and payment record.',
        code,
      };
      await transaction(async (connection) => {
        await connection.execute(
          `UPDATE app_payment_transactions SET status='FAILED',provider_payload=?,updated_at=NOW() WHERE id=?`,
          [JSON.stringify({ checkoutPaymentOption: paymentOption, errorCode: code }), created.paymentId],
        );
        await connection.execute(
          `UPDATE reservations SET lifecycle_status='PAYMENT_FAILED',updated_at=NOW()
           WHERE id=? AND lifecycle_status='PAYMENT_PENDING'`,
          [created.reservationId],
        );
        await recordBookingStatusEvent(connection, {
          reservationId: created.reservationId,
          status: 'PAYMENT_FAILED',
          actorUserId: request.auth.userId,
          note: 'Initial payment setup failed; booking saved for payment retry',
        });
      });
    }
    if (payment.providerReference) {
      await query(
        'UPDATE app_payment_transactions SET provider_reference = ?, provider_payload = ?, status = ?, updated_at = NOW() WHERE id = ?',
        [
          payment.providerReference,
          updatedProviderPayload({ checkoutPaymentOption: paymentOption }, payment.raw ?? {}),
          payment.status,
          created.paymentId,
        ],
      );
    }
    const payload = {
      bookingId: created.reservationId,
      reservationNo: created.reservationNo,
      paymentOption,
      status: payment.status === 'FAILED' ? 'PAYMENT_FAILED' : 'PAYMENT_PENDING',
      canRetryPayment: payment.status === 'FAILED' || payment.status === 'REQUIRES_ACTION',
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
    // No status filter means ALL customer bookings, including PAY_LATER and
    // payment failures. Optional UNPAID/UPCOMING tabs also include them.
    const statusFilter = bookingListStatusCondition(request.query.status);
    if (statusFilter.clause) {
      clauses.push(statusFilter.clause);
      params.push(...statusFilter.params);
    }
    const where = clauses.join(' AND ');
    const items = await query(
      `SELECT r.id, r.reservation_no AS reservationNo, r.customer_id AS customerId,
            arm.service_code AS serviceCode, arm.lifecycle_status AS status,
            dates.firstServiceDate, dates.lastServiceDate,
            costs.totalAmount, arm.currency_code AS currency,
            r.status AS legacyStatus,
            p.id AS lastPaymentId, p.status AS lastPaymentStatus,
            p.provider_reference AS lastProviderReference,
            p.provider_payload AS lastProviderPayload,
            p.created_at AS lastPaymentCreatedAt,
            (q.valid_until > NOW()) AS quoteIsValid
       FROM reservations r
       JOIN reservations arm ON arm.id=r.id
       LEFT JOIN app_quote_snapshots q ON q.id=arm.quote_snapshot_id
       LEFT JOIN app_payment_transactions p ON p.id=(
         SELECT MAX(p_latest.id) FROM app_payment_transactions p_latest
         WHERE p_latest.reservation_id=r.id
       )
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
      `SELECT COUNT(*) AS total FROM reservations r JOIN reservations arm ON arm.id=r.id WHERE ${where}`,
      params,
    );
    const withPayments = [];
    for (const item of items) {
      const balancePayment = await refreshNativeBalancePayment(item.id, request.auth.userId);
      const {
        lastPaymentId, lastPaymentStatus, lastProviderReference,
        lastProviderPayload, lastPaymentCreatedAt, quoteIsValid, legacyStatus, ...booking
      } = item;
      if(balancePayment.lifecycleStatus) booking.status=balancePayment.lifecycleStatus;
      const entry = {
        ...booking,
        ...paymentAction({
          payment: balancePayment.payment ?? (lastPaymentId ? {
            id: lastPaymentId,
            status: lastPaymentStatus,
            providerReference: lastProviderReference,
            providerPayload: lastProviderPayload,
            createdAt: lastPaymentCreatedAt,
          } : null),
          lifecycleStatus: booking.status,
          legacyStatus,
          quoteIsValid,
        }),
      };
      if (balancePayment.blocked) entry.canRetryPayment = false;
      withPayments.push(entry);
    }
    // Payment status and retry availability can change after asynchronous webhooks.
    response.set('Cache-Control', 'no-store');
    response.json(pageResponse(withPayments, Number(count.total), page, perPage));
  }),
);

router.get(
  '/:reservationId',
  asyncHandler(async (request, response) => {
    await getReservationForAccess(request.auth, request.params.reservationId);
    response.set('Cache-Control', 'no-store');
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
        `UPDATE reservations SET lifecycle_status='CHANGE_REQUESTED',updated_at=NOW() WHERE id=?`,
        [request.params.reservationId],
      );
      await recordBookingStatusEvent(connection, {
        reservationId: request.params.reservationId,
        status: 'CHANGE_REQUESTED',
        actorUserId: request.auth.userId,
        note: request.body.reason,
      });
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
        `UPDATE reservations SET lifecycle_status='CANCELLATION_REQUESTED',updated_at=NOW() WHERE id=?`,
        [request.params.reservationId],
      );
      await recordBookingStatusEvent(connection, {
        reservationId: request.params.reservationId,
        status: 'CANCELLATION_REQUESTED',
        actorUserId: request.auth.userId,
        note: request.body.reason,
      });
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
    const result = await transaction(connection => insertNativeInquiry(connection,{
      kind:'VIP',customerId,agencyId:request.auth.agencyId??null,userId:request.auth.userId,details:request.body,
    }));
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
    const result = await transaction(connection => insertNativeInquiry(connection,{
      kind:'CONCIERGE',customerId,agencyId:request.auth.agencyId??null,userId:request.auth.userId,details:request.body,
    }));
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
