import { URL } from 'node:url';
// Isolated route-level smoke tests. No MySQL, Stripe or live hosting calls.
// Run: node --experimental-test-module-mocks --test scripts/selftest-payment-http.mjs
import { mock, test } from 'node:test';
import assert from 'node:assert/strict';

const mod = (path, namedExports) => mock.module(new URL(path, import.meta.url), { namedExports });
const apiState = {
  mode: 'PAY_LATER',
  lastInsertId: 77,
  lifecycle: 'PAYMENT_PENDING',
  legacyStatus: 0,
  paymentStatus: 'CREATED',
  paymentReference: null,
  paymentPayload: { checkoutPaymentOption: 'PAY_LATER' },
  events: [],
  requestedStripe: [],
  webhookType: 'payment_intent.payment_failed',
  failStripe: false,
  createdAt: '2026-01-01T00:00:00Z',
  nativeTotal: 50,
  nativePayments: [],
};
const simulateQuery = async (sql) => {
  if (sql.includes('FROM reservations r') && sql.includes('firstServiceDate')) {
    return [{ id: 101, reservationNo: 'DL03715', customerId: 50, serviceCode: 'CHAUFFEUR', status: apiState.lifecycle, currency: 'CHF', legacyStatus: apiState.legacyStatus, lastPaymentId: 77, lastPaymentStatus: apiState.paymentStatus, lastProviderReference: apiState.paymentReference, lastProviderPayload: apiState.paymentPayload, lastPaymentCreatedAt: apiState.createdAt, quoteIsValid: 0 }];
  }
  return [];
};
const simulateOne = async (sql) => {
  if (sql.includes('COUNT(*) AS total')) return { total: 1 };
  if (sql.includes('FROM app_payment_transactions')) return { id: 77, reservation_id: 101, user_id: 10, provider: 'mock', amount: 50, currency: 'CHF', status: apiState.paymentStatus, provider_reference: apiState.paymentReference, provider_payload: apiState.paymentPayload, created_at: apiState.createdAt };
  if (sql.includes('FROM reservations r')) return { reservationStatus: apiState.legacyStatus, lifecycleStatus: apiState.lifecycle, quoteIsValid: 0 };
  if (sql.includes('FROM reservations WHERE id=')) return { status: apiState.legacyStatus, lifecycleStatus: apiState.lifecycle };
  return null;
};
const execute = async (sql, params = []) => {
  if(sql.includes('FROM app_payment_transactions')&&sql.includes('FOR UPDATE')&&!sql.includes('SELECT status')) return [[await simulateOne('FROM app_payment_transactions')]];
  if(sql.includes('created_by_user_id,service_code FROM reservations'))return [[{id:101,status:apiState.legacyStatus,payment_status:0,lifecycle_status:apiState.lifecycle,created_by_user_id:10,service_code:'CHAUFFEUR'}]];
  if (sql.includes('SELECT id,currency,payment_status,status FROM reservations')) return [[{ id:101, currency:'CHF', payment_status:0, status:apiState.legacyStatus }]];
  if (sql.includes('SELECT c.total_amount FROM reservation_costs')) return [[{ total_amount:apiState.nativeTotal }]];
  if (sql.includes('SELECT payment_amount FROM reservation_payments')) return [apiState.nativePayments.map(payment_amount=>({payment_amount}))];
  if (sql.includes('INSERT INTO reservation_payments')) apiState.nativePayments.push(params[2]);
  if (sql.includes('FROM app_quote_snapshots')) return [[{ draft_id: 22, draft_revision: 1, request_hash: 'hash', quote_data: { total: 50, currency: 'CHF',__native:{taxPolicy:apiState.quoteTaxPolicy??'BASE_FEE_ONLY_V1'} } }]];
  if (sql.includes('INSERT INTO app_payment_transactions')) {
    apiState.paymentStatus = params[5];apiState.paymentPayload = JSON.parse(params[7]);apiState.paymentReference = null;return [{ insertId: 77 }];
  }
  if (sql.includes('FROM app_payment_transactions') && sql.includes('FOR UPDATE')) return [[{ status: apiState.paymentStatus }]];
  if (sql.includes('SELECT lifecycle_status FROM reservations')) return [[{ lifecycle_status: apiState.lifecycle }]];
  if (sql.includes('FROM reservations r') && sql.includes('FOR UPDATE')) return [[{ status: apiState.legacyStatus, lifecycle_status: apiState.lifecycle }]];
  if (sql.includes("lifecycle_status='PAYMENT_DUE'")) apiState.lifecycle = 'PAYMENT_DUE';
  if (sql.includes("lifecycle_status='PAYMENT_FAILED'")) apiState.lifecycle = 'PAYMENT_FAILED';
  if (sql.includes("lifecycle_status=\n") || sql.includes("lifecycle_status='CONFIRMED'")) apiState.lifecycle = 'CONFIRMED';
  if (sql.includes('SET payment_status=?')) apiState.legacyStatus = 1;
  if (sql.includes('UPDATE app_payment_transactions')) {
    if (sql.includes("status='FAILED'")) apiState.paymentStatus = 'FAILED';
    else if (sql.includes("SET status='CREATED',provider_payload=?")) {apiState.paymentStatus='CREATED';apiState.paymentPayload=JSON.parse(params[0]);}
    else if (sql.includes('provider_reference=?') && (sql.includes('status=?')||sql.includes('status=IF'))) {
      apiState.paymentReference = params[0];apiState.paymentPayload = JSON.parse(params[1]);apiState.paymentStatus = params[2];
    } else if (sql.includes('SET status=?')) apiState.paymentStatus = params[0];
    else if (sql.includes('SET provider_payload=?')) apiState.paymentPayload = JSON.parse(params[0]);
  }
  return [{ affectedRows: 1 }];
};

mod('../src/config/env.js', { env: { PAYMENT_PROVIDER: 'mock', NODE_ENV: 'test', LEGACY_PAID_PAYMENT_STATUS: 1 } });
mod('../src/db/pool.js', { one: simulateOne, query: simulateQuery, transaction: (cb) => cb({ execute }) });
mod('../src/common/auth.js', {
  requireAuth: (req, _res, next) => { req.auth = { role: 5, userId: 10, customerId: 50 }; next(); },
  requireRoles: () => (_req, _res, next) => next(),
});
mod('../src/common/idempotency.js', { idempotent: () => (_req, _res, next) => next(), storeIdempotencyResponse: async () => {} });
mod('../src/services/access.js', {
  assertCustomerAccess: async () => true,
  getReservationForAccess: async () => ({ id: 101 }),
  getDraftForAccess: async () => ({ id: 22, quote_snapshot_id: 9, revision: 1, status: 'QUOTED', service_code: 'CHAUFFEUR' }),
});
mod('../src/services/booking-service.js', { draftFingerprint: () => 'hash', createLegacyReservation: async () => ({ reservationId: 101, reservationNo: 'DL03715' }), buildDraftQuote: async () => ({}) });
mod('../src/services/mobile-status-events.js', { recordBookingStatusEvent: async (_connection, payload) => { apiState.events.push(payload); } });
mod('../src/services/booking-view.js', { loadBookingView: async () => ({ id: 101 }) });
mod('../src/services/tracking.js', { loadTrackingView: async () => ({}) });
mod('../src/services/invoice-provider.js', { listReservationInvoices: async () => [] });
mod('../src/services/chauffeur-hours.js', { normalizeChauffeurDetails: (_s, d) => d });
mod('../src/services/stripe-network.js', { stripeServiceErrorCode: () => 'STRIPE_UNAVAILABLE' });
mod('../src/services/notifications.js', { notifyBookingAudience: async () => {} });
mod('../src/services/payment-holds.js', { releasePendingHold: async () => false });
mod('../src/services/payment-provider.js', {
  createPaymentIntent: async ({ paymentId }) => {
    apiState.requestedStripe.push(paymentId);
    if (apiState.failStripe) throw new Error('Stripe connection failed');
    return { providerReference: 'mock_77', status: 'REQUIRES_ACTION', clientSecret: 'mock_secret_77', raw: { id: 'mock_77',...(apiState.providerState?{status:apiState.providerState}:{}),...(apiState.providerAmount?{amount:apiState.providerAmount,currency:'chf'}:{}) } };
  },
  retrievePaymentIntent: async () => ({ providerReference: 'mock_77', status: 'REQUIRES_ACTION', clientSecret: 'mock_secret_77', raw: {} }),
  stripePaymentStatus: (s) => s === 'succeeded' ? 'PAID' : 'REQUIRES_ACTION',
  constructWebhookEvent: () => ({ id: apiState.webhookType === 'payment_intent.payment_failed' ? 'evt_failed' : 'evt_paid', type: apiState.webhookType, data: { object: { id: 'mock_77', object: 'payment_intent', status: apiState.webhookType === 'payment_intent.payment_failed' ? 'requires_payment_method' : 'succeeded' } } }),
});
const [{ default: express }, { default: supertest }, { default: bookingRouter }, { default: paymentRouter }, { errorHandler }] = await Promise.all([
  import('express'), import('supertest'), import('../src/modules/bookings.js'), import('../src/modules/payments.js'), import('../src/middleware/error-handler.js'),
]);
const app = express(); app.use(express.json()); app.use('/api/v1/bookings', bookingRouter);app.use('/api/v1/payments',paymentRouter);app.use(errorHandler);

// Sequential smoke checks share state intentionally to model a complete booking lifecycle.
test('Pay Later checkout stores a reservation without contacting Stripe', async () => {
  const r = await supertest(app).post('/api/v1/bookings/drafts/22/checkout').set('Idempotency-Key', 'one').send({ paymentOption: 'PAY_LATER' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.bookingId, 101);
  assert.equal(r.body.payment.id, 77);
  assert.equal(r.body.payment.status, 'DEFERRED');
  assert.equal(r.body.status, 'PAYMENT_DUE');
  assert.deepEqual(apiState.requestedStripe, []);
  assert.equal(apiState.lifecycle, 'PAYMENT_DUE');
});

test('Saved Pay Later reservation appears in bookings list with retry action', async () => {
  const r = await supertest(app).get('/api/v1/bookings');
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.items[0].id, 101);
  assert.equal(r.body.items[0].paymentOption, 'PAY_LATER');
  assert.equal(r.body.items[0].canRetryPayment, true);
});

test('Pay Later can initialize payment after quote expiry', async () => {
  const r = await supertest(app).post('/api/v1/payments/77/retry').send({});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.id, 77);
  assert.equal(r.body.status, 'REQUIRES_ACTION');
  assert.deepEqual(apiState.requestedStripe, [77]);
});


test('Signed payment failure keeps the saved booking and allows retry', async () => {
  apiState.webhookType = 'payment_intent.payment_failed';
  const r = await supertest(app).post('/api/v1/payments/webhook').send({});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(apiState.paymentStatus, 'FAILED');
  assert.equal(apiState.lifecycle, 'PAYMENT_FAILED');
  const list = await supertest(app).get('/api/v1/bookings');
  assert.equal(list.status, 200);
  assert.equal(list.body.items[0].status, 'PAYMENT_FAILED');
  assert.equal(list.body.items[0].canRetryPayment, true);
});

test('Signed success confirms the SAME unpaid booking and clears retry action', async () => {
  apiState.webhookType = 'payment_intent.succeeded';
  const r = await supertest(app).post('/api/v1/payments/webhook').send({});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(apiState.paymentStatus, 'PAID');
  assert.equal(apiState.lifecycle, 'CONFIRMED');
  assert.equal(apiState.legacyStatus, 1);
  assert.deepEqual(apiState.nativePayments,[50]);
  const list = await supertest(app).get('/api/v1/bookings');
  assert.equal(list.body.items[0].canRetryPayment, false);
});

test('Failed Pay Now checkout still creates a visible booking for retry', async () => {
  apiState.lifecycle = 'PAYMENT_PENDING';
  apiState.legacyStatus = 0;
  apiState.createdAt = new Date(Date.now()-2000).toISOString();
  apiState.failStripe = true;
  apiState.nativePayments = [];
  const r = await supertest(app).post('/api/v1/bookings/drafts/22/checkout')
    .set('Idempotency-Key', 'two').send({ paymentOption: 'PAY_NOW' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, 'PAYMENT_FAILED');
  assert.equal(r.body.payment.status, 'FAILED');
  assert.equal(apiState.lifecycle, 'PAYMENT_FAILED');
  const list = await supertest(app).get('/api/v1/bookings');
  assert.equal(list.body.items[0].canRetryPayment, true);
  apiState.failStripe = false;
  const retry = await supertest(app).post('/api/v1/payments/77/retry').send({});
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
});

test('Invalid payment selection is rejected before making any booking', async () => {
  const before = apiState.events.length;
  const r = await supertest(app).post('/api/v1/bookings/drafts/22/checkout')
    .set('Idempotency-Key', 'invalid').send({ paymentOption: 'PAY_GIFT' });
  assert.equal(r.status, 422, JSON.stringify(r.body));
  assert.equal(apiState.events.length, before);
});

test('A native fare edit blocks a stale payment before contacting the provider', async () => {
  apiState.nativeTotal=75;
  const calls=apiState.requestedStripe.length;
  const r=await supertest(app).post('/api/v1/payments/77/retry').send({});
  assert.equal(r.status,409,JSON.stringify(r.body));
  assert.equal(r.body.error.code,'PAYMENT_RECONCILIATION_REQUIRED');
  assert.equal(apiState.requestedStripe.length,calls);
});

test('A signed late success records received money and preserves native dispatch state', async () => {
  apiState.lifecycle='IN_SERVICE';apiState.legacyStatus=1;
  apiState.webhookType='payment_intent.succeeded';
  const r=await supertest(app).post('/api/v1/payments/webhook').send({});
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.equal(apiState.lifecycle,'IN_SERVICE');
  assert.deepEqual(apiState.nativePayments,[50]);
  assert.equal(apiState.paymentPayload.reconciliationRequired,true);
  assert.equal(apiState.events.at(-1).status,'PAYMENT_RECONCILIATION_REQUIRED');
});

test('an idempotently recovered completed provider intent never exposes a payment secret',async()=>{
 Object.assign(apiState,{lifecycle:'COMPLETED',legacyStatus:2,paymentStatus:'CREATED',createdAt:new Date().toISOString(),paymentReference:null,paymentPayload:{},nativeTotal:50,nativePayments:[],providerState:'succeeded'});
 const r=await supertest(app).post('/api/v1/payments/77/retry').send({});
 assert.equal(r.status,409,JSON.stringify(r.body));assert.equal(r.body.error.code,'STRIPE_INTENT_NOT_PAYABLE');assert.equal(apiState.paymentReference,'mock_77');assert.equal(r.body.clientSecret,undefined);
 apiState.providerState=null;
});
test('a recovered provider amount mismatch is retained for review without a payment secret',async()=>{
 Object.assign(apiState,{paymentStatus:'CREATED',paymentReference:null,paymentPayload:{},providerAmount:7500});
 const r=await supertest(app).post('/api/v1/payments/77/retry').send({});
 assert.equal(r.status,409,JSON.stringify(r.body));assert.equal(r.body.error.code,'PAYMENT_RECONCILIATION_REQUIRED');assert.equal(apiState.paymentReference,'mock_77');assert.equal(apiState.paymentPayload.reconciliationRequired,true);assert.equal(r.body.clientSecret,undefined);
 apiState.providerAmount=null;
});
