import { AppError, forbidden } from './errors.js';
import { one } from '../db/pool.js';
import { verifyAccessToken } from '../services/tokens.js';

const bearerToken = (request) => {
  const value = request.get('authorization');
  return value?.startsWith('Bearer ') ? value.slice(7) : null;
};

export const requireAuth = async (request, _response, next) => {
  try {
    const token = bearerToken(request);
    if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Authentication is required');
    const payload = verifyAccessToken(token);
    const user = await one(
      `SELECT id, user_name, full_name, email, role, lang
         FROM users
        WHERE id = ? AND status = 0 AND deleted_at IS NULL`,
      [payload.sub],
    );
    if (!user || Number(user.role) !== Number(payload.role)) {
      throw new AppError(401, 'SESSION_INVALID', 'The account or session is no longer active');
    }

    const profile = await loadRoleProfile(user);
    request.auth = {
      userId: user.id,
      role: Number(user.role),
      user,
      ...profile,
    };
    next();
  } catch (error) {
    if (error instanceof AppError) return next(error);
    return next(new AppError(401, 'TOKEN_INVALID', 'The access token is invalid or expired'));
  }
};

const loadRoleProfile = async (user) => {
  if (Number(user.role) === 5) {
    const customer = await one(
      'SELECT id, agency_id FROM customers WHERE user_id = ? AND deleted_at IS NULL',
      [user.id],
    );
    return { customerId: customer?.id ?? null, agencyId: customer?.agency_id ?? null };
  }
  if (Number(user.role) === 4) {
    const agent = await one(
      `SELECT a.id, a.agency_id, a.agent_type
         FROM agents a
         JOIN agencies ag ON ag.id = a.agency_id AND ag.deleted_at IS NULL AND ag.status = 1
        WHERE a.user_id = ? AND a.deleted_at IS NULL`,
      [user.id],
    );
    if (!agent) throw forbidden('The agency agent profile is inactive');
    return { agentId: agent.id, agencyId: agent.agency_id, agentType: agent.agent_type };
  }
  if (Number(user.role) === 3) {
    const driver = await one('SELECT id FROM drivers WHERE user_id = ? AND deleted_at IS NULL', [
      user.id,
    ]);
    if (!driver) throw forbidden('The chauffeur profile is inactive');
    return { driverId: driver.id };
  }
  return {};
};

export const requireRoles =
  (...roles) =>
  (request, _response, next) => {
    if (!roles.includes(request.auth.role)) return next(forbidden());
    return next();
  };
