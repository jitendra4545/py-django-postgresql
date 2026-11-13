import {assertVehicleCapacity} from '../services/vehicle-capacity.js';
import { nativeServiceCodeSql, nativeCurrencySql, nativeLifecycleSql } from '../services/legacy-reservation-adapter.js';
import { NATIVE_CONCIERGE_REQUESTS, NATIVE_VIP_REQUESTS } from '../services/legacy-read-adapters.js';
import { reconcileNativeRows } from '../services/client-assignment-sync.js';
import { recordBookingStatusEvent } from '../services/mobile-status-events.js';
import { Router } from 'express';
import { MOBILE_DRIVER_ASSIGNMENTS } from '../services/driver-assignment-storage.js';
import { z } from 'zod';
import { asyncHandler } from '../common/async-handler.js';
import { requireAuth, requireRoles } from '../common/auth.js';
import { AppError, conflict, notFound } from '../common/errors.js';
import { syncNativeBalancePayment } from '../services/native-balance-payment.js';
import { assertNativePaymentBalance } from '../services/native-financials.js';
import { initializeNativeBalanceIntent } from '../services/native-balance-intent.js';
import { validate } from '../common/validate.js';
import { LEGACY_RESERVATION_STATUS, ROLES } from '../config/constants.js';
import { env } from '../config/env.js';
import { one, query, transaction } from '../db/pool.js';
import { writeActivityLog } from '../services/activity-log.js';
import { applyApprovedBookingChange } from '../services/booking-change-service.js';
import {
  notifyBookingAudienceBestEffort as notifyBookingAudience,
  notifyUserBestEffort as notifyUser,
} from '../services/notifications.js';
import { createRefund } from '../services/payment-provider.js';
import { hashPassword } from '../services/passwords.js';
import { randomToken, tokenHash } from '../services/tokens.js';
import { listAvailableVehicles } from '../services/operational-vehicle-availability.js';
import { emailDeliveryEnabled, sendInvitationEmail } from '../services/email.js';
import {bufferedDriverWindow,nativeDriverWindow} from '../services/native-driver-windows.js';
import operationsWorkspace from './operations-workspace.js';
import {syncClientAssignments} from '../services/client-assignment-sync.js';

const router = Router();
router.use(requireAuth, requireRoles(ROLES.ADMIN, ROLES.STAFF));
router.use(operationsWorkspace);
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
  return {
    userId: result.insertId,
    invitationToken,
    email: body.email,
    fullName: body.fullName,
    role,
  };
};

const roleLabel = (role) => (Number(role) === ROLES.AGENCY_AGENT ? 'AGENCY_AGENT' : 'CHAUFFEUR');

const deliverInvitation = async (invitation) => {
  if (!emailDeliveryEnabled()) return 'disabled';
  await sendInvitationEmail({
    to: invitation.email,
    fullName: invitation.fullName,
    token: invitation.invitationToken,
    role: roleLabel(invitation.role),
  });
  await query(
    `UPDATE app_account_invitations SET last_sent_at=NOW(),send_count=send_count+1
      WHERE user_id=? AND accepted_at IS NULL ORDER BY id DESC LIMIT 1`,
    [invitation.userId],
  );
  return 'sent';
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
    const emailDelivery = await deliverInvitation(created);
    response.status(201).json({
      userId: created.userId,
      agentId: created.agentId,
      emailDelivery,
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
    const emailDelivery = await deliverInvitation(created);
    response.status(201).json({
      userId: created.userId,
      driverId: created.driverId,
      emailDelivery,
      invitationToken: env.NODE_ENV === 'production' ? undefined : created.invitationToken,
    });
  }),
);

router.post(
  '/invitations/:userId/resend',
  asyncHandler(async (request, response) => {
    const invitedUser = await one(
      `SELECT id AS userId,email,full_name AS fullName,role,status
         FROM users WHERE id=? AND role IN (?,?) AND deleted_at IS NULL`,
      [request.params.userId, ROLES.AGENCY_AGENT, ROLES.CHAUFFEUR],
    );
    if (!invitedUser || Number(invitedUser.status) === 0) {
      throw notFound('Pending Agent or Chauffeur invitation not found');
    }
    const invitationToken = randomToken();
    await transaction(async (connection) => {
      await connection.execute(
        `UPDATE app_account_invitations SET expires_at=NOW()
          WHERE user_id=? AND accepted_at IS NULL AND expires_at>NOW()`,
        [invitedUser.userId],
      );
      await connection.execute(
        `INSERT INTO app_account_invitations
          (user_id,email,role,token_hash,expires_at,created_by_user_id,created_at)
         VALUES (?,?,?,?,DATE_ADD(NOW(),INTERVAL 7 DAY),?,NOW())`,
        [
          invitedUser.userId,
          invitedUser.email,
          invitedUser.role,
          tokenHash(invitationToken),
          request.auth.userId,
        ],
      );
    });
    const emailDelivery = await deliverInvitation({
      ...invitedUser,
      invitationToken,
    });
    response.status(201).json({
      userId: invitedUser.userId,
      emailDelivery,
      expiresInDays: 7,
      invitationToken: env.NODE_ENV === 'production' ? undefined : invitationToken,
    });
  }),
);

router.get(
  '/chauffeurs/available',
  validate(
    z
      .object({
        startAt: z.string().datetime(),
        endAt: z.string().datetime(),
        countryId: z.coerce.number().int().positive().optional(),
        cityId: z.coerce.number().int().positive().optional(),
        providerId: z.coerce.number().int().positive().optional(),
        reservationId: z.coerce.number().int().positive().optional(),
      })
      .refine((value) => new Date(value.endAt) > new Date(value.startAt), {
        message: 'endAt must be after startAt',
      }),
    'query',
  ),
  asyncHandler(async (request, response) => {
    await syncClientAssignments({});
    const buffer=bufferedDriverWindow(request.query.startAt,request.query.endAt);
    const filters = [];
    const params = [buffer.end, buffer.start];
    for (const [field, column] of [
      ['countryId', 'd.country_id'],
      ['cityId', 'd.city_id'],
      ['providerId', 'd.provider_id'],
    ]) {
      if (request.query[field]) {
        filters.push(`${column}=?`);
        params.push(request.query[field]);
      }
    }
    const items = await query(
      `SELECT d.id,d.full_name AS fullName,d.photo,d.phone,
              d.country_id AS countryId,d.city_id AS cityId,d.city,d.provider_id AS providerId
         FROM drivers d
         JOIN users u ON u.id=d.user_id AND u.status=0 AND u.role=3 AND u.deleted_at IS NULL
        WHERE d.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM ${MOBILE_DRIVER_ASSIGNMENTS} ada
             WHERE ada.driver_id=d.id
               ${request.query.reservationId?'AND ada.reservation_id<>?':''}
               AND ada.status NOT IN ('DECLINED','COMPLETED','NO_SHOW','CANCELLED')
               AND ada.scheduled_start_at < ? AND ada.scheduled_end_at > ?
          )
          ${filters.length ? `AND ${filters.join(' AND ')}` : ''}
        ORDER BY d.full_name`,
      request.query.reservationId?[...params.slice(0,2),request.query.reservationId,...params.slice(2)]:params,
    );
    response.json({ items });
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
              ${nativeServiceCodeSql()} AS serviceCode,${nativeLifecycleSql()} AS status,
              costs.totalAmount,${nativeCurrencySql()} AS currency
         FROM reservations r
         JOIN reservations arm ON arm.id=r.id
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
      `SELECT r.id,arm.lifecycle_status FROM reservations r JOIN reservations arm ON arm.id=r.id WHERE r.id=? FOR UPDATE`,
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
        'UPDATE reservations SET lifecycle_status=?,updated_at=NOW() WHERE id=?',
        [status, reservation.id],
      );
      await recordBookingStatusEvent(connection, {
        reservationId: reservation.id,
        status,
        actorUserId: request.auth.userId,
        note: request.body.note ?? null,
      });
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
      // Optional and backwards compatible: omitted means the original pickup assignment.
      assignmentRole: z.enum(['PICKUP', 'DROPOFF']).default('PICKUP'),
    }),
  ),
  asyncHandler(async (request, response) => {
    const start = request.body.scheduledStartAt.slice(0, 19).replace('T', ' ');
    const end = request.body.scheduledEndAt.slice(0, 19).replace('T', ' ');
    const role = request.body.assignmentRole;
    await syncClientAssignments({});
    const result = await transaction(async (connection) => {
      const [details] = await connection.execute(
        `SELECT rd.*,arm.service_type FROM reservation_details rd JOIN reservations arm ON arm.id=rd.reservation_id WHERE rd.id=? AND rd.reservation_id=? AND rd.status=1 AND rd.deleted_at IS NULL AND COALESCE(rd.is_extra_service,0)=0 AND arm.status=1 AND ${nativeLifecycleSql('arm')} NOT IN ('COMPLETED','CANCELLED','PAYMENT_PENDING','PAYMENT_FAILED') FOR UPDATE`,
        [request.params.detailId, request.params.reservationId],
      );
      if (!details[0]) throw notFound('Confirmed booking leg not found');
      if(['COMPLETED','NO_SHOW','CANCELLED'].includes(details[0].mobile_leg_status))throw conflict('This booking leg has already ended');
      const job=nativeDriverWindow(details[0],role);
      if(!job)throw conflict('Booking dates do not define a valid chauffeur task');
      const buffer=bufferedDriverWindow(job.start.replace(' ','T')+'Z',job.end.replace(' ','T')+'Z');
      const [drivers] = await connection.execute(
        'SELECT id,user_id FROM drivers WHERE id=? AND deleted_at IS NULL FOR UPDATE',
        [request.body.driverId],
      );
      if (!drivers[0]) throw notFound('Chauffeur not found');
      const [conflicts] = await connection.execute(
        `SELECT id FROM ${MOBILE_DRIVER_ASSIGNMENTS} mobile_assignment WHERE driver_id=? AND reservation_id<>? AND status NOT IN ('DECLINED','COMPLETED','NO_SHOW','CANCELLED') AND scheduled_start_at < ? AND scheduled_end_at > ? LIMIT 1`,
        [request.body.driverId,request.params.reservationId, buffer.end, buffer.start],
      );
      if (conflicts[0]) throw conflict('The chauffeur already has an overlapping assignment');
      await connection.execute(
        `UPDATE app_mobile_assignment_ids a JOIN reservation_drivers rd ON rd.id=a.reservation_driver_id SET a.assignment_status='CANCELLED',a.current_slot=NULL,a.updated_at=NOW(),rd.pick_up_driver_id=IF(a.assignment_role IN ('PICKUP','BOTH'),NULL,rd.pick_up_driver_id),rd.drop_off_driver_id=IF(a.assignment_role IN ('DROPOFF','BOTH'),NULL,rd.drop_off_driver_id) WHERE rd.reservation_details_id=? AND a.assignment_role IN (?, 'BOTH') AND a.assignment_status NOT IN ('COMPLETED','CANCELLED','DECLINED')`,
        [request.params.detailId, role],
      );
      // The public assignment ID must remain independent of the website's
      // reservation_drivers.id (which may already have unrelated PHP records).
      const [publicId] = await connection.execute(
        'INSERT INTO app_mobile_assignment_ids (id) VALUES (NULL)',
      );
      const [legacy] = await connection.execute(
        `INSERT INTO reservation_drivers
           (reservation_id,reservation_details_id,
            pick_up_date,pick_up_time,pick_up_driver_id,
            drop_off_date,drop_off_time,drop_off_driver_id,
            user_id,status,created_at,updated_at,
            mobile_assignment_id,mobile_driver_id,mobile_assignment_status,
            mobile_assignment_role,scheduled_start_at,scheduled_end_at,assigned_by_user_id)
         VALUES (?,?,?,?,?,?,?,?,?,1,NOW(),NOW(),?,?,'OFFERED',?,?,?,?)`,
        [
          request.params.reservationId,
          request.params.detailId,
          role === 'PICKUP' ? start.slice(0, 10) : null,
          role === 'PICKUP' ? start.slice(11, 19) : null,
          role === 'PICKUP' ? request.body.driverId : null,
          role === 'DROPOFF' ? end.slice(0, 10) : null,
          role === 'DROPOFF' ? end.slice(11, 19) : null,
          role === 'DROPOFF' ? request.body.driverId : null,
          request.auth.userId,
          publicId.insertId,
          request.body.driverId,
          role,
          start,
          end,
          request.auth.userId,
        ],
      );
      await reconcileNativeRows(connection,{nativeId:legacy.insertId,notify:false});
      // Preserve the old assignmentFor/detail response's legacy driver row ID.
      await connection.execute(
        'UPDATE reservation_drivers SET mobile_legacy_reservation_driver_id=? WHERE id=?',
        [legacy.insertId, legacy.insertId],
      );
      await connection.execute(
        `UPDATE reservations SET lifecycle_status='ASSIGNED',updated_at=NOW() WHERE id=?`,
        [request.params.reservationId],
      );
      await connection.execute("UPDATE reservation_details SET mobile_leg_status='ASSIGNED',updated_at=NOW() WHERE id=?",[request.params.detailId]);
      await recordBookingStatusEvent(connection, {
        reservationId: request.params.reservationId,
        reservationDetailsId: request.params.detailId,
        assignmentId: publicId.insertId,
        status: 'ASSIGNED',
        actorUserId: request.auth.userId,
        note: 'Chauffeur assigned',
      });
      return { assignmentId: publicId.insertId, driverUserId: drivers[0].user_id };
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
    await notifyBookingAudience(
      request.params.reservationId,
      {
        type: 'CHAUFFEUR_ASSIGNED',
        title: 'Chauffeur assigned',
        body: 'A chauffeur has been assigned to your service.',
        data: {
          reservationId: Number(request.params.reservationId),
          assignmentId: result.assignmentId,
        },
      },
      null,
      { excludeUserIds: [result.driverUserId] },
    );
    response.status(201).json({ id: result.assignmentId, status: 'OFFERED' });
  }),
);

router.get(
  '/vehicles/available',
  validate(
    z
      .object({
        vehicleClassId: z.coerce.number().int().positive(),
        countryId: z.coerce.number().int().positive().optional(),
        cityId: z.coerce.number().int().positive().optional(),
        startAt: z.string().datetime(),
        endAt: z.string().datetime(),
        detailId: z.coerce.number().int().positive().optional(),
      })
      .refine((value) => new Date(value.endAt) > new Date(value.startAt), {
        message: 'endAt must be after startAt',
      }),
    'query',
  ),
  asyncHandler(async (request, response) => {
    let leg=null;
    if(request.query.detailId){leg=await one(`SELECT d.*,${nativeServiceCodeSql()} AS service_code FROM reservation_details d JOIN reservations r ON r.id=d.reservation_id WHERE d.id=? AND d.status=1 AND d.deleted_at IS NULL AND COALESCE(d.is_extra_service,0)=0`,[request.query.detailId]);if(!leg)throw notFound('Active booking leg not found');}
    const items = await listAvailableVehicles({...request.query,
      ...(leg?{excludeReservationDetailId:leg.id,passengerCount:leg.passenger_count??1,luggageCount:leg.luggage_count??0,serviceCode:leg.service_code}:{}),
    });
    response.json({ items });
  }),
);

router.post(
  '/bookings/:reservationId/legs/:detailId/assign-vehicle',
  validate(z.object({ vehicleId: z.number().int().positive() })),
  asyncHandler(async (request, response) => {
    const assignment = await transaction(async (connection) => {
      const [details] = await connection.execute(
        `SELECT rd.*,${nativeServiceCodeSql()} AS service_code FROM reservation_details rd JOIN reservations r ON r.id=rd.reservation_id
          WHERE rd.id=? AND rd.reservation_id=? AND rd.status=1 AND rd.deleted_at IS NULL AND COALESCE(rd.is_extra_service,0)=0
          AND r.status=1 AND r.deleted_at IS NULL FOR UPDATE`,
        [request.params.detailId, request.params.reservationId],
      );
      const detail = details[0];
      if (!detail) throw notFound('Booking leg not found');
      if(['COMPLETED','NO_SHOW','CANCELLED'].includes(detail.mobile_leg_status))throw conflict('This booking leg has already ended');
      const [vehicles] = await connection.execute(
        `SELECT v.id,v.title,v.model,v.reg_no FROM vehicles v
          WHERE v.id=? AND v.vehicle_class_id=? AND v.status=1 AND v.online_booking_status=1
            AND v.deleted_at IS NULL
          FOR UPDATE`,
        [
          request.body.vehicleId,
          detail.vehicle_class_id,
        ],
      );
      if (!vehicles[0]) throw notFound('Available vehicle in the selected class not found');
      await assertVehicleCapacity(connection,request.body.vehicleId,detail.passenger_count??1,detail.luggage_count??0);
      const day=value=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
      const startAt=`${day(detail.pick_up_date)}T${detail.pick_up_time??'00:00:00'}Z`;
      const endAt=`${day(detail.drop_off_date??detail.pick_up_date)}T${detail.drop_off_time??'23:59:59'}Z`;
      const eligible=await listAvailableVehicles({vehicleClassId:detail.vehicle_class_id,countryId:detail.pick_up_country_id,cityId:detail.pick_up_city_id,
        startAt,endAt,serviceCode:detail.service_code,passengerCount:detail.passenger_count??1,luggageCount:detail.luggage_count??0,connection,
        excludeReservationDetailId:detail.id});
      if(!eligible.some(v=>Number(v.id)===Number(request.body.vehicleId)))throw conflict('Vehicle is unavailable or does not meet this service and passenger requirement');
      const [oldAssignments] = await connection.execute(
        `SELECT id,vehicle_id FROM reservation_vehicles
          WHERE reservation_details_id=? AND status=1 AND deleted_at IS NULL FOR UPDATE`,
        [detail.id],
      );
      await connection.execute(`DELETE FROM vehicle_reserved_dates WHERE reservation_detail_id=?`, [
        detail.id,
      ]);
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
          `UPDATE reservations SET lifecycle_status=?,updated_at=NOW() WHERE id=?`,
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
        const balance = await syncNativeBalancePayment(connection,item.reservation_id,item.requested_by_user_id,{lifecycleStatus});
        if (balance.blocked) throw new AppError(409,'PAYMENT_RECONCILIATION_REQUIRED',balance.reason);
        if (balance.position?.balance > 0) {
        paymentAdjustment = {
          type: 'PAYMENT',
          paymentId: balance.payment.id,
          amount: balance.position.balance,
          currency: balance.position.currency,
        };
        if(['PAYMENT_PENDING','PAYMENT_DUE','PAYMENT_FAILED','CONFIRMED','CHANGE_PAYMENT_PENDING'].includes(lifecycleStatus))lifecycleStatus = 'CHANGE_PAYMENT_PENDING';
        }
      } else if (applied.difference < 0) {
        const position = await assertNativePaymentBalance(connection,{reservation_id:item.reservation_id,amount:0,currency:''},{allowMismatch:true});
        const credit = Math.max(0,position.paid-position.total);
        if (credit === 0) {
          const balance = await syncNativeBalancePayment(connection,item.reservation_id,item.requested_by_user_id,{lifecycleStatus});
          if(balance.blocked) throw new AppError(409,'PAYMENT_RECONCILIATION_REQUIRED',balance.reason);
        }
        const [payments] = await connection.execute(
          `SELECT * FROM app_payment_transactions
            WHERE reservation_id=? AND status IN ('PAID','PARTIALLY_REFUNDED')
            ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
          [item.reservation_id],
        );
        if (payments[0] && credit > 0) {
          paymentAdjustment = {
            type: 'REFUND',
            paymentId: payments[0].id,
            providerReference: payments[0].provider_reference,
            amount: Math.min(credit, Number(payments[0].amount)),
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
        `UPDATE reservations SET lifecycle_status=?,updated_at=NOW() WHERE id=?`,
        [lifecycleStatus, item.reservation_id],
      );
      await recordBookingStatusEvent(connection, {
        reservationId: item.reservation_id,
        status: 'CHANGE_APPROVED',
        actorUserId: request.auth.userId,
        note: request.body.resolutionNote,
      });
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
      const intent = await initializeNativeBalanceIntent(result.paymentAdjustment.paymentId,result.item.reservation_id,result.item.requested_by_user_id);
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
          `UPDATE reservations SET lifecycle_status='CANCELLED',updated_at=NOW() WHERE id=?`,
          [item.reservation_id],
        );
        await connection.execute(
          `UPDATE app_mobile_assignment_ids a JOIN reservation_drivers rd ON rd.id=a.reservation_driver_id SET a.assignment_status='CANCELLED',a.current_slot=NULL,a.updated_at=NOW(),rd.status=2 WHERE rd.reservation_id=? AND a.assignment_status NOT IN ('COMPLETED','CANCELLED')`,
          [item.reservation_id],
        );
        await connection.execute(`DELETE FROM vehicle_reserved_dates WHERE reservation_id=?`, [
          item.reservation_id,
        ]);
        await connection.execute(
          'UPDATE reservation_vehicles SET status=2,deleted_at=NOW(),updated_at=NOW() WHERE reservation_id=? AND status=1',
          [item.reservation_id],
        );
      } else if (status === 'APPROVED_REFUND_PENDING') {
        for (const refund of refunds) {
          await connection.execute(
            `UPDATE app_payment_transactions
                SET status='REFUND_PENDING',refund_reference=?,updated_at=NOW() WHERE id=?`,
            [refund.providerReference, refund.paymentId],
          );
        }
        await connection.execute(
          `UPDATE reservations SET lifecycle_status='CANCELLATION_APPROVED',updated_at=NOW() WHERE id=?`,
          [item.reservation_id],
        );
      } else {
        await connection.execute(
          `UPDATE reservations SET lifecycle_status=?,updated_at=NOW() WHERE id=?`,
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
      `UPDATE app_driver_expenses
          SET status=?,review_note=?,reviewed_by_user_id=?,
              reviewed_at=NOW(),updated_at=NOW()
        WHERE id=?`,
      [
        request.body.status,
        request.body.reviewNote ?? null,
        request.auth.userId,
        request.params.expenseId,
      ],
    );
    if (!result.affectedRows) throw notFound('Expense not found');
    const expenseOwner = await one(
      `SELECT d.user_id AS userId FROM app_driver_expenses e
         JOIN drivers d ON d.id=e.driver_id
        WHERE e.id=?`,
      [request.params.expenseId],
    );
    if (expenseOwner?.userId) {
      await notifyUser({
        userId: expenseOwner.userId,
        type: 'EXPENSE_REVIEW',
        title: 'Expense status updated',
        body: `Your expense is ${request.body.status.toLowerCase()}.`,
        data: { expenseId: Number(request.params.expenseId), status: request.body.status },
      }).catch((error) => console.error('Expense notification failed', { code: error.code }));
    }
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
      `UPDATE reservation_service_incidents
          SET status=?,resolution_note=?,resolved_by_user_id=?,
              resolved_at=IF(? IN ('RESOLVED','CLOSED'),NOW(),resolved_at),updated_at=NOW()
        WHERE id=?`,
      [
        request.body.status,
        request.body.resolutionNote ?? null,
        request.auth.userId,
        request.body.status,
        request.params.incidentId,
      ],
    );
    if (!result.affectedRows) throw notFound('Incident not found');
    const incident = await one(
      'SELECT reported_by_user_id AS userId,reservation_id AS reservationId FROM reservation_service_incidents WHERE id=?',
      [request.params.incidentId],
    );
    if (incident) {
      await notifyUser({
        userId: incident.userId,
        type: 'INCIDENT_REVIEW',
        title: 'Service incident updated',
        body: `Your incident report is ${request.body.status.toLowerCase().replaceAll('_', ' ')}.`,
        data: {
          incidentId: Number(request.params.incidentId),
          reservationId: incident.reservationId,
          status: request.body.status,
        },
      }).catch((error) => console.error('Incident notification failed', { code: error.code }));
    }
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
      `UPDATE contacts SET mobile_request_status=?,mobile_operations_note=?,updated_at=NOW() WHERE COALESCE(mobile_request_id,id)=? AND mobile_request_kind='VIP'`,
      [request.body.status, request.body.operationsNote ?? null, request.params.requestId],
    );
    if (!result.affectedRows) throw notFound('VIP request not found');
    const vip = await one(
      `SELECT r.created_by_user_id AS creatorId,c.user_id AS customerUserId
         FROM ${NATIVE_VIP_REQUESTS} r JOIN customers c ON c.id=r.customer_id WHERE r.id=?`,
      [request.params.requestId],
    );
    if (vip) {
      for (const userId of new Set([vip.creatorId, vip.customerUserId].filter(Boolean))) {
        await notifyUser({
          userId,
          type: 'AIRPORT_VIP_UPDATE',
          title: 'Airport VIP request updated',
          body: `Your Airport VIP request is ${request.body.status.toLowerCase().replaceAll('_', ' ')}.`,
          data: {
            requestId: Number(request.params.requestId),
            requestType: 'AIRPORT_VIP',
            status: request.body.status,
          },
        }).catch((error) => console.error('VIP notification failed', { code: error.code }));
      }
    }
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
      `UPDATE contacts SET mobile_request_status=?,mobile_operations_note=?,updated_at=NOW() WHERE COALESCE(mobile_request_id,id)=? AND mobile_request_kind='CONCIERGE'`,
      [request.body.status, request.body.operationsNote ?? null, request.params.requestId],
    );
    if (!result.affectedRows) throw notFound('Concierge request not found');
    const concierge = await one(
      `SELECT r.created_by_user_id AS creatorId,c.user_id AS customerUserId
         FROM ${NATIVE_CONCIERGE_REQUESTS} r JOIN customers c ON c.id=r.customer_id WHERE r.id=?`,
      [request.params.requestId],
    );
    if (concierge) {
      for (const userId of new Set(
        [concierge.creatorId, concierge.customerUserId].filter(Boolean),
      )) {
        await notifyUser({
          userId,
          type: 'CONCIERGE_UPDATE',
          title: 'Concierge request updated',
          body: `Your Concierge request is ${request.body.status.toLowerCase().replaceAll('_', ' ')}.`,
          data: {
            requestId: Number(request.params.requestId),
            requestType: 'CONCIERGE',
            status: request.body.status,
          },
        }).catch((error) => console.error('Concierge notification failed', { code: error.code }));
      }
    }
    response.json({ id: Number(request.params.requestId), status: request.body.status });
  }),
);

export default router;
