import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

let app;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-that-is-at-least-32-characters';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-that-is-at-least-32-characters';
  ({ default: app } = await import('../src/app.js'));
});

describe('browser password reset page', () => {
  it('serves the reset form without caching token-bearing URLs', async () => {
    const response = await request(app).get('/reset-password?token=private-token');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['content-security-policy']).toContain("script-src 'self'");
    expect(response.text).toContain('Create a new password');
    expect(response.text).not.toContain('private-token');
  });

  it('serves same-origin reset-page assets under Helmet CSP', async () => {
    const response = await request(app).get('/reset-assets/reset-password.js');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('javascript');
    expect(response.text).toContain("fetch('/api/v1/auth/password/reset'");
  });

  it('trusts exactly one proxy hop for Render client-IP handling', () => {
    expect(app.get('trust proxy')).toBe(1);
  });
});
