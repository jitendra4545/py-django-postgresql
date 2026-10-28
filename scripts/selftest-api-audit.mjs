import { EventEmitter } from 'node:events';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiAuditMiddleware } from '../src/middleware/api-audit.js';
import {
  redactValue,
  safeAuditJson,
  safeAuditPath,
} from '../src/services/api-audit-sanitize.js';
import { createAuditQueue } from '../src/services/api-audit-queue.js';

class FakeResponse extends EventEmitter {
  statusCode = 200;
  headers = new Map();
  setHeader(name, value) { this.headers.set(name.toLowerCase(), value); }
  getHeader(name) { return this.headers.get(name.toLowerCase()); }
  json(value) {
    this.setHeader('content-type', 'application/json; charset=utf-8');
    return this.send(JSON.stringify(value));
  }
  send(_value) { this.emit('finish'); return this; }
}

const makeRequest = (path, extras = {}) => ({
  method: 'POST', originalUrl: path, path, ip: '127.0.0.1',
  headers: { 'user-agent': 'Drive Luxury Expo test' },
  socket: { remoteAddress: '127.0.0.1' },
  query: {}, body: {},
  is: () => false,
  ...extras,
});

const logRequest = (request, status, data, method = 'json') => {
  const logs = [];
  const middleware = createApiAuditMiddleware({
    enqueue: (log) => { logs.push(log); }, apiPrefix: '/api/v1',
  });
  const response = new FakeResponse();
  response.statusCode = status;
  let nextCalled = false;
  middleware(request, response, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  if (method === 'json') response.json(data);
  else response.send(data);
  assert.equal(logs.length, 1);
  assert.ok(response.getHeader('x-request-id'));
  return logs[0];
};

test('redacts nested secrets, identity, and GPS but preserves booking fields', () => {
  const safe = redactValue({
    email: 'person@example.com', password: 'top-secret', fullName: 'A Customer',
    refreshToken: 'abc', device: { pushToken: 'ExponentPushToken[ABC]' },
    legs: [{ requestedHours: 5, pickup: { latitude: 30.3, longitude: 78.2, cityId: 123 } }],
    payment: { amount: 250, clientSecret: 'pi_secret_testing' },
  });
  assert.equal(safe.email, '[REDACTED]');
  assert.equal(safe.password, '[REDACTED]');
  assert.equal(safe.fullName, '[REDACTED]');
  assert.equal(safe.refreshToken, '[REDACTED]');
  assert.equal(safe.device.pushToken, '[REDACTED]');
  assert.equal(safe.legs[0].requestedHours, 5);
  assert.equal(safe.legs[0].pickup.latitude, '[REDACTED]');
  assert.equal(safe.legs[0].pickup.cityId, 123);
  assert.equal(safe.payment.amount, 250);
  assert.equal(safe.payment.clientSecret, '[REDACTED]');
  assert.ok(!JSON.stringify(safe).includes('person@example.com'));
});

test('redacts secrets even inside free text', () => {
  const safe = safeAuditJson({
    debug: 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SIGNATURE and +97366787774',
    result: 'mail me at person@example.com',
  });
  const raw = JSON.stringify(safe);
  assert.ok(!raw.includes('eyJhbG'));
  assert.ok(!raw.includes('+97366787774'));
  assert.ok(!raw.includes('person@example.com'));
});

test('GET 304 stores correct access line and no HTTP response body', () => {
  const result = logRequest(
    makeRequest('/api/v1/notifications/unread-count', {
      method: 'GET', body: undefined, query: {},
      auth: { userId: 123, role: 5 },
    }),
    304,
    { unreadCount: 0 },
  );
  assert.match(result.accessLine, /^GET \/api\/v1\/notifications\/unread-count 304 [\d.]+ ms$/);
  assert.equal(result.responseBody, null);
  assert.equal(result.requestBody, null);
  assert.equal(result.userId, 123);
  assert.equal(result.userRole, 5);
  assert.equal(result.statusCode, 304);
});

test('POST captures safe body, query, error response and status 422', () => {
  const result = logRequest(
    makeRequest('/api/v1/bookings/drafts/123/details?secret=abc', {
      body: { requestedHours: 5, email: 'x@y.com', pickup: { cityId: 25, longitude: 8.5 } },
      query: { secret: 'abc', serviceCode: 'CHAUFFEUR' },
    }),
    422,
    { error: { code: 'VALIDATION_FAILED', message: 'Invalid hours' } },
  );
  assert.equal(result.requestBody.requestedHours, 5);
  assert.equal(result.requestBody.email, '[REDACTED]');
  assert.equal(result.requestBody.pickup.cityId, 25);
  assert.equal(result.requestBody.pickup.longitude, '[REDACTED]');
  assert.equal(result.requestQuery.secret, '[REDACTED]');
  assert.equal(result.requestQuery.serviceCode, 'CHAUFFEUR');
  assert.ok(!result.accessLine.includes('secret=abc'));
  assert.equal(result.errorCode, 'VALIDATION_FAILED');
});

test('does not store signed webhook body or expose raw signature', () => {
  const result = logRequest(
    makeRequest('/api/v1/payments/webhook', {
      body: { id: 'evt_1', data: { object: { email: 'x@y.com', card: '4111...' } } },
    }),
    200,
    { received: true },
  );
  assert.equal(result.requestBody._omitted, 'SIGNED_WEBHOOK_PAYLOAD');
});

test('does not store chat content, uploads or long path tokens', () => {
  const msg = logRequest(
    makeRequest('/api/v1/communication/conversations/6/messages', {
      body: { body: 'Private booking message 123' },
    }),
    201,
    { id: 1, message: 'Private booking message 123' },
  );
  assert.equal(msg.requestBody._omitted, 'PRIVATE_CHAT_CONTENT');
  assert.equal(msg.responseBody._omitted, 'PRIVATE_CHAT_CONTENT');

  const upload = logRequest(
    makeRequest('/api/v1/documents', {
      body: { passportNumber: '1234' }, file: { buffer: Buffer.from('sensitive bytes') },
      is: () => true,
    }),
    201,
    { fileId: 35 },
  );
  assert.equal(upload.requestBody._omitted, 'MULTIPART_FILE_CONTENT');
  assert.equal(upload.requestBody.fileCount, 1);
  assert.ok(!JSON.stringify(upload).includes('sensitive bytes'));
  assert.ok(!safeAuditPath('/api/v1/auth/reset-password/super-secret-token').includes('super-secret-token'));
});

test('non API docs and health are excluded', () => {
  const logs = [];
  const middleware = createApiAuditMiddleware({ enqueue: (entry) => logs.push(entry) });
  const response = new FakeResponse();
  middleware(makeRequest('/health'), response, () => {});
  response.json({ status: 'ok' });
  assert.deepEqual(logs, []);
});

test('limits large response JSON without throwing', () => {
  const result = logRequest(
    makeRequest('/api/v1/catalog/vehicle-classes'), 200,
    { items: Array.from({ length: 100 }, (_, index) => ({ id: index, title: 'X'.repeat(200) })) },
  );
  assert.ok(JSON.stringify(result.responseBody).length < 9000);
});

test('queue batches successful inserts and does not synchronously write', async () => {
  const batches = [];
  const queue = createAuditQueue({
    writeBatch: async (batch) => { batches.push(batch); }, maxQueue: 5, batchSize: 3,
  });
  queue.enqueue({ id: 1 });
  queue.enqueue({ id: 2 });
  assert.equal(batches.length, 0);
  queue.enqueue({ id: 3 });
  await queue.flush();
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].map((value) => value.id), [1, 2, 3]);
  assert.equal(queue.stats().queued, 0);
});

test('logging database failures never reject the original HTTP flow', async () => {
  let attempts = 0;
  const queue = createAuditQueue({
    writeBatch: async () => { attempts += 1; throw Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' }); },
    maxQueue: 2, batchSize: 10,
  });
  assert.equal(queue.enqueue({ requestId: 'x' }), true);
  await queue.flush();
  await queue.flush();
  await queue.flush();
  assert.equal(attempts, 3);
  assert.equal(queue.stats().queued, 0);
  assert.equal(queue.stats().dropped, 1);
});

test('client disconnect is recorded once and does not invent a response body', () => {
  const rows = [];
  const middleware = createApiAuditMiddleware({ enqueue: (row) => rows.push(row) });
  const response = new FakeResponse();
  middleware(makeRequest('/api/v1/catalog/vehicle-classes'), response, () => {});
  response.emit('close');
  response.emit('finish');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].statusCode, 499);
  assert.equal(rows[0].responseBody, null);
  assert.equal(rows[0].errorCode, 'CLIENT_DISCONNECTED');
});

test('login response does not persist access or refresh tokens', () => {
  const row = logRequest(
    makeRequest('/api/v1/auth/login', {
      body: { email: 'client@example.com', password: 'my-password' },
    }),
    200,
    {
      user: { id: 5, fullName: 'Example Customer', email: 'client@example.com' },
      tokens: { accessToken: 'jwt-would-be-here', refreshToken: 'refresh-would-be-here', expiresIn: '15m' },
    },
  );
  assert.equal(row.requestBody.password, '[REDACTED]');
  assert.equal(row.responseBody.tokens, '[REDACTED]');
  assert.equal(row.responseBody.user.fullName, '[REDACTED]');
  assert.equal(row.responseBody.user.id, 5);
  assert.ok(!JSON.stringify(row).includes('jwt-would-be-here'));
});
