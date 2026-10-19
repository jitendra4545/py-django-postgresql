import { ROLES } from '../config/constants.js';

export const canAttachDocument = ({ auth, document, reservationId, now = new Date() }) => {
  if (!document) return false;
  const privileged = [ROLES.ADMIN, ROLES.STAFF].includes(Number(auth.role));
  if (!privileged && Number(document.owner_user_id) !== Number(auth.userId)) return false;
  if (document.reservation_id && Number(document.reservation_id) !== Number(reservationId)) {
    return false;
  }
  if (document.expires_at && new Date(document.expires_at) < now) return false;
  return true;
};
