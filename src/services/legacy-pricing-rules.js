import Decimal from 'decimal.js';
import { AppError } from '../common/errors.js';

// Numeric values shared with the existing PHP reservations and rate tables.
export const LEGACY_SERVICE_TYPES = Object.freeze({
  CHAUFFEUR: 1,
  CAR_RENTAL: 2,
  TRANSFER: 3,
});

export const billableUnits = ({ serviceCode, startAt, endAt, requestedHours }) => {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new AppError(422, 'INVALID_BOOKING_DATES', 'The end must be after the pickup time');
  }
  const hours = (end - start) / 3_600_000;
  if (serviceCode === 'TRANSFER') return 1;
  if (serviceCode === 'CAR_RENTAL') return hours <= 26 ? 1 : Math.ceil(hours / 24);
  if (serviceCode === 'CHAUFFEUR') {
    const units = requestedHours ?? Math.ceil(hours);
    if (!Number.isInteger(units) || units < 2 || units < Math.ceil(hours)) {
      throw new AppError(
        422,
        'INVALID_CHAUFFEUR_HOURS',
        'Chauffeur hours must cover the trip and be at least two',
      );
    }
    return units;
  }
  throw new AppError(422, 'INVALID_SERVICE', 'Unknown priced service');
};

export const amountForDuration = (bandAmount, bandSpan, units) => {
  if (!Number.isFinite(Number(bandSpan)) || Number(bandSpan) <= 0) {
    throw new AppError(
      422,
      'INVALID_RATE_BAND',
      'The configured price band has no positive duration',
    );
  }
  return new Decimal(bandAmount).dividedBy(bandSpan).times(units).toNumber();
};

export const transferTierAmount = (rate, distanceKm) => {
  const km = Number(distanceKm);
  if (!Number.isFinite(km) || km < 0) {
    throw new AppError(422, 'ROUTE_DISTANCE_REQUIRED', 'A verified route distance is required');
  }
  const perKm = km > 50 ? rate.rate_3 : km > 30 ? rate.rate_2 : rate.rate_1;
  return Decimal.max(rate.base_rate, km > 15 ? new Decimal(perKm).times(km) : 0).toNumber();
};

export const currencyForCountry = (countryCode) =>
  String(countryCode).toUpperCase() === 'CH' ? 'CHF' : 'EUR';
