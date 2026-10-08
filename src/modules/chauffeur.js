import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../common/async-handler.js';
import { requireAuth, requireRoles } from '../common/auth.js';
import { conflict, notFound } from '../common/errors.js';
import { pageResponse, pagination } from '../common/pagination.js';
import { assertAssignmentTransition } from '../common/state-machine.js';
import { validate } from '../common/validate.js';
import { ROLES, TERMINAL_ASSIGNMENT_STATUSES } from '../config/constants.js';
import { one, query, transaction } from '../db/pool.js';
import { notifyBookingAudience } from '../services/notifications.js';
import { emitToUser } from '../services/realtime.js';

const router = Router();
router.use(requireAuth, requireRoles(ROLES.CHAUFFEUR));

const assignmentFor = async (auth, assignmentId, connection = null, lock = false) => {
  const executor = connection ?? {
    execute: (sql, params) => query(sql, params).then((rows) => [rows]),
  };
  const [rows] = await executor.execute(
    `SELECT ada.*, r.reservation_no, rd.pick_up_location, rd.drop_off_location,
            rd.pick_up_date, rd.pick_up_time, rd.drop_off_date, rd.drop_off_time,
            r.customer_id, c.full_name AS customer_name,
            rlm.pickup_details, rlm.dropoff_details, rlm.passenger_count, rlm.luggage_count,
            rlm.flight_number
       FROM app_driver_assignments ada
       JOIN reservations r ON r.id=ada.reservation_id
       JOIN reservation_details rd ON rd.id=ada.reservation_details_id
       JOIN app_reservation_leg_meta rlm ON rlm.reservation_details_id=rd.id
       JOIN customers c ON c.id=r.customer_id
      WHERE ada.id=? AND ada.driver_id=? ${lock ? 'FOR UPDATE' : ''}`,
    [assignmentId, auth.driverId],
  );
  if (!rows[0]) throw notFound('Assignment not found');
  return rows[0];
};

router.get(
  '/dashboard',
  asyncHandler(async (request, response) => {
    const [today, upcoming, summary] = await Promise.all([
      query(
        `SELECT ada.id,ada.reservation_id AS reservationId,ada.status,ada.scheduled_start_at AS scheduledStartAt,rd.pick_up_location AS pickupAddress,rd.drop_off_location AS dropoffAddress,c.full_name AS customerName FROM app_driver_assignments ada JOIN reservation_details rd ON rd.id=ada.reservation_details_id JOIN reservations r ON r.id=ada.reservation_id JOIN customers c ON c.id=r.customer_id WHERE ada.driver_id=? AND DATE(ada.scheduled_start_at)=CURRENT_DATE AND ada.status NOT IN ('DECLINED','CANCELLED') ORDER BY ada.scheduled_start_at`,
        [request.auth.driverId],
      ),
      query(
        `SELECT ada.id,ada.reservation_id AS reservationId,ada.status,ada.scheduled_start_at AS scheduledStartAt,rd.pick_up_location AS pickupAddress FROM app_driver_assignments ada JOIN reservation_details rd ON rd.id=ada.reservation_details_id WHERE ada.driver_id=? AND DATE(ada.scheduled_start_at)>CURRENT_DATE AND ada.status NOT IN ('DECLINED','CANCELLED') ORDER BY ada.scheduled_start_at LIMIT 10`,
        [request.auth.driverId],
      ),
      one(
        `SELECT COUNT(CASE WHEN status='COMPLETED' AND DATE(updated_at)=CURRENT_DATE THEN 1 END) AS completedToday,COUNT(CASE WHEN status NOT IN ('COMPLETED','DECLINED','CANCELLED','NO_SHOW') AND DATE(scheduled_start_at)=CURRENT_DATE THEN 1 END) AS remainingToday FROM app_driver_assignments WHERE driver_id=?`,
        [request.auth.driverId],
      ),
    ]);
    response.json({ today, upcoming, summary });
  }),
);

router.get(
  '/assignments/:assignmentId',
  asyncHandler(async (request, response) => {
    response.json(await assignmentFor(request.auth, request.params.assignmentId));
  }),
);

router.post(
  '/assignments/:assignmentId/acknowledge',
  asyncHandler(async (request, response) => {
    const assignment = await assignmentFor(request.auth, request.params.assignmentId);
    const changed = assertAssignmentTransition(assignment.status, 'ACKNOWLEDGED');
    if (changed) {
      await query(
        `UPDATE app_driver_assignments SET status='ACKNOWLEDGED',acknowledged_at=NOW(),updated_at=NOW() WHERE id=?`,
        [assignment.id],
      );
      await query(
        `INSERT INTO app_booking_status_events (reservation_id,reservation_details_id,assignment_id,status,actor_user_id,occurred_at,created_at) VALUES (?,?,?,'ACKNOWLEDGED',?,NOW(),NOW())`,
        [
          assignment.reservation_id,
          assignment.reservation_details_id,
          assignment.id,
          request.auth.userId,
        ],
      );
    }
    response.json({ id: assignment.id, status: 'ACKNOWLEDGED' });
  }),
);

router.post(
  '/assignments/:assignmentId/decline',
  validate(z.object({ reason: z.string().min(5).max(1000) })),
  asyncHandler(async (request, response) => {
    const assignment = await assignmentFor(request.auth, request.params.assignmentId);
    assertAssignmentTransition(assignment.status, 'DECLINED');
    await query(
      `UPDATE app_driver_assignments SET status='DECLINED',declined_at=NOW(),decline_reason=?,updated_at=NOW() WHERE id=?`,
      [request.body.reason, assignment.id],
    );
    await query(
      `INSERT INTO app_booking_status_events (reservation_id,reservation_details_id,assignment_id,status,actor_user_id,note,occurred_at,created_at) VALUES (?,?,?,'DECLINED',?,?,NOW(),NOW())`,
      [
        assignment.reservation_id,
        assignment.reservation_details_id,
        assignment.id,
        request.auth.userId,
        request.body.reason,
      ],
    );
    response.json({ id: assignment.id, status: 'DECLINED' });
  }),
);

router.post(
  '/assignments/:assignmentId/status',
  validate(
    z.object({
      status: z.enum([
        'PREPARING',
        'ON_THE_WAY',
        'ARRIVED',
        'WAITING',
        'PASSENGER_ONBOARD',
        'IN_SERVICE',
        'AT_STOP',
        'DROPOFF_REACHED',
        'COMPLETED',
        'NO_SHOW',
      ]),
      note: z.string().max(1000).optional(),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      occurredAt: z.string().datetime().optional(),
    }),
  ),
  asyncHandler(async (request, response) => {
    const result = await transaction(async (connection) => {
      const assignment = await assignmentFor(
        request.auth,
        request.params.assignmentId,
        connection,
        true,
      );
      const changed = assertAssignmentTransition(assignment.status, request.body.status);
      if (!changed) return assignment;
      const occurredAt = request.body.occurredAt?.slice(0, 19).replace('T', ' ') ?? null;
      await connection.execute(
        `UPDATE app_driver_assignments SET status=?,started_at=IF(?='ON_THE_WAY',COALESCE(started_at,NOW()),started_at),completed_at=IF(?='COMPLETED',NOW(),completed_at),updated_at=NOW() WHERE id=?`,
        [request.body.status, request.body.status, request.body.status, assignment.id],
      );
      await connection.execute(
        `UPDATE app_reservation_leg_meta SET status=?,updated_at=NOW() WHERE reservation_details_id=?`,
        [request.body.status, assignment.reservation_details_id],
      );
      await connection.execute(
        `INSERT INTO app_booking_status_events (reservation_id,reservation_details_id,assignment_id,status,actor_user_id,note,latitude,longitude,occurred_at,created_at) VALUES (?,?,?,?,?,?,?,?,COALESCE(?,NOW()),NOW())`,
        [
          assignment.reservation_id,
          assignment.reservation_details_id,
          assignment.id,
          request.body.status,
          request.auth.userId,
          request.body.note ?? null,
          request.body.latitude ?? null,
          request.body.longitude ?? null,
          occurredAt,
        ],
      );
      const [activeRows] = await connection.execute(
        `SELECT COUNT(*) AS total FROM app_driver_assignments WHERE reservation_id=? AND status NOT IN ('COMPLETED','NO_SHOW','DECLINED','CANCELLED')`,
        [assignment.reservation_id],
      );
      const reservationStatus =
        request.body.status === 'COMPLETED' && Number(activeRows[0].total) === 0
          ? 'COMPLETED'
          : request.body.status;
      await connection.execute(
        `UPDATE app_reservation_meta SET lifecycle_status=?,updated_at=NOW() WHERE reservation_id=?`,
        [reservationStatus, assignment.reservation_id],
      );
      if (reservationStatus === 'COMPLETED')
        await connection.execute('UPDATE reservations SET status=2,updated_at=NOW() WHERE id=?', [
          assignment.reservation_id,
        ]);
      return { ...assignment, status: request.body.status };
    });
    await notifyBookingAudience(result.reservation_id, {
      type: 'RIDE_STATUS',
      title: 'Ride status updated',
      body: `Your service is now ${result.status.toLowerCase().replaceAll('_', ' ')}`,
      data: {
        reservationId: result.reservation_id,
        assignmentId: result.id,
        status: result.status,
      },
    });
    response.json({ id: result.id, status: result.status });
  }),
);

router.post(
  '/assignments/:assignmentId/location',
  validate(
    z.object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      heading: z.number().min(0).max(360).optional(),
      speed: z.number().nonnegative().max(400).optional(),
      accuracy: z.number().nonnegative().max(5000).optional(),
      recordedAt: z.string().datetime(),
    }),
  ),
  asyncHandler(async (request, response) => {
    const assignment = await assignmentFor(request.auth, request.params.assignmentId);
    if (TERMINAL_ASSIGNMENT_STATUSES.includes(assignment.status) || assignment.status === 'OFFERED')
      throw conflict('Location sharing is not active for this assignment');
    const recordedAt = new Date(request.body.recordedAt);
    if (
      recordedAt > new Date(Date.now() + 5 * 60_000) ||
      recordedAt < new Date(Date.now() - 24 * 60 * 60_000)
    )
      throw conflict('Location timestamp is outside the accepted range');
    await query(
      `INSERT INTO app_driver_locations (assignment_id,driver_id,latitude,longitude,heading,speed,accuracy,recorded_at,created_at) VALUES (?,?,?,?,?,?,?,?,NOW())`,
      [
        assignment.id,
        request.auth.driverId,
        request.body.latitude,
        request.body.longitude,
        request.body.heading ?? null,
        request.body.speed ?? null,
        request.body.accuracy ?? null,
        request.body.recordedAt.slice(0, 19).replace('T', ' '),
      ],
    );
    const viewers = await query(
      `SELECT DISTINCT u.id AS userId
         FROM reservations r JOIN customers c ON c.id=r.customer_id JOIN users u ON u.id=c.user_id
        WHERE r.id=?
       UNION
       SELECT DISTINCT a.user_id
         FROM reservations r JOIN app_agent_customer_assignments aca ON aca.customer_id=r.customer_id AND aca.status='ACTIVE'
         JOIN agents a ON a.id=aca.agent_id WHERE r.id=?`,
      [assignment.reservation_id, assignment.reservation_id],
    );
    for (const viewer of viewers) {
      emitToUser(viewer.userId, 'assignment.location', {
        assignmentId: assignment.id,
        reservationId: assignment.reservation_id,
        ...request.body,
      });
    }
    response.status(202).json({ accepted: true });
  }),
);

router.post(
  '/assignments/:assignmentId/expenses',
  validate(
    z.object({
      category: z.enum(['FUEL', 'TOLL', 'PARKING', 'MAINTENANCE', 'OTHER']),
      amount: z.number().positive(),
      currency: z.string().length(3).default('EUR'),
      description: z.string().max(1000).optional(),
      documentId: z.number().int().positive().optional(),
      incurredAt: z.string().datetime(),
    }),
  ),
  asyncHandler(async (request, response) => {
    const assignment = await assignmentFor(request.auth, request.params.assignmentId);
    const result = await query(
      `INSERT INTO app_driver_expenses (assignment_id,reservation_id,driver_id,category,amount,currency,description,document_id,status,incurred_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?, 'SUBMITTED',?,NOW(),NOW())`,
      [
        assignment.id,
        assignment.reservation_id,
        request.auth.driverId,
        request.body.category,
        request.body.amount,
        request.body.currency,
        request.body.description ?? null,
        request.body.documentId ?? null,
        request.body.incurredAt.slice(0, 19).replace('T', ' '),
      ],
    );
    response.status(201).json({ id: result.insertId, status: 'SUBMITTED' });
  }),
);

router.post(
  '/assignments/:assignmentId/incidents',
  validate(
    z.object({
      type: z.enum(['ACCIDENT', 'DELAY', 'VEHICLE_ISSUE', 'PASSENGER_ISSUE', 'SAFETY', 'OTHER']),
      severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
      description: z.string().min(10).max(5000),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      documentIds: z.array(z.number().int().positive()).max(10).default([]),
    }),
  ),
  asyncHandler(async (request, response) => {
    const assignment = await assignmentFor(request.auth, request.params.assignmentId);
    const result = await query(
      `INSERT INTO app_incidents (assignment_id,reservation_id,reported_by_user_id,type,severity,description,latitude,longitude,document_ids,status,reported_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,'OPEN',NOW(),NOW(),NOW())`,
      [
        assignment.id,
        assignment.reservation_id,
        request.auth.userId,
        request.body.type,
        request.body.severity,
        request.body.description,
        request.body.latitude ?? null,
        request.body.longitude ?? null,
        JSON.stringify(request.body.documentIds),
      ],
    );
    await notifyBookingAudience(assignment.reservation_id, {
      type: 'INCIDENT',
      title: 'Service incident reported',
      body: 'Operations has been notified about an incident.',
      data: { reservationId: assignment.reservation_id, incidentId: result.insertId },
    });
    response.status(201).json({ id: result.insertId, status: 'OPEN' });
  }),
);

router.get(
  '/history',
  asyncHandler(async (request, response) => {
    const { page, perPage, offset } = pagination(request.query);
    const items = await query(
      `SELECT ada.id,ada.reservation_id AS reservationId,ada.status,ada.scheduled_start_at AS scheduledStartAt,ada.completed_at AS completedAt,rd.pick_up_location AS pickupAddress,rd.drop_off_location AS dropoffAddress,(COALESCE(rdv.pick_up_driver_cost,0)+COALESCE(rdv.drop_off_driver_cost,0)) AS earnings FROM app_driver_assignments ada JOIN reservation_details rd ON rd.id=ada.reservation_details_id LEFT JOIN reservation_drivers rdv ON rdv.id=ada.legacy_reservation_driver_id WHERE ada.driver_id=? AND ada.status IN ('COMPLETED','NO_SHOW','CANCELLED') ORDER BY ada.updated_at DESC LIMIT ? OFFSET ?`,
      [request.auth.driverId, perPage, offset],
    );
    const total = await one(
      `SELECT COUNT(*) AS total FROM app_driver_assignments WHERE driver_id=? AND status IN ('COMPLETED','NO_SHOW','CANCELLED')`,
      [request.auth.driverId],
    );
    response.json(pageResponse(items, Number(total.total), page, perPage));
  }),
);

router.get(
  '/documents',
  asyncHandler(async (request, response) => {
    const items = await query(
      `SELECT id,category,original_name AS name,mime_type AS mimeType,expires_at AS expiresAt,created_at AS createdAt FROM app_documents WHERE owner_user_id=? AND deleted_at IS NULL ORDER BY created_at DESC`,
      [request.auth.userId],
    );
    response.json({ items });
  }),
);

export default router;
