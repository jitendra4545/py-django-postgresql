import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuid } from 'uuid';
import { asyncHandler } from '../common/async-handler.js';
import { requireAuth } from '../common/auth.js';
import { AppError, conflict, notFound } from '../common/errors.js';
import { validate } from '../common/validate.js';
import { env } from '../config/env.js';
import { ROLES, ROLE_NAMES } from '../config/constants.js';
import { one, query, transaction } from '../db/pool.js';
import { emailDeliveryEnabled, sendPasswordResetEmail } from '../services/email.js';
import { verifyGoogleIdToken } from '../services/google-auth.js';
import { hashPassword, verifyPassword } from '../services/passwords.js';
import {
  randomToken,
  signAccessToken,
  signRefreshToken,
  tokenHash,
  verifyRefreshToken,
} from '../services/tokens.js';

const router = Router();
const email = z
  .string()
  .email()
  .transform((value) => value.toLowerCase());

const registerSchema = z.object({
  fullName: z.string().min(2).max(191),
  email,
  password: z.string().min(10).max(128),
  phone: z.string().min(6).max(30),
  language: z.string().min(2).max(10).default('en'),
  countryId: z.number().int().positive().optional(),
  city: z.string().max(191).optional(),
});

const deviceSchema = z.object({
  deviceId: z.string().min(4).max(191),
  platform: z.enum(['IOS', 'ANDROID', 'WEB']),
  pushToken: z.string().max(512).optional(),
  appVersion: z.string().max(32).optional(),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1),
  device: deviceSchema.optional(),
});

const googleLoginSchema = z.object({
  idToken: z.string().min(20),
  phone: z.string().min(6).max(30).optional(),
  language: z.string().min(2).max(10).default('en'),
  countryId: z.number().int().positive().optional(),
  city: z.string().max(191).optional(),
  device: deviceSchema.optional(),
});

const publicUser = (user) => ({
  id: user.id,
  fullName: user.full_name,
  email: user.email,
  role: Number(user.role),
  roleName: ROLE_NAMES[user.role],
  language: user.lang,
});

const assertAppProfileAvailable = async (user) => {
  let profile;
  if (Number(user.role) === ROLES.CLIENT) {
    profile = await one('SELECT id FROM customers WHERE user_id=? AND deleted_at IS NULL', [
      user.id,
    ]);
  } else if (Number(user.role) === ROLES.AGENCY_AGENT) {
    profile = await one(
      `SELECT a.id FROM agents a
        JOIN agencies agency ON agency.id=a.agency_id
         AND agency.status=1 AND agency.deleted_at IS NULL
       WHERE a.user_id=? AND a.deleted_at IS NULL`,
      [user.id],
    );
  } else if (Number(user.role) === ROLES.CHAUFFEUR) {
    profile = await one('SELECT id FROM drivers WHERE user_id=? AND deleted_at IS NULL', [user.id]);
  }
  if (!profile) {
    throw new AppError(403, 'ROLE_PROFILE_INACTIVE', 'The account profile is inactive');
  }
};

const issueSession = async (user, device = null) => {
  const sessionId = uuid();
  const refreshToken = signRefreshToken(sessionId, user.id);
  await query(
    `INSERT INTO app_refresh_tokens
      (id, user_id, token_hash, device_id, expires_at, created_at)
     VALUES (?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), NOW())`,
    [
      sessionId,
      user.id,
      tokenHash(refreshToken),
      device?.deviceId ?? null,
      env.JWT_REFRESH_TTL_DAYS,
    ],
  );
  if (device) {
    await query(
      `INSERT INTO app_user_devices
        (user_id, device_id, platform, push_token, app_version, last_seen_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW(), NOW())
       ON DUPLICATE KEY UPDATE user_id=VALUES(user_id), platform=VALUES(platform),
         push_token=VALUES(push_token), app_version=VALUES(app_version), last_seen_at=NOW(), updated_at=NOW()`,
      [
        user.id,
        device.deviceId,
        device.platform,
        device.pushToken ?? null,
        device.appVersion ?? null,
      ],
    );
  }
  return { accessToken: signAccessToken(user), refreshToken, expiresIn: env.JWT_ACCESS_TTL };
};

router.post(
  '/client/register',
  validate(registerSchema),
  asyncHandler(async (request, response) => {
    const body = request.body;
    const exists = await one('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL', [
      body.email,
    ]);
    if (exists) throw conflict('An account already exists for this email');

    const user = await transaction(async (connection) => {
      const password = await hashPassword(body.password);
      const [userResult] = await connection.execute(
        `INSERT INTO users
          (user_name, full_name, email, password, status, role, lang, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, NOW(), NOW())`,
        [body.email, body.fullName, body.email, password, ROLES.CLIENT, body.language],
      );
      await connection.execute(
        `INSERT INTO customers
          (uuid, full_name, email, phone_no, country_id, city, status, user_id, created_by, is_registered, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 1, NOW(), NOW())`,
        [
          uuid(),
          body.fullName,
          body.email,
          body.phone,
          body.countryId ?? null,
          body.city ?? null,
          userResult.insertId,
          userResult.insertId,
        ],
      );
      return { id: userResult.insertId, email: body.email, role: ROLES.CLIENT };
    });
    response.status(201).json({
      user: { ...user, roleName: ROLE_NAMES[user.role] },
      tokens: await issueSession(user),
    });
  }),
);

router.post(
  '/login',
  validate(loginSchema),
  asyncHandler(async (request, response) => {
    const user = await one(
      `SELECT id, full_name, email, password, role, lang
         FROM users WHERE email = ? AND status = 0 AND deleted_at IS NULL`,
      [request.body.email],
    );
    if (!user || !(await verifyPassword(request.body.password, user.password))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect');
    }
    response.json({
      user: publicUser(user),
      tokens: await issueSession(user, request.body.device),
    });
  }),
);

router.post(
  '/google',
  validate(googleLoginSchema),
  asyncHandler(async (request, response) => {
    const google = await verifyGoogleIdToken(request.body.idToken);
    let user = await one(
      `SELECT u.id,u.full_name,u.email,u.role,u.lang,u.status,u.deleted_at
         FROM app_user_oauth_accounts oauth
         JOIN users u ON u.id=oauth.user_id
        WHERE oauth.provider='GOOGLE' AND oauth.provider_subject=?`,
      [google.subject],
    );

    if (user && (Number(user.status) !== 0 || user.deleted_at)) {
      throw new AppError(403, 'ACCOUNT_INACTIVE', 'The linked account is inactive');
    }

    let created = false;
    if (!user) {
      user = await one(
        `SELECT id,full_name,email,role,lang,status,deleted_at
           FROM users WHERE email=? ORDER BY id DESC LIMIT 1`,
        [google.email],
      );
      if (user && (Number(user.status) !== 0 || user.deleted_at)) {
        throw new AppError(403, 'ACCOUNT_INACTIVE', 'The account is inactive');
      }

      if (user) {
        if (![ROLES.CLIENT, ROLES.AGENCY_AGENT, ROLES.CHAUFFEUR].includes(Number(user.role))) {
          throw new AppError(
            403,
            'ROLE_NOT_SUPPORTED',
            'Google login is not enabled for this role',
          );
        }
        const existingLink = await one(
          `SELECT provider_subject FROM app_user_oauth_accounts
            WHERE user_id=? AND provider='GOOGLE'`,
          [user.id],
        );
        if (existingLink && existingLink.provider_subject !== google.subject) {
          throw conflict('This account is already linked to a different Google identity');
        }
        if (!existingLink) {
          await query(
            `INSERT INTO app_user_oauth_accounts
              (user_id,provider,provider_subject,provider_email,created_at,updated_at)
             VALUES (?,'GOOGLE',?,?,NOW(),NOW())`,
            [user.id, google.subject, google.email],
          );
        }
        if (google.photo && google.photo.length <= 191) {
          await query('UPDATE users SET photo=COALESCE(photo,?),updated_at=NOW() WHERE id=?', [
            google.photo,
            user.id,
          ]);
        }
      } else {
        if (!request.body.phone) {
          throw new AppError(
            422,
            'GOOGLE_REGISTRATION_REQUIRED',
            'A phone number is required to create a new client account',
            { requiredFields: ['phone'] },
          );
        }
        user = await transaction(async (connection) => {
          const password = await hashPassword(randomToken());
          const photo = google.photo && google.photo.length <= 191 ? google.photo : null;
          const [userResult] = await connection.execute(
            `INSERT INTO users
              (user_name,full_name,photo,email,password,status,role,lang,created_at,updated_at)
             VALUES (?,?,?,?,?,0,?,?,NOW(),NOW())`,
            [
              google.email,
              google.fullName,
              photo,
              google.email,
              password,
              ROLES.CLIENT,
              request.body.language,
            ],
          );
          await connection.execute(
            `INSERT INTO customers
              (uuid,full_name,photo,email,phone_no,country_id,city,status,user_id,created_by,is_registered,created_at,updated_at)
             VALUES (?,?,?,?,?,?,?,1,?,?,1,NOW(),NOW())`,
            [
              uuid(),
              google.fullName,
              photo,
              google.email,
              request.body.phone,
              request.body.countryId ?? null,
              request.body.city ?? null,
              userResult.insertId,
              userResult.insertId,
            ],
          );
          await connection.execute(
            `INSERT INTO app_user_oauth_accounts
              (user_id,provider,provider_subject,provider_email,created_at,updated_at)
             VALUES (?,'GOOGLE',?,?,NOW(),NOW())`,
            [userResult.insertId, google.subject, google.email],
          );
          return {
            id: userResult.insertId,
            full_name: google.fullName,
            email: google.email,
            role: ROLES.CLIENT,
            lang: request.body.language,
          };
        });
        created = true;
      }
    }

    await assertAppProfileAvailable(user);
    response.status(created ? 201 : 200).json({
      user: publicUser(user),
      tokens: await issueSession(user, request.body.device),
      isNewAccount: created,
    });
  }),
);

router.post(
  '/refresh',
  validate(z.object({ refreshToken: z.string().min(20) })),
  asyncHandler(async (request, response) => {
    let payload;
    try {
      payload = verifyRefreshToken(request.body.refreshToken);
    } catch {
      throw new AppError(401, 'REFRESH_TOKEN_INVALID', 'Refresh token is invalid or expired');
    }
    const stored = await one(
      `SELECT id, user_id FROM app_refresh_tokens
        WHERE id = ? AND user_id = ? AND token_hash = ? AND revoked_at IS NULL AND expires_at > NOW()`,
      [payload.sid, payload.sub, tokenHash(request.body.refreshToken)],
    );
    if (!stored)
      throw new AppError(401, 'REFRESH_TOKEN_INVALID', 'Refresh token is invalid or expired');
    const user = await one(
      'SELECT id, role FROM users WHERE id = ? AND status = 0 AND deleted_at IS NULL',
      [payload.sub],
    );
    if (!user) throw new AppError(401, 'ACCOUNT_INACTIVE', 'The account is inactive');
    await query('UPDATE app_refresh_tokens SET revoked_at = NOW() WHERE id = ?', [stored.id]);
    response.json({ tokens: await issueSession(user) });
  }),
);

router.post(
  '/logout',
  requireAuth,
  validate(z.object({ refreshToken: z.string().optional(), deviceId: z.string().optional() })),
  asyncHandler(async (request, response) => {
    if (request.body.refreshToken) {
      await query(
        'UPDATE app_refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND token_hash = ?',
        [request.auth.userId, tokenHash(request.body.refreshToken)],
      );
    }
    if (request.body.deviceId) {
      await query('DELETE FROM app_user_devices WHERE user_id = ? AND device_id = ?', [
        request.auth.userId,
        request.body.deviceId,
      ]);
    }
    response.status(204).end();
  }),
);

router.get('/me', requireAuth, (request, response) => {
  const { user, ...profile } = request.auth;
  response.json({ user: { ...user, roleName: ROLE_NAMES[user.role] }, profile });
});

router.post(
  '/password/forgot',
  validate(z.object({ email })),
  asyncHandler(async (request, response) => {
    const user = await one(
      `SELECT id,full_name,email FROM users
        WHERE email=? AND status=0 AND deleted_at IS NULL`,
      [request.body.email],
    );
    if (user) {
      const raw = randomToken();
      const resetId = await transaction(async (connection) => {
        await connection.execute(
          `UPDATE app_password_reset_tokens SET used_at=NOW()
            WHERE user_id=? AND used_at IS NULL`,
          [user.id],
        );
        const [result] = await connection.execute(
          `INSERT INTO app_password_reset_tokens (user_id,token_hash,expires_at,created_at)
           VALUES (?,?,DATE_ADD(NOW(),INTERVAL 30 MINUTE),NOW())`,
          [user.id, tokenHash(raw)],
        );
        return result.insertId;
      });

      if (emailDeliveryEnabled()) {
        try {
          await sendPasswordResetEmail({
            to: user.email,
            fullName: user.full_name,
            token: raw,
          });
        } catch (error) {
          await query('UPDATE app_password_reset_tokens SET used_at=NOW() WHERE id=?', [resetId]);
          throw error;
        }
      } else if (env.NODE_ENV !== 'production') {
        response.set('X-Debug-Reset-Token', raw);
      }
    }
    response.json({ message: 'If the account exists, password reset instructions will be sent.' });
  }),
);

router.post(
  '/password/reset',
  validate(z.object({ token: z.string().min(20), password: z.string().min(10).max(128) })),
  asyncHandler(async (request, response) => {
    await transaction(async (connection) => {
      const [rows] = await connection.execute(
        `SELECT id,user_id FROM app_password_reset_tokens
          WHERE token_hash=? AND used_at IS NULL AND expires_at>NOW()
          FOR UPDATE`,
        [tokenHash(request.body.token)],
      );
      const reset = rows[0];
      if (!reset) throw notFound('The password reset token is invalid or expired');
      await connection.execute('UPDATE users SET password = ?, updated_at = NOW() WHERE id = ?', [
        await hashPassword(request.body.password),
        reset.user_id,
      ]);
      await connection.execute(
        `UPDATE app_password_reset_tokens SET used_at=NOW()
          WHERE user_id=? AND used_at IS NULL`,
        [reset.user_id],
      );
      await connection.execute(
        'UPDATE app_refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
        [reset.user_id],
      );
    });
    response.json({ message: 'Password updated successfully' });
  }),
);

router.post(
  '/invitations/accept',
  validate(z.object({ token: z.string().min(20), password: z.string().min(10).max(128) })),
  asyncHandler(async (request, response) => {
    const invitation = await one(
      `SELECT id, user_id FROM app_account_invitations
        WHERE token_hash = ? AND accepted_at IS NULL AND expires_at > NOW()`,
      [tokenHash(request.body.token)],
    );
    if (!invitation) throw notFound('Invitation is invalid or expired');
    await transaction(async (connection) => {
      await connection.execute(
        'UPDATE users SET password = ?, status = 0, updated_at = NOW() WHERE id = ?',
        [await hashPassword(request.body.password), invitation.user_id],
      );
      await connection.execute(
        'UPDATE app_account_invitations SET accepted_at = NOW() WHERE id = ?',
        [invitation.id],
      );
    });
    response.json({ message: 'Invitation accepted; the account is active' });
  }),
);

export default router;
