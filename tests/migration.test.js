import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync('migrations/001_release_1_mobile_foundation.sql', 'utf8');
const oauthMigration = fs.readFileSync('migrations/002_google_oauth_accounts.sql', 'utf8');
const productionMigration = fs.readFileSync(
  'migrations/003_digitalocean_storage_and_realtime.sql',
  'utf8',
);

describe('Release 1 migration safety', () => {
  it('is additive and does not alter or drop a legacy table', () => {
    expect(migration).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
  });

  it('creates only app-prefixed tables', () => {
    const tables = [...migration.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/gi)].map(
      (match) => match[1],
    );
    expect(tables).toHaveLength(29);
    expect(tables.every((table) => table.startsWith('app_'))).toBe(true);
    expect(tables).not.toContain('app_audit_logs');
  });

  it('reuses the existing activity_logs table instead of duplicating audit storage', () => {
    expect(migration).not.toMatch(/CREATE TABLE IF NOT EXISTS\s+app_audit_logs/i);
  });

  it('uses fixed precision and ISO currency in the new payment ledger', () => {
    expect(migration).toMatch(/app_payment_transactions[\s\S]*amount DECIMAL\(12,2\)/);
    expect(migration).toMatch(/currency CHAR\(3\)/);
  });

  it('adds Google identity links without altering the shared users table', () => {
    expect(oauthMigration).toMatch(/CREATE TABLE IF NOT EXISTS\s+app_user_oauth_accounts/i);
    expect(oauthMigration).toMatch(/UNIQUE KEY uq_app_oauth_provider_subject/);
    expect(oauthMigration).toMatch(/FOREIGN KEY \(user_id\) REFERENCES users\(id\)/);
    expect(oauthMigration).not.toMatch(/\bALTER\s+TABLE\b/i);
    expect(oauthMigration).not.toMatch(/\bDROP\s+TABLE\b/i);
  });

  it('migrates private documents to DigitalOcean Spaces naming and adds invitation delivery state', () => {
    expect(productionMigration).toMatch(/storage_disk ENUM\('local','spaces'\)/);
    expect(productionMigration).toMatch(/visibility ENUM\('PRIVATE','PUBLIC'\)/);
    expect(productionMigration).toMatch(/last_sent_at TIMESTAMP/);
    expect(productionMigration).toMatch(/send_count INT UNSIGNED/);
    expect(productionMigration).not.toMatch(/AWS_/);
  });
});
