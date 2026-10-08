import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../common/async-handler.js';
import { requireAuth, requireRoles } from '../common/auth.js';
import { conflict, notFound } from '../common/errors.js';
import { validate } from '../common/validate.js';
import { LEGACY_RESERVATION_STATUS, ROLES } from '../config/constants.js';
import { env } from '../config/env.js';
import { one, query, transaction } from '../db/pool.js';
import { writeActivityLog } from '../services/activity-log.js';
import { applyApprovedBookingChange } from '../services/booking-change-service.js';
import { notifyBookingAudience, notifyUser } from '../services/notifications.js';
import { createPaymentIntent, createRefund } from '../services/payment-provider.js';
import { hashPassword } from '../services/passwords.js';
import { randomToken, tokenHash } from '../services/tokens.js';
import { listAvailableVehicles } from '../services/vehicle-availability.js';

const router = Router();
router.use(requireAuth, requireRoles(ROLES.ADMIN, ROLES.STAFF));
const jsonValue = (value) => (typeof value === 'string' ? JSON.parse(value) : value);

const invitedAccountSchema = z.object({
  fullName: z.string().min(2).max(191),
  email: z
    .string()
    .email()
    .transform((value) => value.toLowerCase()),
  phone: z.string().min(6).max(30),
  language: z.string().min(2).max(10).default('en'),
});

const createInvitedUser = async (connection, body, role) => {
  const [existing] = await connection.execute(
    'SELECT id FROM users WHERE email=? AND deleted_at IS NULL',
    [body.email],
  );
  if (existing[0]) throw conflict('An account already exists for this email');
  const invitationToken = randomToken();
  const [result] = await connection.execute(
    `INSERT INTO users (user_name,full_name,email,password,status,role,lang,created_at,updated_at) VALUES (?,?,?,?,1,?,?,NOW(),NOW())`,
    [body.email, body.fullName, body.email, await hashPassword(randomToken()), role, body.language],
  );
  await connection.execute(
    `INSERT INTO app_account_invitations (user_id,email,role,token_hash,expires_at,created_by_user_id,created_at) VALUES (?,?,?,?,DATE_ADD(NOW(),INTERVAL 7 DAY),?,NOW())`,
    [result.insertId, body.email, role, tokenHash(invitationToken), body.createdByUserId],
  );
  return { userId: result.insertId, invitationToken };
};

router.post(
  '/agency-agents',
  validate(
    invitedAccountSchema.extend({
      agencyId: z.number().int().positive(),
      agentType: z.enum(['ADMIN', 'MEMBER']).default('MEMBER'),
    }),
  ),
  asyncHandler(async (request, response) => {
    const created = await transaction(async (connection) => {
      const agency = await connection
        .execute('SELECT id FROM agencies WHERE id=? AND status=1 AND deleted_at IS NULL', [
          request.body.agencyId,
        ])
        .then(([rows]) => rows[0]);
      if (!agency) throw notFound('Active agency not found');
      const account = await createInvitedUser(
        connection,
        { ...request.body, createdByUserId: request.auth.userId },
        ROLES.AGENCY_AGENT,
      );
      const [agent] = await connection.execute(
        `INSERT INTO agents (agency_id,full_name,email,phone,agent_type,user_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,NOW(),NOW())`,
        [
          request.body.agencyId,
          request.body.fullName,
          request.body.email,
          request.body.phone,
          request.body.agentType === 'ADMIN' ? 1 : 2,
          account.userId,
          request.auth.userId,
        ],
      );
      return { ...account, agentId: agent.insertId };
    });
    response.status(201).json({
      userId: created.userId,
      agentId: created.agentId,
      invitationToken: env.NODE_ENV === 'production' ? undefined : created.invitationToken,
    });
  }),
);

router.post(
  '/chauffeurs',
  validate(
    invitedAccountSchema.extend({
      countryId: z.number().int().positive(),
      cityId: z.number().int().positive().optional(),
      providerId: z.number().int().positive().optional(),
    }),
  ),
  asyncHandler(async (request, response) => {
    const created = await transaction(async (connection) => {
      const account = await createInvitedUser(
        connection,
        { ...request.body, createdByUserId: request.auth.userId },
        ROLES.CHAUFFEUR,
      );
      const [driver] = await connection.execute(
        `INSERT INTO drivers (full_name,country_id,provider_id,city_id,phone,user_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,NOW(),NOW())`,
        [
          request.body.fullName,
          request.body.countryId,
          request.body.providerId ?? null,
          request.body.cityId ?? null,
          request.body.phone,
          account.userId,
          request.auth.userId,
        ],
      );
      return { ...account, driverId: driver.insertId };
    });
    response.status(201).json({
      userId: created.userId,
      driverId: created.driverId,
      invitationToken: env.NODE_ENV === 'production' ? undefined : created.invitationToken,
    });
  }),
);

router.post(
  '/agent-client-assignments',
  validate(
    z.object({
      agentId: z.number().int().positive(),
      customerId: z.number().int().positive(),
      notes: z.string().max(1000).optional(),
    }),
  ),
  asyncHandler(async (request, response) => {
    const agent = await one('SELECT id,agency_id FROM agents WHERE id=? AND deleted_at IS NULL', [
      request.body.agentId,
    ]);
    const customer = await one(
      'SELECT id,agency_id FROM customers WHERE id=? AND deleted_at IS NULL',
      [request.body.customerId],
    );
    if (!agent || !customer) throw notFound('Agent or client not found');
    if (customer.agency_id && Number(customer.agency_id) !== Number(agent.agency_id))
      throw conflict('Client belongs to another agency');
    await query(
      `INSERT INTO app_agent_customer_assignments (agent_id,customer_id,agency_id,status,notes,assigned_by_user_id,assigned_at,created_at,updated_at) VALUES (?,?,?,'ACTIVE',?,?,NOW(),NOW(),NOW()) ON DUPLICATE KEY UPDATE status='ACTIVE',notes=VALUES(notes),assigned_by_user_id=VALUES(assigned_by_user_id),assigned_at=NOW(),updated_at=NOW()`,
      [agent.id, customer.id, agent.agency_id, request.body.notes ?? null, request.auth.userId],
    );
    response.status(201).json({ assigned: true });
  }),
);

router.get(
  '/bookings/pending',
  asyncHandler(async (_request, response) => {
    const items = await query(
      `SELECT r.id,r.reservation_no AS reservationNo,c.full_name AS clientName,
              arm.service_code AS serviceCode,arm.lifecycle_status AS status,
              costs.totalAmount,arm.currency_code AS currency
         FROM reservations r
         JOIN app_reservation_meta arm ON arm.reservation_id=r.id
         JOIN customers c ON c.id=r.customer_id
         LEFT JOIN (
           SELECT reservation_id,SUM(total_amount) AS totalAmount
             FROM reservation_costs WHERE status=1 GROUP BY reservation_id
         ) costs ON costs.reservation_id=r.id
        WHERE arm.lifecycle_status IN ('PENDING_CONFIRMATION','CHANGE_REQUESTED','CANCELLATION_REQUESTED')
        ORDER BY r.created_at`,
    );
    response.json({ items });
  }),
);

router.post(
  '/bookings/:reservationId/decision',
  validate(
    z.object({ decision: z.enum(['CONFIRM', 'REJECT']), note: z.string().max(2000).optional() }),
  ),
  asyncHandler(async (request, response) => {
    const reservation = await one(
      `SELECT r.id,arm.lifecycle_status FROM reservations r JOIN app_reservation_meta arm ON arm.reservation_id=r.id WHERE r.id=? FOR UPDATE`,
      [request.params.reservationId],
    );
    if (!reservation) throw notFound('Booking not found');
    const status = request.body.decision === 'CONFIRM' ? 'CONFIRMED' : 'REJECTED';
    await transaction(async (connection) => {
      await connection.execute(
        'UPDATE reservations SET status=?,updated_by=?,updated_at=NOW() WHERE id=?',
        [
          request.body.decision === 'CONFIRM'
            ? LEGACY_RESERVATION_STATUS.CONFIRMED
            : LEGACY_RESERVATION_STATUS.CANCELLED,
          request.auth.userId,
          reservation.id,
        ],
      );
      await connection.execute(
        'UPDATE app_reservation_meta SET lifecycle_status=?,updated_at=NOW() WHERE reservation_id=?',
        [status, reservation.id],
      );
      await connection.execute(
        `INSERT INTO app_booking_status_events (reservation_id,status,actor_user_id,note,occurred_at,created_at) VALUES (?,?,?,?,NOW(),NOW())`,
        [reservation.id, status, request.auth.userId, request.body.note ?? null],
      );
      await writeActivityLog(connection, {
        subjectType: 'Reservation',
        subjectId: reservation.id,
        featureName: 'booking_decision',
        action: request.body.decision === 'CONFIRM' ? 'confirmed' : 'rejected',
        description: request.body.note ?? `Booking ${status.toLowerCase()}`,
        oldValues: { lifecycleStatus: reservation.lifecycle_status },
        newValues: { lifecycleStatus: status },
        userId: request.auth.userId,
        ipAddress: request.ip,
      });
    });
    await notifyBookingAudience(reservation.id, {
      type: 'BOOKING_DECISION',
      title: `Booking ${status.toLowerCase()}`,
      body: request.body.note ?? `Your booking is ${status.toLowerCase()}.`,
      data: { reservationId: reservation.id, status },
    });
    response.json({ id: reservation.id, status });
  }),
);

router.post(
  '/bookings/:reservationId/legs/:detailId/assign-chauffeur',
  validate(
    z.object({
      driverId: z.number().int().positive(),
      scheduledStartAt: z.string().datetime(),
      scheduledEndAt: z.string().datetime(),
    }),
  ),
  asyncHandler(async (request, response) => {
    const start = request.body.scheduledStartAt.slice(0, 19).replace('T', ' ');
    const end = request.body.scheduledEndAt.slice(0, 19).replace('T', ' ');
    const result = await transaction(async (connection) => {
      const [details] = await connection.execute(
        `SELECT rd.id,rd.reservation_id FROM reservation_details rd JOIN app_reservation_meta arm ON arm.reservation_id=rd.reservation_id WHERE rd.id=? AND rd.reservation_id=? AND arm.lifecycle_status IN ('CONFIRMED','ASSIGNED') FOR UPDATE`,
        [request.params.detailId, request.params.reservationId],
      );
      if (!details[0]) throw notFound('Confirmed booking leg not found');
      const [drivers] = await connection.execute(
        'SELECT id,user_id FROM drivers WHERE id=? AND deleted_at IS NULL FOR UPDATE',
        [request.body.driverId],
      );
      if (!drivers[0]) throw notFound('Chauffeur not found');
      const [conflicts] = await connection.execute(
        `SELECT id FROM app_driver_assignments WHERE driver_id=? AND status NOT IN ('DECLINED','COMPLETED','NO_SHOW','CANCELLED') AND scheduled_start_at < ? AND scheduled_end_at > ? LIMIT 1`,
        [request.body.driverId, end, start],
      );
      if (conflicts[0]) throw conflict('The chauffeur already has an overlapping assignment');
      await connection.execute(
        `UPDATE app_driver_assignments SET status='CANCELLED',updated_at=NOW() WHERE reservation_details_id=? AND status NOT IN ('COMPLETED','CANCELLED','DECLINED')`,
        [request.params.detailId],
      );
      const [legacy] = await connection.execute(
        `INSERT INTO reservation_drivers (reservation_id,reservation_details_id,pick_up_date,pick_up_time,pick_up_driver_id,user_id,status,created_at,updated_at) VALUES (?,?,DATE(?),TIME(?),?,?,1,NOW(),NOW())`,
        [
          request.params.reservationId,
          request.params.detailId,
          start,
          start,
          request.body.driverId,
          request.auth.userId,
        ],
      );
      const [assignment] = await connection.execute(
        `INSERT INTO app_driver_assignments (reservation_id,reservation_details_id,legacy_reservation_driver_id,driver_id,status,scheduled_start_at,scheduled_end_at,assigned_by_user_id,created_at,updated_at) VALUES (?,?,?,?,'OFFERED',?,?,?,NOW(),NOW())`,
        [
          request.params.reservationId,
          request.params.detailId,
          legacy.insertId,
          request.body.driverId,
          start,
          end,
          request.auth.userId,
        ],
      );
      await connection.execute(
        `UPDATE app_reservation_meta SET lifecycle_status='ASSIGNED',updated_at=NOW() WHERE reservation_id=?`,
        [request.params.reservationId],
      );
      await connection.execute(
        `INSERT INTO app_booking_status_events (reservation_id,reservation_details_id,assignment_id,status,actor_user_id,note,occurred_at,created_at) VALUES (?,?,?,'ASSIGNED',?,'Chauffeur assigned',NOW(),NOW())`,
        [
          request.params.reservationId,
          request.params.detailId,
          assignment.insertId,
          request.auth.userId,
        ],
      );
      return { assignmentId: assignment.insertId, driverUserId: drivers[0].user_id };
    });
    await notifyUser({
      userId: result.driverUserId,
      type: 'NEW_ASSIGNMENT',
      title: 'New chauffeur assignment',
      body: 'A new service has been assigned to you.',
      data: {
        reservationId: Number(request.params.reservationId),
        assignmentId: result.assignmentId,
      },
    });
    await notifyBookingAudience(request.params.reservationId, {
      type: 'CHAUFFEUR_ASSIGNED',
      title: 'Chauffeur assigned',
      body: 'A chauffeur has been assigned to your service.',
      data: {
        reservationId: Number(request.params.reservationId),
        assignmentId: result.assignmentId,
      },
    });
    response.status(201).json({ id: result.assignmentId, status: 'OFFERED' });
  }),
);

router.get(
  '/vehicles/available',
  validate(
    z
      .object({
        vehicleClassId: z.coerce.number().int().positive(),
        startAt: z.string().datetime(),
        endAt: z.string().datetime(),
      })
      .refine((value) => new Date(value.endAt) > new Date(value.startAt), {
        message: 'endAt must be after startAt',
      }),
    'query',
  ),
  asyncHandler(async (request, response) => {
    const items = await listAvailableVehicles(request.query);
    response.json({ items });
  }),
);

router.post(
  '/bookings/:reservationId/legs/:detailId/assign-vehicle',
  validate(z.object({ vehicleId: z.number().int().positive() })),
  asyncHandler(async (request, response) => {
    const assignment = await transaction(async (connection) => {
      const [details] = await connection.execute(
        `SELECT rd.*,rlm.vehicle_class_id FROM reservation_details rd JOIN app_reservation_leg_meta rlm ON rlm.reservation_details_id=rd.id WHERE rd.id=? AND rd.reservation_id=? FOR UPDATE`,
        [request.params.detailId, request.params.reservationId],
      );
      const detail = details[0];
      if (!detail) throw notFound('Booking leg not found');
      const [vehicles] = await connection.execute(
        `SELECT id,title,model,reg_no FROM vehicles
          WHERE id=? AND vehicle_class_id=? AND status=1 AND online_booking_status=1
            AND deleted_at IS NULL FOR UPDATE`,
        [request.body.vehicleId, detail.vehicle_class_id],
      );
      if (!vehicles[0]) throw notFound('Available vehicle in the selected class not found');
      const [oldAssignments] = await connection.execute(
        `SELECT id,vehicle_id FROM reservation_vehicles
          WHERE reservation_details_id=? AND status=1 AND deleted_at IS NULL FOR UPDATE`,
        [detail.id],
      );
      await connection.execute(`DELETE FROM vehicle_reserved_dates WHERE reservation_detail_id=?`, [
        detail.id,
      ]);
      const [blocked] = await connection.execute(
        `SELECT 'MANUAL_BLOCK' AS reason FROM vehicle_blocks vb
          WHERE vb.vehicle_id=?
            AND TIMESTAMP(vb.start_date,COALESCE(vb.start_time,'00:00:00')) < TIMESTAMP(?,?)
            AND TIMESTAMP(vb.end_date,COALESCE(vb.end_time,'23:59:59')) > TIMESTAMP(?,?)
        UNION ALL
        SELECT 'RESERVED_DATE' AS reason FROM vehicle_reserved_dates vrd
          WHERE vrd.vehicle_id=? AND vrd.reserved_date BETWEEN ? AND ?
        UNION ALL
        SELECT 'ACTIVE_ALLOCATION' AS reason FROM reservation_vehicles rv
          WHERE rv.vehicle_id=? AND rv.reservation_details_id<>? AND rv.status=1
            AND rv.deleted_at IS NULL
            AND TIMESTAMP(rv.pick_up_date,COALESCE(rv.pick_up_time,'00:00:00')) < TIMESTAMP(?,?)
            AND TIMESTAMP(COALESCE(rv.drop_off_date,rv.pick_up_date),COALESCE(rv.drop_off_time,'23:59:59')) > TIMESTAMP(?,?)
        LIMIT 1`,
        [
          request.body.vehicleId,
          detail.drop_off_date,
          detail.drop_off_time,
          detail.pick_up_date,
          detail.pick_up_time,
          request.body.vehicleId,
          detail.pick_up_date,
          detail.drop_off_date,
          request.body.vehicleId,
          detail.id,
          detail.drop_off_date,
          detail.drop_off_time,
          detail.pick_up_date,
          detail.pick_up_time,
        ],
      );
      if (blocked[0]) throw conflict('Vehicle is unavailable for the selected service period');
      await connection.execute(
        `UPDATE reservation_vehicles SET status=2,deleted_at=NOW(),updated_at=NOW()
          WHERE reservation_details_id=? AND status=1`,
        [detail.id],
      );
      const [rv] = await connection.execute(
        `INSERT INTO reservation_vehicles (reservation_id,reservation_details_id,vehicle_id,pick_up_date,drop_off_date,pick_up_time,drop_off_time,status,user_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,NOW(),NOW())`,
        [
          detail.reservation_id,
          detail.id,
          request.body.vehicleId,
          detail.pick_up_date,
          detail.drop_off_date,
          detail.pick_up_time,
          detail.drop_off_time,
          request.auth.userId,
        ],
      );
      await connection.execute(
        `INSERT INTO vehicle_reserved_dates (reservation_id,reservation_detail_id,vehicle_id,reserved_date,type,created_at,updated_at) WITH RECURSIVE dates AS (SELECT DATE(?) d UNION ALL SELECT DATE_ADD(d,INTERVAL 1 DAY) FROM dates WHERE d<DATE(?)) SELECT ?,?,?,d,1,NOW(),NOW() FROM dates`,
        [
          detail.pick_up_date,
          detail.drop_off_date,
          detail.reservation_id,
          detail.id,
          request.body.vehicleId,
        ],
      );
      for (const oldAssignment of oldAssignments) {
        if (Number(oldAssignment.vehicle_id) === Number(request.body.vehicleId)) continue;
        await connection.execute(
          `INSERT INTO reservation_temp_vehicle_histories
            (reservation_details_id,reservation_vehicle_id,old_vehicle_id,reservation_id,
             created_by,created_at,updated_at)
           VALUES (?,?,?,?,?,NOW(),NOW())`,
          [
            detail.id,
            rv.insertId,
            oldAssignment.vehicle_id,
            detail.reservation_id,
            request.auth.userId,
          ],
        );
      }
      await writeActivityLog(connection, {
        subjectType: 'Reservation',
        subjectId: detail.reservation_id,
        featureName: 'vehicle_assignment',
        featureId: detail.id,
        action: oldAssignments.length ? 'updated' : 'created',
        description: 'Physical vehicle assigned to reservation leg',
        oldValues: { vehicleIds: oldAssignments.map((item) => item.vehicle_id) },
        newValues: {
          reservationVehicleId: rv.insertId,
          vehicleId: request.body.vehicleId,
          registrationNumber: vehicles[0].reg_no,
        },
        userId: request.auth.userId,
        ipAddress: request.ip,
      });
      return rv.insertId;
    });
    response.status(201).json({ id: assignment, vehicleId: request.body.vehicleId });
  }),
);

router.post(
  '/change-requests/:requestId/decision',
  validate(
    z.object({
      decision: z.enum(['APPROVED', 'REJECTED']),
      resolutionNote: z.string().min(3).max(2000),
    }),
  ),
  asyncHandler(async (request, response) => {
    const result = await transaction(async (connection) => {
      const [items] = await connection.execute(
        `SELECT * FROM app_booking_change_requests WHERE id=? AND status='PENDING' FOR UPDATE`,
        [request.params.requestId],
      );
      const item = items[0];
      if (!item) throw notFound('Pending change request not found');

      if (request.body.decision === 'REJECTED') {
        await connection.execute(
          `UPDATE app_booking_change_requests
              SET status='REJECTED',resolution_note=?,resolved_by_user_id=?,resolved_at=NOW(),updated_at=NOW()
            WHERE id=?`,
          [request.body.resolutionNote, request.auth.userId, item.id],
        );
        await connection.execute(
          `UPDATE app_reservation_meta SET lifecycle_status=?,updated_at=NOW() WHERE reservation_id=?`,
          [item.previous_lifecycle_status, item.reservation_id],
        );
        await writeActivityLog(connection, {
          subjectType: 'Reservation',
          subjectId: item.reservation_id,
          featureName: 'booking_change',
          featureId: item.id,
          action: 'rejected',
          description: request.body.resolutionNote,
          oldValues: { requestedChanges: jsonValue(item.requested_changes) },
          newValues: { lifecycleStatus: item.previous_lifecycle_status },
          userId: request.auth.userId,
          ipAddress: request.ip,
        });
        return { item, status: 'REJECTED', paymentAdjustment: null };
      }

      const applied = await applyApprovedBookingChange(connection, {
        changeRequest: item,
        actorUserId: request.auth.userId,
      });
      let paymentAdjustment = null;
      let lifecycleStatus = applied.requiresReassignment
        ? 'CONFIRMED'
        : item.previous_lifecycle_status;
      if (applied.difference > 0) {
        const [created] = await connection.execute(
          `INSERT INTO app_payment_transactions
            (reservation_id,user_id,provider,amount,currency,status,idempotency_key,created_at,updated_at)
           VALUES (?,?,?,?,'EUR','CREATED',?,NOW(),NOW())`,
          [
            item.reservation_id,
            item.requested_by_user_id,
            env.PAYMENT_PROVIDER,
            applied.difference,
            `change-${item.id}`,
          ],
        );
        paymentAdjustment = {
          type: 'PAYMENT',
          paymentId: created.insertId,
          amount: applied.difference,
        };
        lifecycleStatus = 'CHANGE_PAYMENT_PENDING';
      } else if (applied.difference < 0) {
        const [payments] = await connection.execute(
          `SELECT * FROM app_payment_transactions
            WHERE reservation_id=? AND status IN ('PAID','PARTIALLY_REFUNDED')
            ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [item.reservation_id],
        );
        if (payments[0]) {
          paymentAdjustment = {
            type: 'REFUND',
            paymentId: payments[0].id,
            providerReference: payments[0].provider_reference,
            amount: Math.min(Math.abs(applied.difference), Number(payments[0].amount)),
          };
        }
      }
      await connection.execute(
        `UPDATE app_booking_change_requests
            SET status='APPROVED',resolution_note=?,resolved_by_user_id=?,resolved_at=NOW(),updated_at=NOW()
          WHERE id=?`,
        [request.body.resolutionNote, request.auth.userId, item.id],
      );
      await connection.execute(
        `UPDATE app_reservation_meta SET lifecycle_status=?,updated_at=NOW() WHERE reservation_id=?`,
        [lifecycleStatus, item.reservation_id],
      );
      await connection.execute(
        `INSERT INTO app_booking_status_events
          (reservation_id,status,actor_user_id,note,occurred_at,created_at)
         VALUES (?,'CHANGE_APPROVED',?,?,NOW(),NOW())`,
        [item.reservation_id, request.auth.userId, request.body.resolutionNote],
      );
      await writeActivityLog(connection, {
        subjectType: 'Reservation',
        subjectId: item.reservation_id,
        featureName: 'booking_change',
        featureId: item.id,
        action: 'approved',
        description: request.body.resolutionNote,
        oldValues: { total: applied.beforeTotal },
        newValues: {
          total: applied.afterTotal,
          difference: applied.difference,
          requiresReassignment: applied.requiresReassignment,
          requestedChanges: jsonValue(item.requested_changes),
        },
        userId: request.auth.userId,
        ipAddress: request.ip,
      });
      return { item, status: 'APPROVED', applied, paymentAdjustment };
    });

    if (result.paymentAdjustment?.type === 'PAYMENT') {
      const intent = await createPaymentIntent({
        paymentId: result.paymentAdjustment.paymentId,
        amount: result.paymentAdjustment.amount,
        currency: 'EUR',
        reservationId: result.item.reservation_id,
      });
      await query(
        `UPDATE app_payment_transactions
            SET provider_reference=?,provider_payload=?,status=?,updated_at=NOW() WHERE id=?`,
        [
          intent.providerReference,
          JSON.stringify(intent.raw ?? {}),
          intent.status,
          result.paymentAdjustment.paymentId,
        ],
      );
      result.paymentAdjustment = { ...result.paymentAdjustment, ...intent };
    }
    if (result.paymentAdjustment?.type === 'REFUND') {
      const refund = await createRefund({
        paymentIntentId: result.paymentAdjustment.providerReference,
        paymentId: result.paymentAdjustment.paymentId,
        amount: result.paymentAdjustment.amount,
      });
      await query(
        `UPDATE app_payment_transactions SET refund_reference=?,updated_at=NOW() WHERE id=?`,
        [refund.id, result.paymentAdjustment.paymentId],
      );
      result.paymentAdjustment = {
        ...result.paymentAdjustment,
        providerReference: refund.id,
        providerStatus: refund.status,
      };
    }

    await notifyBookingAudience(result.item.reservation_id, {
      type: 'CHANGE_REQUEST',
      title: `Change request ${request.body.decision.toLowerCase()}`,
      body: request.body.resolutionNote,
      data: {
        reservationId: result.item.reservation_id,
        requestId: result.item.id,
        status: result.status,
      },
    });
    response.json({
      id: result.item.id,
      status: result.status,
      applied: result.applied,
      paymentAdjustment: result.paymentAdjustment,
    });
  }),
);

router.post(
  '/cancellation-requests/:requestId/decision',
  validate(
    z.object({
      decision: z.enum(['APPROVED', 'REJECTED']),
      resolutionNote: z.string().min(3).max(2000),
    }),
  ),
  asyncHandler(async (request, response) => {
    const item = await one(
      `SELECT * FROM app_booking_cancellation_requests WHERE id=? AND status='PENDING'`,
      [request.params.requestId],
    );
    if (!item) throw notFound('Pending cancellation request not found');
    const paid = await query(
      `SELECT * FROM app_payment_transactions
        WHERE reservation_id=? AND status IN ('PAID','PARTIALLY_REFUNDED') ORDER BY created_at`,
      [item.reservation_id],
    );
    const refunds = [];
    if (request.body.decision === 'APPROVED') {
      for (const payment of paid) {
        const refund = await createRefund({
          paymentIntentId: payment.provider_reference,
          paymentId: payment.id,
        });
        refunds.push({
          paymentId: payment.id,
          providerReference: refund.id,
          status: refund.status,
        });
      }
    }
    const status =
      request.body.decision === 'APPROVED' && paid.length && env.PAYMENT_PROVIDER === 'stripe'
        ? 'APPROVED_REFUND_PENDING'
        : request.body.decision;
    await transaction(async (connection) => {
      await connection.execute(
        `UPDATE app_booking_cancellation_requests SET status=?,resolution_note=?,resolved_by_user_id=?,resolved_at=NOW(),updated_at=NOW() WHERE id=?`,
        [status, request.body.resolutionNote, request.auth.userId, item.id],
      );
      if (status === 'APPROVED') {
        for (const refund of refunds) {
          await connection.execute(
            `UPDATE app_payment_transactions
                SET status='REFUNDED',refund_reference=?,updated_at=NOW() WHERE id=?`,
            [refund.providerReference, refund.paymentId],
          );
        }
        await connection.execute(
          `UPDATE reservations SET status=3,payment_status=0,updated_by=?,updated_at=NOW() WHERE id=?`,
          [request.auth.userId, item.reservation_id],
        );
        await connection.execute(
          `UPDATE app_reservation_meta SET lifecycle_status='CANCELLED',updated_at=NOW() WHERE reservation_id=?`,
          [item.reservation_id],
        );
        await connection.execute(
          `UPDATE app_driver_assignments SET status='CANCELLED',updated_at=NOW() WHERE reservation_id=? AND status NOT IN ('COMPLETED','CANCELLED')`,
          [item.reservation_id],
        );
        await connection.execute(`DELETE FROM vehicle_reserved_dates WHERE reservation_id=?`, [
          item.reservation_id,
        ]);
      } else if (status === 'APPROVED_REFUND_PENDING') {
        for (const refund of refunds) {
          await connection.execute(
            `UPDATE app_payment_transactions
                SET status='REFUND_PENDING',refund_reference=?,updated_at=NOW() WHERE id=?`,
            [refund.providerReference, refund.paymentId],
          );
        }
        await connection.execute(
          `UPDATE app_reservation_meta SET lifecycle_status='CANCELLATION_APPROVED',updated_at=NOW() WHERE reservation_id=?`,
          [item.reservation_id],
        );
      } else {
        await connection.execute(
          `UPDATE app_reservation_meta SET lifecycle_status=?,updated_at=NOW() WHERE reservation_id=?`,
          [item.previous_lifecycle_status, item.reservation_id],
        );
      }
      await writeActivityLog(connection, {
        subjectType: 'Reservation',
        subjectId: item.reservation_id,
        featureName: 'booking_cancellation',
        featureId: item.id,
        action: request.body.decision.toLowerCase(),
        description: request.body.resolutionNote,
        oldValues: { lifecycleStatus: item.previous_lifecycle_status },
        newValues: { cancellationStatus: status, refundCount: refunds.length },
        userId: request.auth.userId,
        ipAddress: request.ip,
      });
    });
    await notifyBookingAudience(item.reservation_id, {
      type: 'CANCELLATION_REQUEST',
      title: 'Cancellation request updated',
      body: request.body.resolutionNote,
      data: { reservationId: item.reservation_id, requestId: item.id, status },
    });
    response.json({
      id: item.id,
      status,
      refunds,
    });
  }),
);

router.patch(
  '/expenses/:expenseId',
  validate(
    z.object({
      status: z.enum(['APPROVED', 'REJECTED', 'REIMBURSED']),
      reviewNote: z.string().max(1000).optional(),
    }),
  ),
  asyncHandler(async (request, response) => {
    const result = await query(
      `UPDATE app_driver_expenses SET status=?,review_note=?,reviewed_by_user_id=?,reviewed_at=NOW(),updated_at=NOW() WHERE id=?`,
      [
        request.body.status,
        request.body.reviewNote ?? null,
        request.auth.userId,
        request.params.expenseId,
      ],
    );
    if (!result.affectedRows) throw notFound('Expense not found');
    response.json({ id: Number(request.params.expenseId), status: request.body.status });
  }),
);

router.patch(
  '/incidents/:incidentId',
  validate(
    z.object({
      status: z.enum(['IN_REVIEW', 'RESOLVED', 'CLOSED']),
      resolutionNote: z.string().max(2000).optional(),
    }),
  ),
  asyncHandler(async (request, response) => {
    const result = await query(
      `UPDATE app_incidents SET status=?,resolution_note=?,resolved_by_user_id=?,resolved_at=IF(? IN ('RESOLVED','CLOSED'),NOW(),resolved_at),updated_at=NOW() WHERE id=?`,
      [
        request.body.status,
        request.body.resolutionNote ?? null,
        request.auth.userId,
        request.body.status,
        request.params.incidentId,
      ],
    );
    if (!result.affectedRows) throw notFound('Incident not found');
    response.json({ id: Number(request.params.incidentId), status: request.body.status });
  }),
);

router.patch(
  '/vip-requests/:requestId',
  validate(
    z.object({
      status: z.enum(['IN_REVIEW', 'QUOTED', 'CONFIRMED', 'COMPLETED', 'REJECTED', 'CANCELLED']),
      operationsNote: z.string().max(3000).optional(),
    }),
  ),
  asyncHandler(async (request, response) => {
    const result = await query(
      `UPDATE app_vip_requests SET status=?,operations_note=?,updated_at=NOW() WHERE id=?`,
      [request.body.status, request.body.operationsNote ?? null, request.params.requestId],
    );
    if (!result.affectedRows) throw notFound('VIP request not found');
    response.json({ id: Number(request.params.requestId), status: request.body.status });
  }),
);

router.patch(
  '/concierge-requests/:requestId',
  validate(
    z.object({
      status: z.enum(['IN_REVIEW', 'QUOTED', 'CONFIRMED', 'COMPLETED', 'REJECTED', 'CANCELLED']),
      operationsNote: z.string().max(3000).optional(),
    }),
  ),
  asyncHandler(async (request, response) => {
    const result = await query(
      `UPDATE app_concierge_requests SET status=?,operations_note=?,updated_at=NOW() WHERE id=?`,
      [request.body.status, request.body.operationsNote ?? null, request.params.requestId],
    );
    if (!result.affectedRows) throw notFound('Concierge request not found');
    response.json({ id: Number(request.params.requestId), status: request.body.status });
  }),
);

export default router;
