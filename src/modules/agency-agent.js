import { nativeServiceCodeSql, nativeLifecycleSql } from '../services/legacy-reservation-adapter.js';
import { NATIVE_NOTIFICATIONS } from '../services/legacy-read-adapters.js';
import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { asyncHandler } from '../common/async-handler.js';
import { requireAuth, requireRoles } from '../common/auth.js';
import { conflict, notFound } from '../common/errors.js';
import { pageResponse, pagination } from '../common/pagination.js';
import { validate } from '../common/validate.js';
import { ROLES } from '../config/constants.js';
import { one, query, transaction } from '../db/pool.js';
import { hashPassword } from '../services/passwords.js';
import { updateProfileTable } from '../services/profile-updates.js';
import { randomToken } from '../services/tokens.js';

const router = Router();
router.use(requireAuth, requireRoles(ROLES.AGENCY_AGENT));

const loadAgentProfile = (agentId) =>
  one(
    `SELECT a.id,a.agency_id AS agencyId,a.agent_type AS agentType,
            COALESCE(a.full_name,u.full_name) AS fullName,
            COALESCE(a.email,u.email) AS email,a.phone,a.address,
            COALESCE(a.photo,u.photo) AS photo,u.lang AS language
       FROM agents a JOIN users u ON u.id=a.user_id
      WHERE a.id=? AND a.deleted_at IS NULL`,
    [agentId],
  );

router.get(
  '/profile',
  asyncHandler(async (request, response) => {
    response.json(await loadAgentProfile(request.auth.agentId));
  }),
);

router.patch(
  '/profile',
  validate(
    z
      .object({
        fullName: z.string().min(2).max(191).optional(),
        phone: z.string().min(6).max(191).nullable().optional(),
        address: z.string().max(191).nullable().optional(),
        language: z.string().min(2).max(10).optional(),
      })
      .refine((value) => Object.keys(value).length > 0, {
        message: 'At least one profile field is required',
      }),
  ),
  asyncHandler(async (request, response) => {
    await transaction(async (connection) => {
      await updateProfileTable(connection, 'agents', request.auth.agentId, request.body, {
        fullName: 'full_name',
        phone: 'phone',
        address: 'address',
      });
      await updateProfileTable(connection, 'users', request.auth.userId, request.body, {
        fullName: 'full_name',
        language: 'lang',
      });
    });
    response.json({
      message: 'Profile updated',
      profile: await loadAgentProfile(request.auth.agentId),
    });
  }),
);

router.get(
  '/dashboard',
  asyncHandler(async (request, response) => {
    const [clientCount, activeBookings, pendingAlerts, commission] = await Promise.all([
      one(
        `SELECT COUNT(*) AS total
           FROM app_agent_customer_assignments aca
           JOIN customers c ON c.id=aca.customer_id AND c.deleted_at IS NULL
          WHERE aca.agent_id=? AND aca.agency_id=? AND aca.status='ACTIVE'
            AND (c.agency_id IS NULL OR c.agency_id=aca.agency_id)`,
        [request.auth.agentId, request.auth.agencyId],
      ),
      one(
        `SELECT COUNT(*) AS total
           FROM reservations r
          WHERE r.agency_id=? AND r.deleted_at IS NULL
            AND ${nativeLifecycleSql()} NOT IN ('COMPLETED','CANCELLED')`,
        [request.auth.agencyId],
      ),
      one(`SELECT COUNT(*) AS total FROM ${NATIVE_NOTIFICATIONS} native_app_notifications WHERE user_id=? AND read_at IS NULL`, [
        request.auth.userId,
      ]),
      one(
        `SELECT COALESCE(SUM(ac.due_amount),0) AS dueAmount,
                COALESCE(SUM(ac.paid_amount),0) AS paidAmount
           FROM agency_commissions ac
           JOIN reservation_details rd ON rd.id=ac.reservation_details_id
             AND rd.status=1 AND rd.deleted_at IS NULL
          WHERE ac.agency_id=? AND ac.status=1 AND ac.deleted_at IS NULL`,
        [request.auth.agencyId],
      ),
    ]);
    response.json({
      clients: Number(clientCount.total),
      activeBookings: Number(activeBookings.total),
      unreadAlerts: Number(pendingAlerts.total),
      commission,
    });
  }),
);

router.get(
  '/clients',
  asyncHandler(async (request, response) => {
    const { page, perPage, offset } = pagination(request.query);
    const search = `%${request.query.search ?? ''}%`;
    const items = await query(
      `SELECT c.id, c.full_name AS fullName, c.email, c.phone_no AS phone,
            c.city, c.country, aca.notes, aca.assigned_at AS assignedAt
       FROM app_agent_customer_assignments aca JOIN customers c ON c.id=aca.customer_id
      WHERE aca.agent_id=? AND aca.agency_id=? AND aca.status='ACTIVE'
        AND (c.agency_id IS NULL OR c.agency_id=aca.agency_id) AND c.deleted_at IS NULL
        AND (c.full_name LIKE ? OR c.email LIKE ? OR c.phone_no LIKE ?)
      ORDER BY c.full_name LIMIT ? OFFSET ?`,
      [request.auth.agentId, request.auth.agencyId, search, search, search, perPage, offset],
    );
    const total = await one(
      `SELECT COUNT(*) AS total
         FROM app_agent_customer_assignments aca JOIN customers c ON c.id=aca.customer_id
        WHERE aca.agent_id=? AND aca.agency_id=? AND aca.status='ACTIVE'
          AND (c.agency_id IS NULL OR c.agency_id=aca.agency_id) AND c.deleted_at IS NULL
          AND (c.full_name LIKE ? OR c.email LIKE ? OR c.phone_no LIKE ?)`,
      [request.auth.agentId, request.auth.agencyId, search, search, search],
    );
    response.json(pageResponse(items, Number(total.total), page, perPage));
  }),
);

router.post(
  '/clients',
  validate(
    z.object({
      fullName: z.string().min(2).max(191),
      email: z
        .string()
        .email()
        .transform((v) => v.toLowerCase()),
      phone: z.string().min(6).max(30),
      language: z.string().min(2).max(10).default('en'),
      countryId: z.number().int().positive().optional(),
      city: z.string().max(191).optional(),
      preferences: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
  asyncHandler(async (request, response) => {
    const exists = await one('SELECT id FROM users WHERE email=? AND deleted_at IS NULL', [
      request.body.email,
    ]);
    if (exists)
      throw conflict('An account already exists for this email; ask operations to assign it');
    const result = await transaction(async (connection) => {
      const [u] = await connection.execute(
        `INSERT INTO users (user_name,full_name,email,password,status,role,lang,created_at,updated_at) VALUES (?,?,?,?,0,5,?,NOW(),NOW())`,
        [
          request.body.email,
          request.body.fullName,
          request.body.email,
          await hashPassword(randomToken()),
          request.body.language,
        ],
      );
      const [c] = await connection.execute(
        `INSERT INTO customers (uuid,agency_id,full_name,email,phone_no,country_id,city,status,user_id,created_by,is_registered,created_at,updated_at) VALUES (?,?,?,?,?,?,?,1,?,?,1,NOW(),NOW())`,
        [
          uuid(),
          request.auth.agencyId,
          request.body.fullName,
          request.body.email,
          request.body.phone,
          request.body.countryId ?? null,
          request.body.city ?? null,
          u.insertId,
          request.auth.userId,
        ],
      );
      await connection.execute(
        `INSERT INTO app_agent_customer_assignments (agent_id,customer_id,agency_id,status,preferences,assigned_by_user_id,assigned_at,created_at,updated_at) VALUES (?,?,?,'ACTIVE',?,?,NOW(),NOW(),NOW())`,
        [
          request.auth.agentId,
          c.insertId,
          request.auth.agencyId,
          JSON.stringify(request.body.preferences ?? {}),
          request.auth.userId,
        ],
      );
      return { customerId: c.insertId, userId: u.insertId };
    });
    response.status(201).json(result);
  }),
);

router.get(
  '/clients/:customerId',
  asyncHandler(async (request, response) => {
    const client = await one(
      `SELECT c.id,c.full_name AS fullName,c.email,c.phone_no AS phone,c.city,c.country,aca.preferences,aca.notes
         FROM app_agent_customer_assignments aca JOIN customers c ON c.id=aca.customer_id
        WHERE aca.agent_id=? AND aca.agency_id=? AND c.id=? AND aca.status='ACTIVE'
          AND (c.agency_id IS NULL OR c.agency_id=aca.agency_id) AND c.deleted_at IS NULL`,
      [request.auth.agentId, request.auth.agencyId, request.params.customerId],
    );
    if (!client) throw notFound('Client not found in your roster');
    response.json(client);
  }),
);

router.get(
  '/clients/:customerId/bookings',
  asyncHandler(async (request, response) => {
    const membership = await one(
      `SELECT aca.id
         FROM app_agent_customer_assignments aca
         JOIN customers c ON c.id=aca.customer_id AND c.deleted_at IS NULL
        WHERE aca.agent_id=? AND aca.customer_id=? AND aca.agency_id=?
          AND aca.status='ACTIVE' AND (c.agency_id IS NULL OR c.agency_id=aca.agency_id)`,
      [request.auth.agentId, request.params.customerId, request.auth.agencyId],
    );
    if (!membership) throw notFound('Client not found in your roster');
    const items = await query(
      `SELECT r.id,r.reservation_no AS reservationNo,${nativeServiceCodeSql()} AS serviceCode,${nativeLifecycleSql()} AS status,MIN(rd.pick_up_date) AS serviceDate
         FROM reservations r
         LEFT JOIN reservation_details rd ON rd.reservation_id=r.id
          AND rd.status=1 AND rd.deleted_at IS NULL AND COALESCE(rd.is_extra_service,0)=0
        WHERE r.customer_id=? AND r.agency_id=? AND r.deleted_at IS NULL
        GROUP BY r.id ORDER BY r.created_at DESC`,
      [request.params.customerId, request.auth.agencyId],
    );
    response.json({ items });
  }),
);

router.get(
  '/commissions',
  asyncHandler(async (request, response) => {
    const items = await query(
      `SELECT ac.id,ac.reservation_id AS reservationId,ac.commission_amount AS commissionAmount,ac.paid_amount AS paidAmount,ac.due_amount AS dueAmount,ac.commission_percentage AS commissionPercentage,ac.status,ac.created_at AS createdAt
         FROM agency_commissions ac
         JOIN reservation_details rd ON rd.id=ac.reservation_details_id
          AND rd.status=1 AND rd.deleted_at IS NULL
        WHERE ac.agency_id=? AND ac.status=1 AND ac.deleted_at IS NULL
        ORDER BY ac.created_at DESC LIMIT 200`,
      [request.auth.agencyId],
    );
    response.json({ items });
  }),
);

export default router;
