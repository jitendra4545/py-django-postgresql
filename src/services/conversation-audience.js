import { transaction, query } from '../db/pool.js';
import { forbidden, notFound } from '../common/errors.js';

// Native ownership/assignments are authoritative. A stale participant row is
// never sufficient authorization after a driver or agent is removed.
export async function reconcileConversationAudience(connection, { conversationId, reservationId, create = false, actor = null }) {
  if (!reservationId) {
    const [conversations] = await connection.execute('SELECT reservation_id FROM app_conversations WHERE id=?', [conversationId]);
    if (!conversations[0]) throw notFound('Conversation not found');
    reservationId = conversations[0].reservation_id;
  }
  const [parents] = await connection.execute('SELECT id,customer_id,agency_id,status,deleted_at FROM reservations WHERE id=? FOR UPDATE', [reservationId]);
  const parent = parents[0];
  if (!parent) throw notFound('Booking not found');
  if (create && !parent.deleted_at) {
    await connection.execute(`INSERT INTO app_conversations (reservation_id,status,created_at,updated_at)
      VALUES (?,'ACTIVE',NOW(),NOW()) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)`, [reservationId]);
  }
  const [conversations] = await connection.execute('SELECT id,reservation_id,status FROM app_conversations WHERE reservation_id=? FOR UPDATE', [reservationId]);
  const conversation = conversations[0];
  if (!conversation) return null;
  const desired = new Map();
  if (!parent.deleted_at) {
    const [customers] = await connection.execute(`SELECT u.id FROM customers c JOIN users u ON u.id=c.user_id
      WHERE c.id=? AND c.deleted_at IS NULL AND u.deleted_at IS NULL AND u.status=0 AND u.role=5`, [parent.customer_id]);
    for (const user of customers) desired.set(Number(user.id), 'CLIENT');
    // Resolve each role independently: declining pickup must not hide a valid
    // dropoff assignment to the same driver, or retain an unrelated old role.
    if (Number(parent.status)!==3) for (const [column, role] of [['pick_up_driver_id', 'PICKUP'], ['drop_off_driver_id', 'DROPOFF']]) {
      const [drivers] = await connection.execute(`SELECT DISTINCT u.id FROM reservation_drivers rd
        JOIN reservation_details d ON d.id=rd.reservation_details_id AND d.status=1 AND d.deleted_at IS NULL AND COALESCE(d.is_extra_service,0)=0
        JOIN drivers dr ON dr.id=rd.${column} AND dr.deleted_at IS NULL
        JOIN users u ON u.id=dr.user_id AND u.status=0 AND u.deleted_at IS NULL AND u.role=3
        WHERE rd.reservation_id=? AND rd.status=1 AND rd.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM app_mobile_assignment_ids a WHERE a.reservation_driver_id=rd.id
            AND a.driver_id=dr.id AND a.current_slot=1 AND a.assignment_role IN (?,'BOTH')
            AND a.assignment_status IN ('DECLINED','CANCELLED'))`, [reservationId, role]);
      for (const user of drivers) desired.set(Number(user.id), 'CHAUFFEUR');
    }
    const [agents] = await connection.execute(`SELECT DISTINCT u.id FROM app_agent_customer_assignments ac
      JOIN agents a ON a.id=ac.agent_id AND a.deleted_at IS NULL AND a.agency_id=ac.agency_id
      JOIN agencies ag ON ag.id=a.agency_id AND ag.status=1 AND ag.deleted_at IS NULL
      JOIN customers c ON c.id=ac.customer_id AND c.deleted_at IS NULL
      JOIN users u ON u.id=a.user_id AND u.status=0 AND u.deleted_at IS NULL AND u.role=4
      WHERE ac.customer_id=? AND ac.agency_id=? AND ac.status='ACTIVE'
        AND (c.agency_id IS NULL OR c.agency_id=ac.agency_id)`, [parent.customer_id, parent.agency_id]);
    for (const user of agents) desired.set(Number(user.id), 'AGENCY_AGENT');
    const [support] = await connection.execute(`SELECT u.id FROM app_conversation_participants cp JOIN users u ON u.id=cp.user_id
      WHERE cp.conversation_id=? AND cp.participant_role='SUPPORT' AND cp.left_at IS NULL
        AND u.role IN (1,2) AND u.status=0 AND u.deleted_at IS NULL`, [conversation.id]);
    for (const user of support) desired.set(Number(user.id), 'SUPPORT');
    if (actor && [1, 2].includes(Number(actor.role))) desired.set(Number(actor.userId), 'SUPPORT');
  }
  const [existing] = await connection.execute('SELECT user_id FROM app_conversation_participants WHERE conversation_id=? AND left_at IS NULL FOR UPDATE', [conversation.id]);
  for (const item of existing) {
    if (!desired.has(Number(item.user_id))) await connection.execute('UPDATE app_conversation_participants SET left_at=NOW() WHERE conversation_id=? AND user_id=?', [conversation.id, item.user_id]);
  }
  for (const [userId, role] of desired) {
    await connection.execute(`INSERT INTO app_conversation_participants (conversation_id,user_id,participant_role,joined_at)
      VALUES (?,?,?,NOW()) ON DUPLICATE KEY UPDATE participant_role=VALUES(participant_role),left_at=NULL`, [conversation.id, userId, role]);
  }
  // Backfill recipients for native/admin messages and members added after a
  // booking chat was opened. Existing read receipts are not overwritten.
  await connection.execute(`INSERT IGNORE INTO reservation_message_recipients (reservation_message_id,user_id,created_at,updated_at)
    SELECT m.id,cp.user_id,NOW(),NOW() FROM reservation_messages m
    JOIN app_conversation_participants cp ON cp.conversation_id=? AND cp.left_at IS NULL
    WHERE m.reservation_id=? AND m.deleted_at IS NULL AND m.sender_id<>cp.user_id`, [conversation.id, reservationId]);
  if (actor && !desired.has(Number(actor.userId))) throw forbidden('You are no longer a participant in this booking conversation');
  return { ...conversation, participants: [...desired.keys()] };
}

export async function assertConversationAccess(auth, conversationId, connection = null) {
  const reconcile = c => reconcileConversationAudience(c, { conversationId, actor: auth });
  return connection ? reconcile(connection) : transaction(reconcile);
}

export async function syncConversationsForUser(auth) {
  // Include old membership so revoked drivers/agents are removed from their
  // inbox even if they never reopen the original booking screen.
  const ids = await query(`SELECT DISTINCT c.id FROM app_conversations c JOIN reservations r ON r.id=c.reservation_id
    WHERE EXISTS(SELECT 1 FROM app_conversation_participants cp WHERE cp.conversation_id=c.id AND cp.user_id=?)
      OR EXISTS(SELECT 1 FROM customers cu WHERE cu.id=r.customer_id AND cu.user_id=?)
      OR EXISTS(SELECT 1 FROM reservation_drivers rd JOIN drivers d ON d.id=rd.pick_up_driver_id OR d.id=rd.drop_off_driver_id
        WHERE rd.reservation_id=r.id AND d.user_id=?)
      OR EXISTS(SELECT 1 FROM app_agent_customer_assignments ac JOIN agents a ON a.id=ac.agent_id
        WHERE ac.customer_id=r.customer_id AND a.user_id=?) ORDER BY c.id`, Array(4).fill(auth.userId));
  for (const item of ids) await transaction(c => reconcileConversationAudience(c, { conversationId: item.id }));
}
