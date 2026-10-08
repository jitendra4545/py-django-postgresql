import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../common/async-handler.js';
import { requireAuth } from '../common/auth.js';
import { forbidden, notFound } from '../common/errors.js';
import { pageResponse, pagination } from '../common/pagination.js';
import { validate } from '../common/validate.js';
import { ROLES } from '../config/constants.js';
import { one, query, transaction } from '../db/pool.js';
import { getReservationForAccess } from '../services/access.js';
import { emitToConversation } from '../services/realtime.js';

const router = Router();
router.use(requireAuth);

const assertParticipant = async (auth, conversationId) => {
  if ([ROLES.ADMIN, ROLES.STAFF].includes(auth.role)) return;
  const participant = await one(
    `SELECT id FROM app_conversation_participants WHERE conversation_id=? AND user_id=? AND left_at IS NULL`,
    [conversationId, auth.userId],
  );
  if (!participant) throw forbidden('You are not a participant in this conversation');
};

router.post(
  '/bookings/:reservationId/conversation',
  asyncHandler(async (request, response) => {
    const reservation = await getReservationForAccess(request.auth, request.params.reservationId);
    const id = await transaction(async (connection) => {
      const [existingRows] = await connection.execute(
        'SELECT id FROM app_conversations WHERE reservation_id=?',
        [reservation.id],
      );
      let conversationId = existingRows[0]?.id;
      if (!conversationId) {
        const [created] = await connection.execute(
          `INSERT INTO app_conversations (reservation_id,status,created_at,updated_at) VALUES (?,'ACTIVE',NOW(),NOW())`,
          [reservation.id],
        );
        conversationId = created.insertId;
      }
      await connection.execute(
        `INSERT IGNORE INTO app_conversation_participants (conversation_id,user_id,participant_role,joined_at) SELECT ?,u.id,'CLIENT',NOW() FROM customers c JOIN users u ON u.id=c.user_id WHERE c.id=?`,
        [conversationId, reservation.customer_id],
      );
      await connection.execute(
        `INSERT IGNORE INTO app_conversation_participants (conversation_id,user_id,participant_role,joined_at) SELECT ?,d.user_id,'CHAUFFEUR',NOW() FROM app_driver_assignments ada JOIN drivers d ON d.id=ada.driver_id WHERE ada.reservation_id=? AND ada.status NOT IN ('DECLINED','CANCELLED')`,
        [conversationId, reservation.id],
      );
      await connection.execute(
        `INSERT IGNORE INTO app_conversation_participants (conversation_id,user_id,participant_role,joined_at) SELECT ?,a.user_id,'AGENCY_AGENT',NOW() FROM app_agent_customer_assignments aca JOIN agents a ON a.id=aca.agent_id WHERE aca.customer_id=? AND aca.status='ACTIVE'`,
        [conversationId, reservation.customer_id],
      );
      await connection.execute(
        `INSERT IGNORE INTO app_conversation_participants (conversation_id,user_id,participant_role,joined_at) VALUES (?,?,?,NOW())`,
        [
          conversationId,
          request.auth.userId,
          request.auth.role === ROLES.STAFF || request.auth.role === ROLES.ADMIN
            ? 'SUPPORT'
            : 'MEMBER',
        ],
      );
      return conversationId;
    });
    response.status(201).json({ id });
  }),
);

router.get(
  '/conversations/:conversationId/messages',
  asyncHandler(async (request, response) => {
    await assertParticipant(request.auth, request.params.conversationId);
    const { page, perPage, offset } = pagination(request.query);
    const items = await query(
      `SELECT m.id,m.sender_user_id AS senderUserId,u.full_name AS senderName,m.message_type AS messageType,m.body,m.document_id AS documentId,m.created_at AS createdAt FROM app_messages m JOIN users u ON u.id=m.sender_user_id WHERE m.conversation_id=? AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT ? OFFSET ?`,
      [request.params.conversationId, perPage, offset],
    );
    const total = await one(
      'SELECT COUNT(*) AS total FROM app_messages WHERE conversation_id=? AND deleted_at IS NULL',
      [request.params.conversationId],
    );
    await query(
      `UPDATE app_conversation_participants SET last_read_at=NOW() WHERE conversation_id=? AND user_id=?`,
      [request.params.conversationId, request.auth.userId],
    );
    response.json(pageResponse(items.reverse(), Number(total.total), page, perPage));
  }),
);

router.post(
  '/conversations/:conversationId/messages',
  validate(
    z
      .object({
        messageType: z.enum(['TEXT', 'DOCUMENT']).default('TEXT'),
        body: z.string().max(4000).optional(),
        documentId: z.number().int().positive().optional(),
      })
      .refine((value) => value.body || value.documentId, {
        message: 'Message body or document is required',
      }),
  ),
  asyncHandler(async (request, response) => {
    await assertParticipant(request.auth, request.params.conversationId);
    const conversation = await one(`SELECT id,status FROM app_conversations WHERE id=?`, [
      request.params.conversationId,
    ]);
    if (!conversation || conversation.status !== 'ACTIVE')
      throw notFound('Active conversation not found');
    const result = await query(
      `INSERT INTO app_messages (conversation_id,sender_user_id,message_type,body,document_id,created_at) VALUES (?,?,?,?,?,NOW())`,
      [
        conversation.id,
        request.auth.userId,
        request.body.messageType,
        request.body.body ?? null,
        request.body.documentId ?? null,
      ],
    );
    const message = {
      id: result.insertId,
      conversationId: conversation.id,
      senderUserId: request.auth.userId,
      ...request.body,
      createdAt: new Date().toISOString(),
    };
    emitToConversation(conversation.id, 'message.created', message);
    response.status(201).json(message);
  }),
);

router.post(
  '/bookings/:reservationId/masked-call',
  validate(z.object({ recipientRole: z.enum(['CLIENT', 'CHAUFFEUR', 'SUPPORT']) })),
  asyncHandler(async (request, response) => {
    await getReservationForAccess(request.auth, request.params.reservationId);
    const result = await query(
      `INSERT INTO app_masked_calls (reservation_id,initiator_user_id,recipient_role,provider,status,expires_at,created_at) VALUES (?,?,?,'mock','READY',DATE_ADD(NOW(),INTERVAL 10 MINUTE),NOW())`,
      [request.params.reservationId, request.auth.userId, request.body.recipientRole],
    );
    response.status(201).json({
      id: result.insertId,
      status: 'READY',
      dialNumber: '+0000000000',
      expiresInSeconds: 600,
    });
  }),
);

export default router;
