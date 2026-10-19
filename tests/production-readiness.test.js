import { beforeAll, describe, expect, it } from 'vitest';

let buildStorageKey;
let canAttachDocument;
let canCallRecipientRole;
let createMaskedCallBridge;
let isLocationStale;
let listReservationInvoices;
let locationIntervalDecision;
let normalizeInvoice;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-characters';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-characters';
  process.env.UPLOAD_DRIVER = 'local';
  process.env.MASKED_CALL_PROVIDER = 'disabled';
  process.env.INVOICE_ADAPTER = 'disabled';
  ({ buildStorageKey } = await import('../src/services/storage.js'));
  ({ canAttachDocument } = await import('../src/services/chat-policy.js'));
  ({ createMaskedCallBridge, canCallRecipientRole } =
    await import('../src/services/masked-call-provider.js'));
  ({ isLocationStale, locationIntervalDecision } = await import('../src/services/tracking.js'));
  ({ listReservationInvoices, normalizeInvoice } =
    await import('../src/services/invoice-provider.js'));
});

describe('DigitalOcean storage boundaries', () => {
  it('normalizes object roots and retains only a safe extension', () => {
    const key = buildStorageKey(
      '../private//chat',
      'receipt.PDF',
      new Date('2026-10-17T00:00:00Z'),
    );
    expect(key).toMatch(/^private\/chat\/2026-10-17\/[0-9a-f-]+\.pdf$/);
    expect(key).not.toContain('..');
  });
});

describe('chat attachment policy', () => {
  const auth = { role: 5, userId: 50 };

  it('allows an owned, unexpired document for the same booking', () => {
    expect(
      canAttachDocument({
        auth,
        document: { owner_user_id: 50, reservation_id: 12, expires_at: '2026-10-18' },
        reservationId: 12,
        now: new Date('2026-10-17T00:00:00Z'),
      }),
    ).toBe(true);
  });

  it('rejects another user document and cross-booking attachment', () => {
    expect(
      canAttachDocument({
        auth,
        document: { owner_user_id: 51, reservation_id: 12 },
        reservationId: 12,
      }),
    ).toBe(false);
    expect(
      canAttachDocument({
        auth,
        document: { owner_user_id: 50, reservation_id: 13 },
        reservationId: 12,
      }),
    ).toBe(false);
  });
});

describe('GPS quality controls', () => {
  it('throttles samples inside the configured interval and rejects old samples', () => {
    expect(locationIntervalDecision('2026-10-17T12:00:00Z', '2026-10-17T12:00:02Z', 5)).toEqual({
      accepted: false,
      reason: 'THROTTLED',
      retryAfterSeconds: 3,
    });
    expect(
      locationIntervalDecision('2026-10-17T12:00:00Z', '2026-10-17T11:59:59Z', 5),
    ).toMatchObject({ accepted: false, reason: 'NOT_NEWER' });
  });

  it('marks missing and old locations stale', () => {
    const now = new Date('2026-10-17T12:01:00Z');
    expect(isLocationStale(null, now, 45)).toBe(true);
    expect(isLocationStale('2026-10-17T12:00:30Z', now, 45)).toBe(false);
    expect(isLocationStale('2026-10-17T11:59:00Z', now, 45)).toBe(true);
  });
});

describe('production-safe provider preparation', () => {
  it('prevents callers from requesting a bridge to their own role', () => {
    expect(canCallRecipientRole(5, 'CLIENT')).toBe(false);
    expect(canCallRecipientRole(5, 'CHAUFFEUR')).toBe(true);
    expect(canCallRecipientRole(3, 'CHAUFFEUR')).toBe(false);
    expect(canCallRecipientRole(4, 'CLIENT')).toBe(true);
  });

  it('returns an explicit error while masked calling is disabled', async () => {
    await expect(createMaskedCallBridge({})).rejects.toMatchObject({
      status: 503,
      code: 'MASKED_CALL_NOT_CONFIGURED',
    });
  });

  it('returns an explicit error while the invoice adapter is disabled', async () => {
    await expect(listReservationInvoices(12)).rejects.toMatchObject({
      status: 503,
      code: 'INVOICE_ADAPTER_NOT_CONFIGURED',
    });
  });

  it('normalizes known legacy invoice field variants without exposing the raw row', () => {
    expect(
      normalizeInvoice({
        id: 4,
        invoice_no: 'INV-4',
        grand_total: 125,
        currency_code: 'EUR',
        secret_internal_note: 'hidden',
      }),
    ).toEqual({
      id: 4,
      invoiceNumber: 'INV-4',
      status: null,
      currency: 'EUR',
      subtotalAmount: null,
      taxAmount: null,
      totalAmount: 125,
      issuedAt: null,
      dueAt: null,
      documentId: null,
    });
  });
});
