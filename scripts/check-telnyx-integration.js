import crypto from 'node:crypto';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET ||= 'test-secret-access-abcdefghijklmnopqrstuvwxyz';
process.env.JWT_REFRESH_SECRET ||= 'test-secret-refresh-abcdefghijklmnopqrstuvwxyz';
process.env.MASKED_CALL_PROVIDER = 'disabled';
process.env.PAYMENT_PROVIDER = 'mock';
process.env.UPLOAD_DRIVER = 'local';

const { env } = await import('../src/config/env.js');
const { normalizePhone, verifyTelnyxWebhook, createTelnyxBridge, buildTelnyxOutboundPayload } =
  await import('../src/services/telnyx-masked-calling.js');

assert.equal(normalizePhone(' +973 3999 9999 '), '+97339999999');
assert.equal(normalizePhone('555'), null);
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const publicKeyBase64 = publicKey
  .export({ type: 'spki', format: 'der' })
  .subarray(-32)
  .toString('base64');
const before = { ...env };
Object.assign(env, {
  TELNYX_PUBLIC_KEY: publicKeyBase64,
  TELNYX_API_KEY: 'test-key-not-live',
  TELNYX_CONNECTION_ID: 'test-voice-connection',
  TELNYX_MASKED_NUMBER: '+14155550100',
  TELNYX_ALLOWED_DESTINATIONS: '+97339999999',
});
try {
  const timestamp = Math.floor(Date.now() / 1000);
  const rawBody = Buffer.from('{"data":{"event_type":"call.initiated"}}');
  const signed = Buffer.concat([Buffer.from(`${timestamp}|`), rawBody]);
  const signature = crypto.sign(null, signed, privateKey).toString('base64');
  assert.equal(verifyTelnyxWebhook(rawBody, signature, String(timestamp)), true);
  assert.equal(verifyTelnyxWebhook(Buffer.from('tampered'), signature, String(timestamp)), false);
  assert.equal(verifyTelnyxWebhook(rawBody, signature, String(timestamp - 600)), false);
  const prepared = createTelnyxBridge({
    callerPhone: '+14155550101',
    recipientPhone: '+97339999999',
  });
  assert.equal(prepared.status, 'READY');
  assert.equal(prepared.dialNumber, '+14155550100');
  assert.throws(
    () => createTelnyxBridge({ callerPhone: '+14155550101', recipientPhone: '+14155550102' }),
    { code: 'TELNYX_DESTINATION_NOT_ALLOWED' },
  );
  assert.throws(
    () => createTelnyxBridge({ callerPhone: '+14155550101', recipientPhone: '+14155550101' }),
    { code: 'INVALID_CALL_PARTICIPANTS' },
  );
  const payload = buildTelnyxOutboundPayload({
    inboundCallId: 'some-inbound-call-id',
    recipientPhone: '+97339999999',
  });
  assert.equal(payload.from, '+14155550100');
  assert.equal(payload.link_to, 'some-inbound-call-id');
  assert.equal(payload.bridge_on_answer, true);
  assert.equal(Object.hasOwn(payload, 'bridge_intent'), false);
  assert.deepEqual(
    payload,
    buildTelnyxOutboundPayload({
      inboundCallId: 'some-inbound-call-id',
      recipientPhone: '+97339999999',
    }),
  );
  console.log(
    'Telnyx QA passed: E.164, signature/replay, allowlist, masked caller ID, automatic bridge, stable commands',
  );
} finally {
  Object.assign(env, before);
}
