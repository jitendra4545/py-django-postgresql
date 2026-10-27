import { AppError } from '../common/errors.js';

// The selected chauffeur package determines the reservation/availability window,
// not just the amount on the quote. Keep all three consistent.
export const effectiveLegEndAt = (serviceCode, leg) => {
  if (serviceCode !== 'CHAUFFEUR' || leg.requestedHours == null) return leg.endAt;
  const hours = leg.requestedHours;
  if (!Number.isInteger(hours) || hours < 2 || hours > 720) {
    throw new AppError(422, 'INVALID_CHAUFFEUR_HOURS', 'Select between 2 and 720 whole hours');
  }
  const startMs = Date.parse(leg.startAt);
  if (!Number.isFinite(startMs)) {
    throw new AppError(422, 'INVALID_BOOKING_DATES', 'Invalid chauffeur pickup date');
  }
  const selectedEndMs = startMs + hours * 3_600_000;
  if (leg.endAt != null) {
    const suppliedEndMs = Date.parse(leg.endAt);
    if (!Number.isFinite(suppliedEndMs) || suppliedEndMs <= startMs) {
      throw new AppError(422, 'INVALID_BOOKING_DATES', 'The end must be after pickup');
    }
    if (suppliedEndMs > selectedEndMs) {
      throw new AppError(
        422,
        'INVALID_CHAUFFEUR_HOURS',
        'Selected chauffeur hours must cover the entire requested booking period',
      );
    }
  }
  return new Date(selectedEndMs).toISOString();
};

export const normalizeChauffeurDetails = (serviceCode, details) => {
  if (serviceCode !== 'CHAUFFEUR') return details;
  return {
    ...details,
    legs: details.legs.map((leg) => {
      if (leg.requestedHours == null) return leg;
      return { ...leg, endAt: effectiveLegEndAt(serviceCode, leg), isHourly: true };
    }),
  };
};
