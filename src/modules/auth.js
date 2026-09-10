import { Router } from 'express';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import { v4 as uuid } from 'uuid';
import { randomBytes } from 'node:crypto';
import { asyncHandler, ok, validate } from '../common/http.js';
import { badRequest, conflict, notFound, unauthorized } from '../common/errors.js';
import { hashForLegacyLaravel, sha256, verifyPassword } from '../common/crypto.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, requireAuth } from '../common/auth.js';
import { LegacyRole, roleName } from '../common/legacy.js';
import { exec, one, transaction } from '../db/pool.js';
import { env } from '../config/env.js';

async function persistRefreshToken(userId, token, deviceId) {
  const expires = new Date(Date.now() + env.JWT_REFRESH_TTL_DAYS * 86400_000);
  await exec(
    'INSERT INTO mobile_refresh_tokens (user_id,token_hash,device_id,expires_at,created_at) VALUES (?,?,?,?,NOW())',
    [userId, sha256(token), deviceId ?? null, expires]
  );
}

async function issueTokens(user, deviceId) {
  const accessToken = signAccessToken(user.id, user.role);
  const refreshToken = signRefreshToken(user.id, user.role);
  await persistRefreshToken(user.id, refreshToken, deviceId);
  return {
    accessToken,
    refreshToken,
    accessTokenType: 'Bearer',
    expiresIn: env.JWT_ACCESS_TTL
  };
}

async function findUserByEmail(email) {
  return one(
    'SELECT id,user_name,full_name,email,password,status,role,deleted_at FROM users WHERE LOWER(email)=LOWER(?) AND deleted_at IS NULL ORDER BY id DESC LIMIT 1',
    [email]
  );
}

function makeUsername(email, prefix) {
  const emailBase = email.split('@')[0].replace(/[^a-zA-Z0-9_.-]/g, '');
  const base = emailBase || `${prefix}_${Date.now()}`;
  return `${base}_${Math.random().toString(36).slice(2, 8)}`;
}

async function createLegacyUser(conn, { fullName, email, password, role, prefix }) {
  const passwordHash = await hashForLegacyLaravel(password);
  const result = await exec(
    `INSERT INTO users (user_name,full_name,email,password,status,role,lang,created_at,updated_at)
     VALUES (?,?,?,?,?,?, 'en', NOW(),NOW())`,
    [makeUsername(email, prefix), fullName, email.toLowerCase(), passwordHash, env.LEGACY_NEW_USER_STATUS, role],
    conn
  );
  return result.insertId;
}

async function ensureCountryExists(countryId, conn) {
  const country = await one(
    'SELECT id FROM countries WHERE id=? AND status=1 AND deleted_at IS NULL LIMIT 1',
    [countryId],
    conn
  );
  if (!country) throw notFound('Country');
}

async function ensureAgencyExists(agencyId, conn) {
  const agency = await one(
    'SELECT id FROM agencies WHERE id=? AND status=1 AND deleted_at IS NULL LIMIT 1',
    [agencyId],
    conn
  );
  if (!agency) throw notFound('Agency');
}

async function assertEmailAvailable(email) {
  if (await findUserByEmail(email)) {
    throw conflict('EMAIL_ALREADY_EXISTS', 'An account with this email already exists');
  }
}

const sharedRegistrationFields = {
  fullName: z.string().min(2).max(191),
  email: z.string().email().max(191),
  phone: z.string().min(5).max(191),
  password: z.string().min(8).max(128),
  deviceId: z.string().max(191).optional()
};

const clientRegistrationSchema = z.object(sharedRegistrationFields);

const chauffeurRegistrationSchema = z.object({
  ...sharedRegistrationFields,
  countryId: z.coerce.number().int().positive().optional(),
  licenseNumber: z.string().max(191).optional(),
  licenseExpiryDate: z.string().date().optional(),
  cityId: z.coerce.number().int().positive().optional(),
  city: z.string().max(191).optional(),
  address: z.string().max(2000).optional()
});

const agentRegistrationSchema = z.object({
  ...sharedRegistrationFields,
  agencyId: z.coerce.number().int().positive(),
  address: z.string().max(191).optional(),
  agentType: z.coerce.number().int().refine((value) => value === 1 || value === 2, {
    message: 'agentType must be 1 (Agency Admin) or 2 (Agency Member)'
  }).optional()
});

async function registerClient(req, res) {
  const body = validate(clientRegistrationSchema, req.body);
  await assertEmailAvailable(body.email);

  const user = await transaction(async (conn) => {
    const userId = await createLegacyUser(conn, {
      fullName: body.fullName,
      email: body.email,
      password: body.password,
      role: LegacyRole.CUSTOMER,
      prefix: 'customer'
    });

    const customer = await exec(
      `INSERT INTO customers (uuid,full_name,email,phone_no,status,user_id,created_by,is_registered,created_at,updated_at)
       VALUES (?,?,?,?,1,?,?,1,NOW(),NOW())`,
      [uuid(), body.fullName, body.email.toLowerCase(), body.phone, userId, userId],
      conn
    );

    return {
      id: userId,
      role: LegacyRole.CUSTOMER,
      full_name: body.fullName,
      email: body.email.toLowerCase(),
      customerId: customer.insertId
    };
  });

  const tokens = await issueTokens(user, body.deviceId);
  return ok(
    res,
    {
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: 'CUSTOMER',
        roleId: LegacyRole.CUSTOMER,
        customerId: user.customerId
      },
      ...tokens
    },
    201
  );
}

async function registerChauffeur(req, res) {
  const body = validate(chauffeurRegistrationSchema, req.body);
  await assertEmailAvailable(body.email);

  const countryId = body.countryId ?? env.DEFAULT_COUNTRY_ID;

  const user = await transaction(async (conn) => {
    await ensureCountryExists(countryId, conn);

    const userId = await createLegacyUser(conn, {
      fullName: body.fullName,
      email: body.email,
      password: body.password,
      role: LegacyRole.DRIVER,
      prefix: 'driver'
    });

    const driver = await exec(
      `INSERT INTO drivers
       (full_name,driving_licence_no,driving_licence_expire_date,country_id,city_id,city,phone,address,user_id,created_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
      [
        body.fullName,
        body.licenseNumber ?? null,
        body.licenseExpiryDate ?? null,
        countryId,
        body.cityId ?? null,
        body.city ?? null,
        body.phone,
        body.address ?? null,
        userId,
        userId
      ],
      conn
    );

    return {
      id: userId,
      role: LegacyRole.DRIVER,
      full_name: body.fullName,
      email: body.email.toLowerCase(),
      driverId: driver.insertId
    };
  });

  const tokens = await issueTokens(user, body.deviceId);
  return ok(
    res,
    {
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: 'DRIVER',
        roleId: LegacyRole.DRIVER,
        driverId: user.driverId
      },
      ...tokens
    },
    201
  );
}

async function registerAgent(req, res) {
  const body = validate(agentRegistrationSchema, req.body);
  await assertEmailAvailable(body.email);

  const user = await transaction(async (conn) => {
    await ensureAgencyExists(body.agencyId, conn);

    const userId = await createLegacyUser(conn, {
      fullName: body.fullName,
      email: body.email,
      password: body.password,
      role: LegacyRole.AGENT,
      prefix: 'agent'
    });

    const agent = await exec(
      `INSERT INTO agents
       (agency_id,full_name,email,phone,address,agent_type,user_id,created_by,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,NOW(),NOW())`,
      [
        body.agencyId,
        body.fullName,
        body.email.toLowerCase(),
        body.phone,
        body.address ?? null,
        body.agentType ?? 2,
        userId,
        userId
      ],
      conn
    );

    return {
      id: userId,
      role: LegacyRole.AGENT,
      full_name: body.fullName,
      email: body.email.toLowerCase(),
      agentId: agent.insertId,
      agencyId: body.agencyId
    };
  });

  const tokens = await issueTokens(user, body.deviceId);
  return ok(
    res,
    {
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: 'AGENT',
        roleId: LegacyRole.AGENT,
        agentId: user.agentId,
        agencyId: user.agencyId
      },
      ...tokens
    },
    201
  );
}

export const authRouter = Router();

// App-specific self-registration. The route selects the role; clients cannot submit an arbitrary role.
authRouter.post('/client/register', asyncHandler(registerClient));
authRouter.post('/chauffeur/register', asyncHandler(registerChauffeur));
authRouter.post('/driver/register', asyncHandler(registerChauffeur));
authRouter.post('/agent/register', asyncHandler(registerAgent));

// Backward-compatible alias from the previous package. It remains CUSTOMER-only.
authRouter.post('/register', asyncHandler(registerClient));

authRouter.post(
  '/login',
  asyncHandler(async (req, res) => {
    const body = validate(
      z.object({
        email: z.string().email(),
        password: z.string().min(1),
        deviceId: z.string().max(191).optional()
      }),
      req.body
    );
    const user = await findUserByEmail(body.email);
    if (!user || !(await verifyPassword(body.password, user.password))) {
      throw unauthorized('Invalid email or password');
    }
    if (env.ENFORCE_LEGACY_USER_STATUS && user.status !== 0) {
      throw unauthorized('Account is not active');
    }
    const tokens = await issueTokens(user, body.deviceId);
    return ok(res, {
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: roleName(user.role),
        roleId: user.role
      },
      ...tokens
    });
  })
);

authRouter.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const body = validate(
      z.object({
        refreshToken: z.string().min(20),
        deviceId: z.string().max(191).optional()
      }),
      req.body
    );
    const payload = verifyRefreshToken(body.refreshToken);
    const hash = sha256(body.refreshToken);
    const stored = await one(
      'SELECT id,user_id FROM mobile_refresh_tokens WHERE token_hash=? AND revoked_at IS NULL AND expires_at>NOW() LIMIT 1',
      [hash]
    );
    if (!stored || stored.user_id !== Number(payload.sub)) {
      throw unauthorized('Refresh token is revoked or expired');
    }
    const user = await one(
      'SELECT id,user_name,full_name,email,password,status,role,deleted_at FROM users WHERE id=? AND deleted_at IS NULL',
      [stored.user_id]
    );
    if (!user) throw unauthorized();
    await exec('UPDATE mobile_refresh_tokens SET revoked_at=NOW() WHERE id=?', [stored.id]);
    const tokens = await issueTokens(user, body.deviceId);
    return ok(res, tokens);
  })
);

authRouter.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const body = validate(
      z.object({ refreshToken: z.string().optional(), deviceId: z.string().optional() }),
      req.body ?? {}
    );
    if (body.refreshToken) {
      await exec(
        'UPDATE mobile_refresh_tokens SET revoked_at=NOW() WHERE token_hash=? AND revoked_at IS NULL',
        [sha256(body.refreshToken)]
      );
    }
    if (body.deviceId) {
      await exec('DELETE FROM user_devices WHERE device_id=?', [body.deviceId]);
    }
    return ok(res, { loggedOut: true });
  })
);

authRouter.post(
  '/password/forgot',
  asyncHandler(async (req, res) => {
    const body = validate(z.object({ email: z.string().email() }), req.body);
    const user = await findUserByEmail(body.email);
    let resetToken;
    if (user) {
      resetToken = randomBytes(32).toString('hex');
      await exec('DELETE FROM mobile_password_reset_tokens WHERE user_id=? AND used_at IS NULL', [user.id]);
      await exec(
        'INSERT INTO mobile_password_reset_tokens (user_id,token_hash,expires_at,created_at) VALUES (?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE),NOW())',
        [user.id, sha256(resetToken)]
      );
    }
    return ok(res, {
      accepted: true,
      ...(env.NODE_ENV !== 'production' && resetToken ? { resetToken } : {}),
      deliveryNote:
        env.NODE_ENV === 'production'
          ? 'Connect the client-selected email/SMS recovery provider before production.'
          : 'Development mode returns the token so the API flow can be tested.'
    });
  })
);

authRouter.post(
  '/password/reset',
  asyncHandler(async (req, res) => {
    const body = validate(
      z.object({ token: z.string().min(20), newPassword: z.string().min(8).max(128) }),
      req.body
    );
    const token = await one(
      'SELECT id,user_id FROM mobile_password_reset_tokens WHERE token_hash=? AND used_at IS NULL AND expires_at>NOW() LIMIT 1',
      [sha256(body.token)]
    );
    if (!token) {
      throw badRequest('RESET_TOKEN_INVALID', 'Password reset token is invalid or expired');
    }
    const hash = await hashForLegacyLaravel(body.newPassword);
    await transaction(async (conn) => {
      await exec('UPDATE users SET password=?,updated_at=NOW() WHERE id=?', [hash, token.user_id], conn);
      await exec('UPDATE mobile_password_reset_tokens SET used_at=NOW() WHERE id=?', [token.id], conn);
      await exec(
        'UPDATE mobile_refresh_tokens SET revoked_at=COALESCE(revoked_at,NOW()) WHERE user_id=? AND revoked_at IS NULL',
        [token.user_id],
        conn
      );
    });
    return ok(res, { reset: true });
  })
);

authRouter.post(
  '/google',
  asyncHandler(async (req, res) => {
    if (!env.GOOGLE_CLIENT_ID) {
      throw badRequest('GOOGLE_LOGIN_NOT_CONFIGURED', 'GOOGLE_CLIENT_ID is not configured');
    }
    const body = validate(
      z.object({ idToken: z.string().min(10), phone: z.string().optional(), deviceId: z.string().optional() }),
      req.body
    );
    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: body.idToken,
      audience: env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();
    if (!payload?.email) throw unauthorized('Google account did not provide an email');

    let user = await findUserByEmail(payload.email);
    if (!user) {
      if (!body.phone) {
        throw badRequest('PHONE_REQUIRED', 'Phone is required the first time a Google customer registers');
      }
      const randomPassword = await hashForLegacyLaravel(uuid());
      const created = await transaction(async (conn) => {
        const result = await exec(
          "INSERT INTO users (user_name,full_name,email,password,status,role,lang,created_at,updated_at) VALUES (?,?,?,?,?,?,'en',NOW(),NOW())",
          [
            makeUsername(payload.email, 'customer'),
            payload.name ?? payload.email,
            payload.email.toLowerCase(),
            randomPassword,
            env.LEGACY_NEW_USER_STATUS,
            LegacyRole.CUSTOMER
          ],
          conn
        );
        await exec(
          'INSERT INTO customers (uuid,full_name,email,phone_no,status,user_id,created_by,is_registered,created_at,updated_at) VALUES (?,?,?,?,1,?,?,1,NOW(),NOW())',
          [
            uuid(),
            payload.name ?? payload.email,
            payload.email.toLowerCase(),
            body.phone,
            result.insertId,
            result.insertId
          ],
          conn
        );
        return result.insertId;
      });
      user = await one(
        'SELECT id,user_name,full_name,email,password,status,role,deleted_at FROM users WHERE id=?',
        [created]
      );
    }
    if (!user) throw unauthorized();
    return ok(res, {
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: roleName(user.role),
        roleId: user.role
      },
      ...(await issueTokens(user, body.deviceId))
    });
  })
);

authRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await one(
      'SELECT id,user_name,full_name,email,photo,status,role,lang,created_at FROM users WHERE id=? AND deleted_at IS NULL',
      [req.auth.userId]
    );
    return ok(res, { ...user, roleName: roleName(user?.role), auth: req.auth });
  })
);
