import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../common/async-handler.js';
import { requireAuth } from '../common/auth.js';
import { AppError, forbidden, notFound } from '../common/errors.js';
import { pageResponse, pagination } from '../common/pagination.js';
import { validate } from '../common/validate.js';
import { ROLES } from '../config/constants.js';
import { one, query, transaction } from '../db/pool.js';
import { getReservationForAccess } from '../services/access.js';
import { canCallRecipientRole, createMaskedCallBridge } from '../services/masked-call-provider.js';
import { notifyUser } from '../services/notifications.js';
import { emitToConversation } from '../services/realtime.js';
import { env } from '../config/env.js';
import { canAttachDocument } from '../services/chat-policy.js';

const router = Router();
router.use(requireAuth);
const maskedCallLimiter = rateLimit({
  windowMs: 10 * 60_000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
});
const messageLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const assertParticipant = async (auth, conversationId) => {
  if ([ROLES.ADMIN, ROLES.STAFF].includes(auth.role)) return;
  const participant = await one(
    `SELECT id FROM app_conversation_participants WHERE conversation_id=? AND user_id=? AND left_at IS NULL`,
    [conversationId, auth.userId],
  );
  if (!participant) throw forbidden('You are not a participant in this conversation');
};

router.get(
  '/conversations',
  asyncHandler(async (request, response) => {
    const { page, perPage, offset } = pagination(request.query);
    const items = await query(
      `SELECT c.id,c.reservation_id AS reservationId,c.status,c.updated_at AS updatedAt,
              r.reservation_no AS reservationNo,
              lm.id AS lastMessageId,lm.message_type AS lastMessageType,
              lm.body AS lastMessageBody,lm.created_at AS lastMessageAt,
              (SELECT COUNT(*) FROM app_messages unread
                WHERE unread.conversation_id=c.id AND unread.deleted_at IS NULL
                  AND unread.sender_user_id<>?
                  AND (cp.last_read_at IS NULL OR unread.created_at>cp.last_read_at)) AS unreadCount
         FROM app_conversation_participants cp
         JOIN app_conversations c ON c.id=cp.conversation_id
         JOIN reservations r ON r.id=c.reservation_id
         LEFT JOIN app_messages lm ON lm.id=(
           SELECT m2.id FROM app_messages m2
            WHERE m2.conversation_id=c.id AND m2.deleted_at IS NULL
            ORDER BY m2.created_at DESC,m2.id DESC LIMIT 1
         )
        WHERE cp.user_id=? AND cp.left_at IS NULL
        ORDER BY COALESCE(lm.created_at,c.updated_at) DESC LIMIT ? OFFSET ?`,
      [request.auth.userId, request.auth.userId, perPage, offset],
    );
    const total = await one(
      `SELECT COUNT(*) AS total FROM app_conversation_participants
        WHERE user_id=? AND left_at IS NULL`,
      [request.auth.userId],
    );
    response.json(pageResponse(items, Number(total.total), page, perPage));
  }),
);

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
    response.status(201).json({ id, reservationId: reservation.id, status: 'ACTIVE' });
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
    response.json(pageResponse(items.reverse(), Number(total.total), page, perPage));
  }),
);

router.post(
  '/conversations/:conversationId/read',
  validate(z.object({ lastMessageId: z.number().int().positive().optional() }).default({})),
  asyncHandler(async (request, response) => {
    await assertParticipant(request.auth, request.params.conversationId);
    const lastMessage = await one(
      request.body.lastMessageId
        ? `SELECT id,created_at AS createdAt FROM app_messages
            WHERE id=? AND conversation_id=? AND deleted_at IS NULL`
        : `SELECT id,created_at AS createdAt FROM app_messages
            WHERE conversation_id=? AND deleted_at IS NULL
            ORDER BY created_at DESC,id DESC LIMIT 1`,
      request.body.lastMessageId
        ? [request.body.lastMessageId, request.params.conversationId]
        : [request.params.conversationId],
    );
    if (request.body.lastMessageId && !lastMessage) {
      throw notFound('Message not found in this conversation');
    }
    const readAt = lastMessage?.createdAt ?? new Date();
    await query(
      `UPDATE app_conversation_participants
          SET last_read_at=GREATEST(COALESCE(last_read_at,'1970-01-01 00:00:00'),?)
        WHERE conversation_id=? AND user_id=? AND left_at IS NULL`,
      [readAt, request.params.conversationId, request.auth.userId],
    );
    emitToConversation(request.params.conversationId, 'conversation.read', {
      conversationId: Number(request.params.conversationId),
      userId: request.auth.userId,
      lastMessageId: lastMessage?.id ?? null,
      readAt: new Date(readAt).toISOString(),
    });
    response.status(204).end();
  }),
);

router.post(
  '/conversations/:conversationId/messages',
  messageLimiter,
  validate(
    z
      .object({
        messageType: z.enum(['TEXT', 'DOCUMENT']).default('TEXT'),
        body: z.string().max(4000).optional(),
        documentId: z.number().int().positive().optional(),
      })
      .superRefine((value, context) => {
        if (value.messageType === 'TEXT' && !value.body?.trim()) {
          context.addIssue({ code: 'custom', message: 'Text messages require a body' });
        }
        if (value.messageType === 'DOCUMENT' && !value.documentId) {
          context.addIssue({ code: 'custom', message: 'Document messages require documentId' });
        }
      }),
  ),
  asyncHandler(async (request, response) => {
    await assertParticipant(request.auth, request.params.conversationId);
    const conversation = await one(
      `SELECT id,reservation_id AS reservationId,status FROM app_conversations WHERE id=?`,
      [request.params.conversationId],
    );
    if (!conversation || conversation.status !== 'ACTIVE')
      throw notFound('Active conversation not found');
    if (request.body.documentId) {
      const document = await one(
        `SELECT id,owner_user_id,reservation_id,expires_at FROM app_documents
          WHERE id=? AND deleted_at IS NULL`,
        [request.body.documentId],
      );
      if (
        !canAttachDocument({
          auth: request.auth,
          document,
          reservationId: conversation.reservationId,
        })
      ) {
        throw forbidden('This document cannot be attached to the conversation');
      }
    }
    const result = await transaction(async (connection) => {
      const [created] = await connection.execute(
        `INSERT INTO app_messages (conversation_id,sender_user_id,message_type,body,document_id,created_at) VALUES (?,?,?,?,?,NOW())`,
        [
          conversation.id,
          request.auth.userId,
          request.body.messageType,
          request.body.body?.trim() ?? null,
          request.body.documentId ?? null,
        ],
      );
      await connection.execute('UPDATE app_conversations SET updated_at=NOW() WHERE id=?', [
        conversation.id,
      ]);
      await connection.execute(
        `UPDATE app_conversation_participants SET last_read_at=NOW()
          WHERE conversation_id=? AND user_id=?`,
        [conversation.id, request.auth.userId],
      );
      return created;
    });
    const message = {
      id: result.insertId,
      conversationId: conversation.id,
      reservationId: conversation.reservationId,
      senderUserId: request.auth.userId,
      messageType: request.body.messageType,
      body: request.body.body?.trim() ?? null,
      documentId: request.body.documentId ?? null,
      createdAt: new Date().toISOString(),
    };
    emitToConversation(conversation.id, 'message.created', message);
    const recipients = await query(
      `SELECT user_id AS userId FROM app_conversation_participants
        WHERE conversation_id=? AND user_id<>? AND left_at IS NULL`,
      [conversation.id, request.auth.userId],
    );
    await Promise.all(
      recipients.map((recipient) =>
        notifyUser({
          userId: recipient.userId,
          type: 'NEW_MESSAGE',
          title: 'New booking message',
          body: 'You have a new message about a booking',
          data: {
            conversationId: conversation.id,
            reservationId: conversation.reservationId,
            messageId: message.id,
          },
        }).catch((error) =>
          console.error('New-message notification failed', {
            userId: recipient.userId,
            error: error.message,
          }),
        ),
      ),
    );
    response.status(201).json(message);
  }),
);

router.post(
  '/bookings/:reservationId/masked-call',
  maskedCallLimiter,
  validate(z.object({ recipientRole: z.enum(['CLIENT', 'CHAUFFEUR', 'SUPPORT']) })),
  asyncHandler(async (request, response) => {
    const recipientRole = request.body.recipientRole;
    if (!canCallRecipientRole(request.auth.role, recipientRole)) {
      throw forbidden('This recipient role cannot be called by the current user');
    }
    const reservation = await getReservationForAccess(request.auth, request.params.reservationId);
    if (env.MASKED_CALL_PROVIDER === 'telnyx') {
      const inactiveStatuses = new Set([
        'PAYMENT_PENDING',
        'CHANGE_PAYMENT_PENDING',
        'REJECTED',
        'CANCELLED',
        'CANCELLATION_APPROVED',
        'COMPLETED',
      ]);
      if (inactiveStatuses.has(reservation.lifecycle_status) || Number(reservation.status) === 3) {
        throw new AppError(409, 'BOOKING_NOT_CALLABLE', 'Masked calls require an active booking');
      }
    }

    let recipient;
    if (recipientRole === 'CLIENT') {
      recipient = await one('SELECT phone_no AS phone FROM customers WHERE id=?', [
        reservation.customer_id,
      ]);
    } else if (recipientRole === 'CHAUFFEUR') {
      recipient = await one(
        `SELECT d.phone FROM app_driver_assignments ada JOIN drivers d ON d.id=ada.driver_id
          WHERE ada.reservation_id=? AND ada.status NOT IN ('DECLINED','CANCELLED','COMPLETED','NO_SHOW')
          ORDER BY ada.updated_at DESC LIMIT 1`,
        [reservation.id],
      );
    } else {
      recipient = { phone: env.SUPPORT_PHONE };
    }
    if (!recipient?.phone) throw notFound('No callable recipient is available for this booking');

    // Keep the existing mocked provider path for development. The real Telnyx
    // adapter must know the caller's registered number to route an inbound call.
    let callerPhone;
    if (env.MASKED_CALL_PROVIDER === 'telnyx') {
      let caller;
      if (request.auth.role === ROLES.CLIENT) {
        caller = await one('SELECT phone_no AS phone FROM customers WHERE id=?', [
          request.auth.customerId,
        ]);
      } else if (request.auth.role === ROLES.CHAUFFEUR) {
        caller = await one('SELECT phone FROM drivers WHERE id=?', [request.auth.driverId]);
      } else if (request.auth.role === ROLES.AGENCY_AGENT) {
        caller = await one('SELECT phone FROM agents WHERE id=?', [request.auth.agentId]);
      } else {
        // Staff must dial from this configured company phone; a staff personal
        // mobile number is not otherwise known to the legacy user schema.
        caller = { phone: env.SUPPORT_PHONE };
      }
      if (!caller?.phone) {
        throw new AppError(
          422,
          'CALLER_PHONE_REQUIRED',
          'A registered caller phone number is required',
        );
      }
      callerPhone = caller.phone;
    }

    const bridge = await createMaskedCallBridge({
      reservationId: reservation.id,
      initiatorUserId: request.auth.userId,
      recipientRole,
      recipientPhone: recipient.phone,
      callerPhone,
    });

    // Telnyx uses one shared inbound DID. Reuse an active route to prevent
    // duplicate simultaneous booking routes from silently dialing the wrong
    // recipient when the same authenticated caller phones that DID.
    const saved =
      bridge.provider === 'telnyx'
        ? await transaction(async (connection) => {
            // Serialize requests from the same user, including multiple devices.
            await connection.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [
              request.auth.userId,
            ]);
            const [existing] = await connection.execute(
              `SELECT c.id,c.reservation_id AS reservationId,c.recipient_role AS recipientRole,
                    c.status,r.recipient_phone AS recipientPhone,
                    GREATEST(TIMESTAMPDIFF(SECOND,NOW(),c.expires_at),0) AS remainingSeconds
               FROM app_masked_calls c
               JOIN app_telnyx_call_routes r ON r.masked_call_id=c.id
              WHERE c.initiator_user_id=? AND r.caller_phone=? AND c.provider='telnyx'
                AND c.status IN ('READY','RINGING','CONNECTING','CONNECTED')
                AND c.expires_at>NOW()
              ORDER BY c.created_at DESC,c.id DESC FOR UPDATE`,
              [request.auth.userId, bridge.callerPhone],
            );
            if (existing.length) {
              const item = existing[0];
              const sameRoute =
                existing.length === 1 &&
                Number(item.reservationId) === Number(reservation.id) &&
                item.recipientRole === recipientRole &&
                item.recipientPhone === bridge.recipientPhone;
              if (!sameRoute) {
                throw new AppError(
                  409,
                  'MASKED_CALL_ALREADY_ACTIVE',
                  'Finish or allow the previous masked call to expire before calling a different recipient',
                );
              }
              return {
                id: item.id,
                status: item.status,
                reused: true,
                expiresInSeconds: Number(item.remainingSeconds),
              };
            }
            const [created] = await connection.execute(
              `INSERT INTO app_masked_calls
              (reservation_id,initiator_user_id,recipient_role,provider,provider_reference,status,expires_at,created_at)
             VALUES (?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL ? SECOND),NOW())`,
              [
                reservation.id,
                request.auth.userId,
                recipientRole,
                bridge.provider,
                bridge.providerReference,
                bridge.status,
                bridge.expiresInSeconds,
              ],
            );
            await connection.execute(
              `INSERT INTO app_telnyx_call_routes
              (masked_call_id,caller_phone,recipient_phone,created_at)
             VALUES (?,?,?,NOW())`,
              [created.insertId, bridge.callerPhone, bridge.recipientPhone],
            );
            return {
              id: created.insertId,
              status: bridge.status,
              reused: false,
              expiresInSeconds: bridge.expiresInSeconds,
            };
          })
        : await (async () => {
            const created = await query(
              `INSERT INTO app_masked_calls
              (reservation_id,initiator_user_id,recipient_role,provider,provider_reference,status,expires_at,created_at)
             VALUES (?,?,?,?,?,?,DATE_ADD(NOW(),INTERVAL ? SECOND),NOW())`,
              [
                reservation.id,
                request.auth.userId,
                recipientRole,
                bridge.provider,
                bridge.providerReference,
                bridge.status,
                bridge.expiresInSeconds,
              ],
            );
            return {
              id: created.insertId,
              status: bridge.status,
              reused: false,
              expiresInSeconds: bridge.expiresInSeconds,
            };
          })();

    response.status(saved.reused ? 200 : 201).json({
      id: saved.id,
      status: saved.status,
      dialNumber: bridge.dialNumber,
      expiresInSeconds: saved.expiresInSeconds,
      reused: saved.reused,
    });
  }),
);

export default router;
