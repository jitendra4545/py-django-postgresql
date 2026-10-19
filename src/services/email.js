import nodemailer from 'nodemailer';
import { URL } from 'node:url';
import { AppError } from '../common/errors.js';
import { env } from '../config/env.js';

let transporter;

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const resetUrlFor = (token) => {
  const resetUrl = new URL(env.PASSWORD_RESET_URL);
  resetUrl.searchParams.set('token', token);
  return resetUrl.toString();
};

const invitationUrlFor = (token, role) => {
  const invitationUrl = new URL(env.INVITATION_ACCEPT_URL);
  invitationUrl.searchParams.set('token', token);
  invitationUrl.searchParams.set('role', role);
  return invitationUrl.toString();
};

const smtpTransport = () => {
  if (env.EMAIL_PROVIDER !== 'smtp') return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.MAIL_HOST,
      port: env.MAIL_PORT,
      secure: env.MAIL_ENCRYPTION === 'ssl',
      requireTLS: env.MAIL_ENCRYPTION === 'tls',
      auth: { user: env.MAIL_USERNAME, pass: env.MAIL_PASSWORD },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
      tls: { minVersion: 'TLSv1.2' },
    });
  }
  return transporter;
};

export const buildInvitationMessage = ({ fullName, token, role }) => {
  const invitationUrl = invitationUrlFor(token, role);
  const safeName = escapeHtml(fullName || 'there');
  const safeRole = escapeHtml(role === 'AGENCY_AGENT' ? 'Agency Agent' : 'Chauffeur');
  const safeUrl = escapeHtml(invitationUrl);
  return {
    subject: `Your Drive Luxury ${role === 'AGENCY_AGENT' ? 'Agency Agent' : 'Chauffeur'} invitation`,
    text: [
      `Hello ${fullName || 'there'},`,
      '',
      `You have been invited to Drive Luxury as a ${role === 'AGENCY_AGENT' ? 'Agency Agent' : 'Chauffeur'}.`,
      `Activate your account within 7 days: ${invitationUrl}`,
      '',
      'If you were not expecting this invitation, please ignore this email.',
    ].join('\n'),
    html: `<!doctype html>
      <html><body style="margin:0;background:#f6f4ef;font-family:Arial,sans-serif;color:#171717">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f4ef;padding:32px 16px">
          <tr><td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d7c49a">
              <tr><td style="background:#0a0a0a;padding:24px 28px;color:#c8a45d;font-size:18px;font-weight:700">DRIVE LUXURY</td></tr>
              <tr><td style="padding:30px 28px">
                <h1 style="margin:0 0 18px;font-size:24px">Welcome to Drive Luxury</h1>
                <p style="margin:0 0 14px;line-height:1.6">Hello ${safeName},</p>
                <p style="margin:0 0 22px;line-height:1.6">You have been invited as a ${safeRole}. Activate your account and choose a password within 7 days.</p>
                <p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;padding:13px 20px;border:1px solid #c8a45d">Activate account</a></p>
                <p style="margin:0;color:#6a665f;font-size:13px;line-height:1.5">If you were not expecting this invitation, you can safely ignore it.</p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body></html>`,
  };
};

const sendTransactionalEmail = async ({ to, message, failureMessage }) => {
  const transport = smtpTransport();
  if (!transport) {
    throw new AppError(503, 'EMAIL_NOT_CONFIGURED', 'Email delivery is not configured');
  }
  try {
    await transport.sendMail({
      from: { name: env.MAIL_FROM_NAME, address: env.MAIL_FROM_ADDRESS },
      ...(env.MAIL_REPLY_TO ? { replyTo: env.MAIL_REPLY_TO } : {}),
      to,
      ...message,
    });
  } catch (error) {
    console.error(failureMessage, { code: error.code, command: error.command });
    throw new AppError(
      503,
      'EMAIL_DELIVERY_FAILED',
      'The email could not be sent. Please try again later.',
    );
  }
};

export const emailDeliveryEnabled = () => env.EMAIL_PROVIDER === 'smtp';

export const buildPasswordResetMessage = ({ fullName, token }) => {
  const resetUrl = resetUrlFor(token);
  const safeName = escapeHtml(fullName || 'there');
  const safeUrl = escapeHtml(resetUrl);
  return {
    subject: 'Reset your Drive Luxury password',
    text: [
      `Hello ${fullName || 'there'},`,
      '',
      'We received a request to reset your Drive Luxury password.',
      `Open this link within 30 minutes: ${resetUrl}`,
      '',
      'If you did not request this change, you can ignore this email.',
    ].join('\n'),
    html: `<!doctype html>
      <html><body style="margin:0;background:#f6f4ef;font-family:Arial,sans-serif;color:#171717">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f4ef;padding:32px 16px">
          <tr><td align="center">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #d7c49a">
              <tr><td style="background:#0a0a0a;padding:24px 28px;color:#c8a45d;font-size:18px;font-weight:700">DRIVE LUXURY</td></tr>
              <tr><td style="padding:30px 28px">
                <h1 style="margin:0 0 18px;font-size:24px">Reset your password</h1>
                <p style="margin:0 0 14px;line-height:1.6">Hello ${safeName},</p>
                <p style="margin:0 0 22px;line-height:1.6">We received a request to reset your Drive Luxury password. This link expires in 30 minutes.</p>
                <p style="margin:0 0 24px"><a href="${safeUrl}" style="display:inline-block;background:#0a0a0a;color:#ffffff;text-decoration:none;padding:13px 20px;border:1px solid #c8a45d">Reset password</a></p>
                <p style="margin:0;color:#6a665f;font-size:13px;line-height:1.5">If you did not request this change, you can safely ignore this email.</p>
              </td></tr>
            </table>
          </td></tr>
        </table>
      </body></html>`,
  };
};

export const sendPasswordResetEmail = async ({ to, fullName, token }) => {
  const message = buildPasswordResetMessage({ fullName, token });
  return sendTransactionalEmail({
    to,
    message,
    failureMessage: 'Password reset email delivery failed',
  });
};

export const sendInvitationEmail = ({ to, fullName, token, role }) =>
  sendTransactionalEmail({
    to,
    message: buildInvitationMessage({ fullName, token, role }),
    failureMessage: 'Invitation email delivery failed',
  });
