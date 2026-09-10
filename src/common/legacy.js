import { env } from '../config/env.js';
export const LegacyRole = {
    ADMIN: 1,
    USER: 2,
    DRIVER: 3,
    AGENT: 4,
    CUSTOMER: 5
};
export const LegacyReservationStatus = {
    PENDING: 0,
    CONFIRMED: 1,
    COMPLETE: 2,
    CANCELLED: 3
};
export const LegacyServiceType = {
    CHAUFFEUR: env.SERVICE_TYPE_CHAUFFEUR,
    CAR_RENTAL: env.SERVICE_TYPE_CAR_RENTAL,
    TRANSFER: env.SERVICE_TYPE_TRANSFER
};
export const roleName = (role) => ({ 1: 'ADMIN', 2: 'USER', 3: 'DRIVER', 4: 'AGENT', 5: 'CUSTOMER' }[role] ?? 'UNKNOWN');
