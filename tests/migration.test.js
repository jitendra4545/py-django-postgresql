import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync('migrations/001_release_1_mobile_foundation.sql', 'utf8');

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
});
