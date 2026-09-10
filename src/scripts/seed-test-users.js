import { env } from '../config/env.js';
import { hashForLegacyLaravel } from '../common/crypto.js';
import { LegacyRole } from '../common/legacy.js';
import { db, exec, one } from '../db/pool.js';
import { logger } from '../common/logger.js';
async function ensureUser(email, password, fullName, role) {
    const existing = await one('SELECT id FROM users WHERE LOWER(email)=LOWER(?) AND deleted_at IS NULL LIMIT 1', [email]);
    if (existing)
        return existing.id;
    const hash = await hashForLegacyLaravel(password);
    const r = await exec('INSERT INTO users (user_name,full_name,email,password,status,role,lang,created_at,updated_at) VALUES (?,?,?,?,?,?,\'en\',NOW(),NOW())', [`${fullName.toLowerCase().replace(/\W+/g, '_')}_${Date.now()}`, fullName, email, hash, env.LEGACY_NEW_USER_STATUS, role]);
    return r.insertId;
}
async function run() {
    const adminUser = await ensureUser(env.TEST_ADMIN_EMAIL, env.TEST_ADMIN_PASSWORD, 'Mobile Test Admin', LegacyRole.ADMIN);
    const driverUser = await ensureUser(env.TEST_DRIVER_EMAIL, env.TEST_DRIVER_PASSWORD, 'Mobile Test Chauffeur', LegacyRole.DRIVER);
    const agentUser = await ensureUser(env.TEST_AGENT_EMAIL, env.TEST_AGENT_PASSWORD, 'Mobile Test Rental Agent', LegacyRole.AGENT);
    let driver = await one('SELECT id FROM drivers WHERE user_id=? AND deleted_at IS NULL LIMIT 1', [driverUser]);
    if (!driver) {
        const r = await exec('INSERT INTO drivers (full_name,country_id,user_id,created_by,created_at,updated_at) VALUES (?,?,?,?,NOW(),NOW())', ['Mobile Test Chauffeur', env.DEFAULT_COUNTRY_ID, driverUser, adminUser]);
        driver = { id: r.insertId };
    }
    let agency = await one('SELECT id FROM agencies WHERE deleted_at IS NULL AND status=1 ORDER BY id LIMIT 1');
    if (!agency) {
        const r = await exec('INSERT INTO agencies (name,user_id,country_id,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,NOW(),NOW())', [`Mobile Test Agency ${Date.now()}`, adminUser, env.DEFAULT_COUNTRY_ID, 1, adminUser]);
        agency = { id: r.insertId };
    }
    let agent = await one('SELECT id FROM agents WHERE user_id=? AND deleted_at IS NULL LIMIT 1', [agentUser]);
    if (!agent) {
        const r = await exec('INSERT INTO agents (agency_id,full_name,email,agent_type,user_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,NOW(),NOW())', [agency.id, 'Mobile Test Rental Agent', env.TEST_AGENT_EMAIL, 2, agentUser, adminUser]);
        agent = { id: r.insertId };
    }
    logger.info({
        admin: { email: env.TEST_ADMIN_EMAIL, password: env.TEST_ADMIN_PASSWORD, userId: adminUser },
        driver: { email: env.TEST_DRIVER_EMAIL, password: env.TEST_DRIVER_PASSWORD, userId: driverUser, driverId: driver.id },
        agent: { email: env.TEST_AGENT_EMAIL, password: env.TEST_AGENT_PASSWORD, userId: agentUser, agentId: agent.id }
    }, 'Local test users ready');
    await db.end();
}
run().catch(async (error) => {
    logger.fatal({ error }, 'Seeding failed');
    await db.end();
    process.exit(1);
});
