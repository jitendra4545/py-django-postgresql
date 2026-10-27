import crypto from 'node:crypto';
import { setTimeout, clearTimeout } from 'node:timers';
import { AppError } from '../common/errors.js';
import { env } from '../config/env.js';
import { one, query } from '../db/pool.js';

const e164 = /^\+[1-9]\d{7,14}$/;
export const normalizePhone = (number) => {
  const normalized = String(number ?? '').replace(/[\s()-]/g, '');
  return e164.test(normalized) ? normalized : null;
};

const allowedDestinations = () =>
  env.TELNYX_ALLOWED_DESTINATIONS.split(',').map(normalizePhone).filter(Boolean);

export const createTelnyxBridge = ({ callerPhone, recipientPhone }) => {
  const caller = normalizePhone(callerPhone);
  const recipient = normalizePhone(recipientPhone);
  const dialNumber = normalizePhone(env.TELNYX_MASKED_NUMBER);
  if (!env.TELNYX_API_KEY || !env.TELNYX_CONNECTION_ID || !env.TELNYX_PUBLIC_KEY || !dialNumber) {
    throw new AppError(
      503,
      'TELNYX_NOT_CONFIGURED',
      'Telnyx voice connection, owned number and webhook verification must be configured',
    );
  }
  if (!caller || !recipient || caller === recipient) {
    throw new AppError(
      422,
      'INVALID_CALL_PARTICIPANTS',
      'Distinct E.164 caller and recipient phone numbers are required',
    );
  }
  if (caller === dialNumber || recipient === dialNumber) {
    throw new AppError(
      422,
      'INVALID_CALL_PARTICIPANTS',
      'The Telnyx proxy number must not be a participant number',
    );
  }
  if (allowedDestinations().length && !allowedDestinations().includes(recipient)) {
    throw new AppError(
      403,
      'TELNYX_DESTINATION_NOT_ALLOWED',
      'Recipient is not in the permitted Telnyx sandbox destination list',
    );
  }
  return {
    provider: 'telnyx',
    providerReference: `telnyx_${crypto.randomUUID()}`,
    status: 'READY',
    dialNumber,
    callerPhone: caller,
    recipientPhone: recipient,
    expiresInSeconds: env.MASKED_CALL_TTL_SECONDS,
  };
};

const publicKey = () => {
  const input = env.TELNYX_PUBLIC_KEY.trim();
  if (input.startsWith('-----BEGIN')) return crypto.createPublicKey(input);
  const raw = /^[0-9a-fA-F]{64}$/.test(input)
    ? Buffer.from(input, 'hex')
    : Buffer.from(input, 'base64');
  if (raw.length !== 32) throw new Error('Invalid Telnyx Ed25519 public key');
  return crypto.createPublicKey({
    key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]),
    format: 'der',
    type: 'spki',
  });
};

export const verifyTelnyxWebhook = (
  rawBody,
  signature,
  timestamp,
  nowSeconds = Math.floor(Date.now() / 1000),
) => {
  const sec = Number(timestamp);
  if (!Buffer.isBuffer(rawBody) || !Number.isSafeInteger(sec) || Math.abs(nowSeconds - sec) > 300)
    return false;
  if (typeof signature !== 'string') return false;
  const decoded = Buffer.from(signature, 'base64');
  if (decoded.length !== 64) return false;
  try {
    return crypto.verify(
      null,
      Buffer.concat([Buffer.from(`${timestamp}|`), rawBody]),
      publicKey(),
      decoded,
    );
  } catch {
    return false;
  }
};

export const telnyxCommand = async (path, payload) => {
  const controller = new globalThis.AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://api.telnyx.com/v2${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.TELNYX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      // Never log provider response body (may include telephone numbers or credentials).
      throw new AppError(
        502,
        'TELNYX_PROVIDER_ERROR',
        `Telnyx voice request failed (HTTP ${response.status})`,
      );
    }
    return await response.json();
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(502, 'TELNYX_UNAVAILABLE', 'Telnyx voice service is unavailable');
  } finally {
    clearTimeout(timeout);
  }
};

const stableCommandId = (scope) => {
  const hex = crypto.createHash('sha256').update(scope).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
};

// IMPORTANT: bridge_intent=true can replace the outbound caller ID with the
// inbound caller's PRIVATE number. Use link_to + bridge_on_answer instead, with
// the Telnyx-owned number explicitly in 'from' to preserve the masked caller ID.
export const buildTelnyxOutboundPayload = ({ inboundCallId, recipientPhone }) => ({
  connection_id: env.TELNYX_CONNECTION_ID,
  to: recipientPhone,
  from: env.TELNYX_MASKED_NUMBER,
  link_to: inboundCallId,
  bridge_on_answer: true,
  command_id: stableCommandId(`dial:${inboundCallId}`),
});

export const handleTelnyxEvent = async (event) => {
  const type = event?.data?.event_type;
  const payload = event?.data?.payload || {};
  const callId = String(payload.call_control_id ?? '');
  if (payload.connection_id && String(payload.connection_id) !== String(env.TELNYX_CONNECTION_ID))
    return;
  if (!callId || !['call.initiated', 'call.answered', 'call.bridged', 'call.hangup'].includes(type))
    return;
  if (type === 'call.initiated') {
    if (
      normalizePhone(payload.to) !== normalizePhone(env.TELNYX_MASKED_NUMBER) ||
      payload.direction !== 'incoming'
    )
      return;
    const caller = normalizePhone(payload.from);
    if (!caller) return;
    const routes = await query(
      `SELECT r.masked_call_id AS id,r.recipient_phone AS recipientPhone
       FROM app_telnyx_call_routes r JOIN app_masked_calls c ON c.id=r.masked_call_id
       WHERE r.caller_phone=? AND c.provider='telnyx' AND c.status='READY' AND c.expires_at>NOW()
       ORDER BY c.created_at DESC,c.id DESC LIMIT 2`,
      [caller],
    );
    // Ambiguous concurrent bookings for same caller fail closed; don't connect to a wrong customer.
    if (routes.length !== 1) return;
    const selected = routes[0];
    const updated = await query(
      `UPDATE app_telnyx_call_routes SET inbound_call_id=?
      WHERE masked_call_id=? AND inbound_call_id IS NULL`,
      [callId, selected.id],
    );
    if (!updated.affectedRows) return;
    await query("UPDATE app_masked_calls SET status='RINGING' WHERE id=?", [selected.id]);
    try {
      await telnyxCommand(`/calls/${encodeURIComponent(callId)}/actions/answer`, {
        command_id: stableCommandId(`answer:${callId}`),
      });
    } catch (error) {
      await query('UPDATE app_telnyx_call_routes SET inbound_call_id=NULL WHERE masked_call_id=?', [
        selected.id,
      ]);
      await query("UPDATE app_masked_calls SET status='READY' WHERE id=?", [selected.id]);
      throw error;
    }
  }
  if (type === 'call.answered') {
    const row = await one(
      `SELECT r.masked_call_id AS id,r.recipient_phone AS recipientPhone
      FROM app_telnyx_call_routes r JOIN app_masked_calls c ON c.id=r.masked_call_id
      WHERE r.inbound_call_id=? AND c.status='RINGING' AND c.expires_at>NOW()`,
      [callId],
    );
    if (!row) return;
    // Claim before provider request to avoid double dialing on webhook retries.
    const claimed = await query(
      "UPDATE app_masked_calls SET status='CONNECTING' WHERE id=? AND status='RINGING'",
      [row.id],
    );
    if (!claimed.affectedRows) return;
    if (allowedDestinations().length && !allowedDestinations().includes(row.recipientPhone)) {
      await query("UPDATE app_masked_calls SET status='FAILED' WHERE id=?", [row.id]);
      return;
    }
    try {
      const result = await telnyxCommand(
        '/calls',
        buildTelnyxOutboundPayload({
          inboundCallId: callId,
          recipientPhone: row.recipientPhone,
        }),
      );
      await query('UPDATE app_telnyx_call_routes SET outbound_call_id=? WHERE masked_call_id=?', [
        result?.data?.call_control_id || null,
        row.id,
      ]);
    } catch (error) {
      await query("UPDATE app_masked_calls SET status='FAILED' WHERE id=?", [row.id]);
      throw error;
    }
  }
  if (type === 'call.bridged') {
    const row = await one(
      'SELECT masked_call_id AS id FROM app_telnyx_call_routes WHERE inbound_call_id=? OR outbound_call_id=? LIMIT 1',
      [callId, callId],
    );
    if (row)
      await query(
        "UPDATE app_masked_calls SET status='CONNECTED' WHERE id=? AND status='CONNECTING'",
        [row.id],
      );
  }
  if (type === 'call.hangup') {
    const row = await one(
      `SELECT masked_call_id AS id FROM app_telnyx_call_routes
      WHERE inbound_call_id=? OR outbound_call_id=? LIMIT 1`,
      [callId, callId],
    );
    if (row)
      await query(
        "UPDATE app_masked_calls SET status='COMPLETED' WHERE id=? AND status IN ('RINGING','CONNECTING','CONNECTED')",
        [row.id],
      );
  }
};
