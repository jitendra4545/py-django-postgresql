import { pool } from '../src/db/pool.js';
import { ROLES } from '../src/config/constants.js';
import { hashPassword } from '../src/services/passwords.js';

const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD;
const fullName = process.env.SEED_ADMIN_NAME?.trim() || 'Test Administrator';

if (!email) {
  throw new Error('SEED_ADMIN_EMAIL is required');
}

if (!password || password.length < 10) {
  throw new Error('SEED_ADMIN_PASSWORD must contain at least 10 characters');
}

try {
  const passwordHash = await hashPassword(password);

  const [existingUsers] = await pool.execute(
    `SELECT id, role
       FROM users
      WHERE email = ?
      LIMIT 1`,
    [email],
  );

  let userId;

  if (existingUsers[0]) {
    userId = existingUsers[0].id;

    await pool.execute(
      `UPDATE users
          SET user_name = ?,
              full_name = ?,
              password = ?,
              status = 0,
              role = ?,
              lang = 'en',
              deleted_at = NULL,
              updated_at = NOW()
        WHERE id = ?`,
      [email, fullName, passwordHash, ROLES.ADMIN, userId],
    );

    console.log(`Existing user updated as administrator: ${email}`);
  } else {
    const [result] = await pool.execute(
      `INSERT INTO users
        (
          user_name,
          full_name,
          email,
          password,
          status,
          role,
          lang,
          created_at,
          updated_at
        )
       VALUES (?, ?, ?, ?, 0, ?, 'en', NOW(), NOW())`,
      [email, fullName, email, passwordHash, ROLES.ADMIN],
    );

    userId = result.insertId;
    console.log(`Administrator created: ${email}`);
  }

  console.log(`Admin user ID: ${userId}`);
  console.log('Admin role: 1');
  console.log('Admin status: 0 (active)');
} catch (error) {
  console.error('Could not create administrator:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
