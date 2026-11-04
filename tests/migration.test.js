import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync('migrations/001_release_1_mobile_foundation.sql', 'utf8');
const legacyAdditions = fs.readFileSync('migrations/000_additive_legacy_mobile_columns.sql', 'utf8');
// SQL comments are not executable DDL; a comment saying 'changes' must not
// trigger the CHANGE COLUMN safety assertion. Preserve migration checksums.
const legacyAdditionsSql = legacyAdditions.replace(/^\s*--[^\r\n]*(?:\r?\n|$)/gm, '');
const oauthMigration = fs.readFileSync('migrations/002_google_oauth_accounts.sql', 'utf8');
const productionMigration = fs.readFileSync(
  'migrations/003_digitalocean_storage_and_realtime.sql',
  'utf8',
);

describe('Release 1 migration safety', () => {
  it('preserves existing production columns and keys with additive-only SQL', () => {
    expect(migration).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(legacyAdditionsSql).not.toMatch(/\bDROP\s+(COLUMN|INDEX|KEY|PRIMARY|TABLE)\b/i);
    expect(legacyAdditionsSql).not.toMatch(/\bMODIFY\s+(COLUMN\s+)?/i);
    expect(legacyAdditionsSql).not.toMatch(/\bCHANGE\s+(COLUMN\s+)?/i);
    expect(legacyAdditions).toMatch(/ALTER TABLE reservations/);
    expect(legacyAdditions).toMatch(/ALTER TABLE reservation_drivers/);
    expect(legacyAdditions).toMatch(/ALTER TABLE reservation_messages/);
    expect(legacyAdditions).toMatch(/ALTER TABLE notifications/);
  });

  it('creates only app-prefixed tables', () => {
    const tables = [...migration.matchAll(/CREATE TABLE IF NOT EXISTS\s+([a-z0-9_]+)/gi)].map(
      (match) => match[1],
    );
    expect(tables).toHaveLength(23);
    expect(tables.every((table) => table.startsWith('app_'))).toBe(true);
    expect(tables).not.toContain('app_audit_logs');
    for (const shared of ['app_reservation_meta','app_reservation_leg_meta',
      'app_driver_assignments','app_messages','app_notifications','app_service_catalog']) {
      expect(tables).not.toContain(shared);
      expect(migration).toMatch(new RegExp(`CREATE .*VIEW ${shared}`));
    }
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
