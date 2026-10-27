import crypto from 'node:crypto';
import { AppError } from '../common/errors.js';
import { ROLES } from '../config/constants.js';
import { env } from '../config/env.js';
import { createTelnyxBridge } from './telnyx-masked-calling.js';

const providers = new Map();

export const registerMaskedCallProvider = (name, provider) => {
  if (!name || typeof provider?.createBridge !== 'function') {
    throw new TypeError('A telecom provider must expose createBridge()');
  }
  providers.set(name, provider);
};

export const canCallRecipientRole = (callerRole, recipientRole) => {
  if ([ROLES.ADMIN, ROLES.STAFF, ROLES.AGENCY_AGENT].includes(Number(callerRole))) return true;
  if (Number(callerRole) === ROLES.CLIENT) {
    return ['CHAUFFEUR', 'SUPPORT'].includes(recipientRole);
  }
  if (Number(callerRole) === ROLES.CHAUFFEUR) {
    return ['CLIENT', 'SUPPORT'].includes(recipientRole);
  }
  return false;
};

registerMaskedCallProvider('mock', {
  async createBridge() {
    if (env.NODE_ENV === 'production') {
      throw new AppError(503, 'MASKED_CALL_NOT_CONFIGURED', 'Masked calling is not configured');
    }
    return {
      provider: 'mock',
      providerReference: `mock_${crypto.randomUUID()}`,
      status: 'READY',
      dialNumber: '+15005550006',
      expiresInSeconds: env.MASKED_CALL_TTL_SECONDS,
    };
  },
});

registerMaskedCallProvider('telnyx', { createBridge: createTelnyxBridge });

export const createMaskedCallBridge = async (request) => {
  if (env.MASKED_CALL_PROVIDER === 'disabled') {
    throw new AppError(
      503,
      'MASKED_CALL_NOT_CONFIGURED',
      'Masked calling is disabled until a telecom provider is configured',
    );
  }
  const provider = providers.get(env.MASKED_CALL_PROVIDER);
  if (!provider) {
    throw new AppError(
      503,
      'MASKED_CALL_PROVIDER_UNAVAILABLE',
      'The configured telecom provider adapter is unavailable',
    );
  }
  return provider.createBridge(request);
};
