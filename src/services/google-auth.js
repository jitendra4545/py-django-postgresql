import { OAuth2Client } from 'google-auth-library';
import { AppError } from '../common/errors.js';
import { env } from '../config/env.js';

const googleClient = new OAuth2Client();

export const normalizeGooglePayload = (payload) => {
  if (!payload?.sub || !payload?.email || payload.email_verified !== true) {
    throw new AppError(
      401,
      'GOOGLE_TOKEN_INVALID',
      'Google did not provide a verified account identity',
    );
  }

  const fallbackName = [payload.given_name, payload.family_name].filter(Boolean).join(' ').trim();
  return {
    subject: String(payload.sub),
    email: String(payload.email).trim().toLowerCase(),
    fullName: String(payload.name || fallbackName || payload.email.split('@')[0]).trim(),
    photo: payload.picture ? String(payload.picture) : null,
  };
};

export const verifyGoogleIdToken = async (idToken) => {
  if (!env.googleClientIds.length) {
    throw new AppError(
      503,
      'GOOGLE_AUTH_NOT_CONFIGURED',
      'Google authentication is not configured',
    );
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: env.googleClientIds,
    });
    return normalizeGooglePayload(ticket.getPayload());
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(401, 'GOOGLE_TOKEN_INVALID', 'The Google ID token is invalid or expired');
  }
};
