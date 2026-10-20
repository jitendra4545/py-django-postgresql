// PHP Reservation::created assigns this number from the allocated MySQL ID.
export const legacyReservationNumber = (reservationId) =>
  `DL${String(3614 + reservationId).padStart(5, '0')}`;
