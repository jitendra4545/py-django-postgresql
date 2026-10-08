import { one, query } from '../db/pool.js';
import { AppError } from '../common/errors.js';
import { computeQuoteBreakdown } from './pricing-core.js';

const rentTypeFor = (serviceCode) => ({ CHAUFFEUR: 1, CAR_RENTAL: 3, TRANSFER: 4 })[serviceCode];
const taxServiceTypeFor = (serviceCode) =>
  ({ CHAUFFEUR: 1, CAR_RENTAL: 2, TRANSFER: 3 })[serviceCode];
const optionRentTypeFor = (serviceCode) =>
  ({ CHAUFFEUR: 1, CAR_RENTAL: 2, TRANSFER: 3 })[serviceCode];

export const calculateQuote = async ({
  serviceCode,
  vehicleClassId,
  countryId,
  durationDays,
  pickupCityId,
  dropoffCityId,
  optionSelections = [],
  connection = null,
}) => {
  const fetchOne = async (sql, params) => {
    if (!connection) return one(sql, params);
    const [rows] = await connection.execute(sql, params);
    return rows[0];
  };
  const fetchAll = async (sql, params) => {
    if (!connection) return query(sql, params);
    const [rows] = await connection.execute(sql, params);
    return rows;
  };
  if (!['CHAUFFEUR', 'CAR_RENTAL', 'TRANSFER'].includes(serviceCode)) {
    throw new AppError(422, 'MANUAL_QUOTE_REQUIRED', `${serviceCode} requires back-office pricing`);
  }
  const cityRate =
    serviceCode === 'TRANSFER' && pickupCityId && dropoffCityId
      ? await fetchOne(
          `SELECT id, price AS amount
             FROM transfer_city_wise_prices
            WHERE vehicle_class_id = ? AND deleted_at IS NULL
              AND ((city_1 = ? AND city_2 = ?) OR (city_1 = ? AND city_2 = ?))
            ORDER BY updated_at DESC, id DESC LIMIT 1`,
          [vehicleClassId, pickupCityId, dropoffCityId, dropoffCityId, pickupCityId],
        )
      : null;
  const rate =
    cityRate ??
    (await fetchOne(
      `SELECT id, amount
       FROM vehicle_class_price_rates
      WHERE vehicle_class_id = ? AND country_id IN (?, 0) AND rent_type = ? AND status = 1
      ORDER BY (country_id = ?) DESC, rental_duration_id DESC, id DESC
       LIMIT 1`,
      [vehicleClassId, countryId, rentTypeFor(serviceCode), countryId],
    ));
  if (!rate)
    throw new AppError(
      422,
      'RATE_UNAVAILABLE',
      'No active price rate is configured for this selection',
    );

  const ids = optionSelections.map((item) => Number(item.optionId)).filter(Boolean);
  const options = ids.length
    ? await fetchAll(
        `SELECT id, title, based_on, rate_type, amount, taxable
           FROM rental_options
          WHERE id IN (${ids.map(() => '?').join(',')}) AND rent_type = ? AND status = 1 AND deleted_at IS NULL`,
        [...ids, optionRentTypeFor(serviceCode)],
      )
    : [];

  const taxes = await fetchAll(
    `SELECT id, title, amount
       FROM tax_surecharges
      WHERE country_id = ? AND service_type = ? AND status = 1 AND deleted_at IS NULL`,
    [countryId, taxServiceTypeFor(serviceCode)],
  );
  const days = Math.max(Number(durationDays) || 1, 1);
  const lines = computeQuoteBreakdown({
    serviceCode,
    rateAmount: rate.amount,
    durationDays: days,
    options,
    optionSelections,
    taxes,
  });

  return {
    currency: 'EUR',
    vehicleClassId,
    durationDays: days,
    lines,
    sourceRateId: rate.id,
    sourceRateType: cityRate ? 'TRANSFER_CITY_PAIR' : 'VEHICLE_CLASS_RATE',
    validUntil: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
};
