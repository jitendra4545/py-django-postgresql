import { beforeAll, describe, expect, it } from 'vitest';

let buildPasswordResetMessage;
let normalizeGooglePayload;
let buildProfileUpdate;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-characters';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-characters';
  ({ buildPasswordResetMessage } = await import('../src/services/email.js'));
  ({ normalizeGooglePayload } = await import('../src/services/google-auth.js'));
  ({ buildProfileUpdate } = await import('../src/services/profile-updates.js'));
});

describe('Google authentication', () => {
  it('accepts only a verified Google identity and normalizes its fields', () => {
    expect(
      normalizeGooglePayload({
        sub: 'google-subject-1',
        email: 'Person@Example.com',
        email_verified: true,
        name: 'Test Person',
      }),
    ).toMatchObject({
      subject: 'google-subject-1',
      email: 'person@example.com',
      fullName: 'Test Person',
    });
  });

  it('rejects an unverified Google email', () => {
    expect(() =>
      normalizeGooglePayload({
        sub: 'google-subject-2',
        email: 'person@example.com',
        email_verified: false,
      }),
    ).toThrow('verified account identity');
  });
});

describe('SMTP password reset content', () => {
  it('places the reset token in the configured reset link without exposing it elsewhere', () => {
    const message = buildPasswordResetMessage({ fullName: 'A & B', token: 'reset-token-123' });
    expect(message.subject).toContain('Reset');
    expect(message.text).toContain('reset-token-123');
    expect(message.html).toContain('reset-token-123');
    expect(message.html).toContain('A &amp; B');
  });
});

describe('role profile updates', () => {
  it('updates only explicitly supplied fields while preserving explicit null values', () => {
    expect(
      buildProfileUpdate(
        { fullName: 'Updated Name', address: null },
        { fullName: 'full_name', phone: 'phone', address: 'address' },
      ),
    ).toEqual({
      assignments: 'full_name=?,address=?',
      values: ['Updated Name', null],
    });
  });
});
