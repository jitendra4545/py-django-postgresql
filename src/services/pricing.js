import { query } from '../db/pool.js';
import { AppError } from '../common/errors.js';
import { computeQuoteBreakdown } from './pricing-core.js';
import { getVerifiedRouteKm } from './google-maps.js';
import {
  LEGACY_SERVICE_TYPES,
  amountForDuration,
  billableUnits,
  currencyForCountry,
  transferTierAmount,
} from './legacy-pricing-rules.js';

// A rate must match the same season and duration band the existing PHP flow
// would select. Never take an arbitrary highest-ID price-rate row.
export const calculateQuote = async ({
  serviceCode,
  vehicleClassId,
  countryId,
  startAt,
  endAt,
  requestedHours,
  distanceKm = null,
  pickupCityId,
  dropoffCityId,
  insuranceType = 'NONE',
  optionSelections = [],
  vehicleId = null,
  pickup = null,
  dropoff = null,
  connection = null,
}) => {
  const fetchAll = connection
    ? async (sql, params) => connection.execute(sql, params).then(([rows]) => rows)
    : query;
  const fetchOne = async (sql, params) => (await fetchAll(sql, params))[0] ?? null;
  const rentType = LEGACY_SERVICE_TYPES[serviceCode];
  if (!rentType) {
    throw new AppError(422, 'MANUAL_QUOTE_REQUIRED', `${serviceCode} requires back-office pricing`);
  }
  const units = billableUnits({ serviceCode, startAt, endAt, requestedHours });
  const klass = await fetchOne(
    `SELECT id,rental_type,one_way_drop_off_charge,car_with_driver_free_km,
            car_with_driver_extra_cost_per_km,half_insurance_amount,full_insurance_amount,
            half_insurance_text_en,half_insurance_text_de,half_insurance_text_fr,
            full_insurance_text_en,full_insurance_text_de,full_insurance_text_fr
       FROM vehicle_classes
      WHERE id=? AND rental_type=? AND status=1 AND can_reservation_from_website=1
        AND deleted_at IS NULL LIMIT 1`,
    [vehicleClassId, rentType],
  );
  if (!klass)
    throw new AppError(
      422,
      'CLASS_UNAVAILABLE',
      'The vehicle class is not offered for this service',
    );
  const country = await fetchOne(
    'SELECT code FROM countries WHERE id=? AND status=1 AND deleted_at IS NULL LIMIT 1',
    [countryId],
  );
  if (!country) throw new AppError(422, 'COUNTRY_UNAVAILABLE', 'Pickup country is not supported');
  const currency = currencyForCountry(country.code);
  const pickupDate = new Date(startAt).toISOString().slice(0, 10);
  const season = await fetchOne(
    `SELECT id,name FROM rental_seasons
      WHERE start<=? AND end>=? AND status=1 AND deleted_at IS NULL
      ORDER BY id DESC LIMIT 1`,
    [pickupDate, pickupDate],
  );
  // PHP uses season 0 when no active season covers the pickup date. A
  // seasonal row missing within an active season is NOT silently replaced.
  const seasonId = season?.id ?? 0;
  let amount;
  let sourceRateId;
  let sourceRateType;
  let durationBand = null;

  if (serviceCode === 'TRANSFER') {
    const cityRate =
      pickupCityId && dropoffCityId
        ? await fetchOne(
            `SELECT id,price FROM transfer_city_wise_prices
              WHERE vehicle_class_id=? AND deleted_at IS NULL
                AND ((city_1=? AND city_2=?) OR (city_1=? AND city_2=?))
              ORDER BY id DESC LIMIT 1`,
            [vehicleClassId, pickupCityId, dropoffCityId, dropoffCityId, pickupCityId],
          )
        : null;
    if (cityRate) {
      amount = Number(cityRate.price);
      sourceRateId = cityRate.id;
      sourceRateType = 'TRANSFER_CITY_PAIR';
    } else {
      if (distanceKm == null) {
        throw new AppError(
          422,
          'ROUTE_DISTANCE_REQUIRED',
          'Transfer pricing needs a verified route distance',
        );
      }
      const countryRate = await fetchOne(
        `SELECT id,base_rate,rate_1,rate_2,rate_3
           FROM vehicle_class_city_wise_base_rates
          WHERE vehicle_class_id=? AND country_id=? AND rental_season_id=?
            AND rent_type=3 AND deleted_at IS NULL ORDER BY id DESC LIMIT 1`,
        [vehicleClassId, countryId, seasonId],
      );
      if (countryRate) {
        amount = transferTierAmount(countryRate, distanceKm);
        sourceRateId = countryRate.id;
        sourceRateType = 'TRANSFER_COUNTRY_DISTANCE';
      } else {
        const fallback = await fetchAll(
          `SELECT id,rental_duration_id,amount FROM vehicle_class_price_rates
            WHERE vehicle_class_id=? AND rental_season_id=? AND rent_type=3
              AND rental_duration_id IN (9,10) AND country_id IN (?,0) AND status=1
            ORDER BY (country_id=?) DESC,id DESC`,
          [vehicleClassId, seasonId, countryId, countryId],
        );
        const base = fallback.find((row) => Number(row.rental_duration_id) === 9);
        const perKm = fallback.find((row) => Number(row.rental_duration_id) === 10);
        if (!perKm) throw new AppError(422, 'RATE_UNAVAILABLE', 'No transfer rate is configured');
        amount = Math.max(Number(base?.amount ?? 0), Number(perKm.amount) * distanceKm);
        sourceRateId = perKm.id;
        sourceRateType = 'TRANSFER_CLASS_DISTANCE';
      }
    }
  } else {
    durationBand = await fetchOne(
      `SELECT id,span_duration FROM rental_durations
        WHERE rent_type=? AND status=1 AND span_duration>0
        ORDER BY ABS(span_duration-?),span_duration,id LIMIT 1`,
      [rentType, units],
    );
    if (!durationBand)
      throw new AppError(422, 'DURATION_UNAVAILABLE', 'No duration band is configured');
    const rate = await fetchOne(
      `SELECT id,amount,country_id FROM vehicle_class_price_rates
        WHERE vehicle_class_id=? AND rental_season_id=? AND rental_duration_id=?
          AND rent_type=? AND country_id IN (?,0) AND status=1
        ORDER BY (country_id=?) DESC,id DESC LIMIT 1`,
      [vehicleClassId, seasonId, durationBand.id, rentType, countryId, countryId],
    );
    if (!rate)
      throw new AppError(422, 'RATE_UNAVAILABLE', 'No active rate matches season and duration');
    amount = amountForDuration(rate.amount, durationBand.span_duration, units);
    sourceRateId = rate.id;
    sourceRateType =
      Number(rate.country_id) === Number(countryId) ? 'COUNTRY_SEASON_DURATION' : 'SEASON_DURATION';
  }

  const selectedIds = optionSelections.map((item) => Number(item.optionId));
  if (new Set(selectedIds).size !== selectedIds.length) {
    throw new AppError(422, 'DUPLICATE_OPTION', 'Select each rental option once');
  }
  const options = selectedIds.length
    ? await fetchAll(
        `SELECT ro.id,ro.title,ro.based_on,ro.rate_type,ro.amount,ro.taxable
           FROM rental_options ro
          WHERE ro.id IN (${selectedIds.map(() => '?').join(',')})
            AND ro.rent_type=? AND ro.status=1 AND ro.show_on_frontend=1 AND ro.deleted_at IS NULL
            AND EXISTS (SELECT 1 FROM rental_option_classes roc
                         WHERE roc.rental_option_id=ro.id AND roc.vehicle_class_id=?)`,
        [...selectedIds, rentType, vehicleClassId],
      )
    : [];
  if (options.length !== selectedIds.length) {
    throw new AppError(422, 'OPTION_UNAVAILABLE', 'An extra is not offered for this vehicle class');
  }
  if (
    !['NONE', 'HALF', 'FULL'].includes(insuranceType) ||
    (insuranceType !== 'NONE' && serviceCode !== 'CAR_RENTAL')
  ) {
    throw new AppError(422, 'INSURANCE_UNAVAILABLE', 'This insurance choice is not offered');
  }
  const insuranceCost =
    insuranceType === 'HALF'
      ? klass.half_insurance_amount
      : insuranceType === 'FULL'
        ? klass.full_insurance_amount
        : 0;
  const km = distanceKm == null ? null : Number(distanceKm);
  if (km !== null && (!Number.isFinite(km) || km < 0)) {
    throw new AppError(422, 'INVALID_DISTANCE', 'Invalid route distance');
  }
  const freeKm = (Number(klass.car_with_driver_free_km || 0) / 8) * units;
  if (serviceCode === 'CHAUFFEUR' && km === null) {
    throw new AppError(
      422,
      'ROUTE_DISTANCE_REQUIRED',
      'Chauffeur pricing needs a verified route distance',
    );
  }
  const chauffeurExtraCost =
    serviceCode === 'CHAUFFEUR'
      ? Math.max(km - freeKm, 0) * Number(klass.car_with_driver_extra_cost_per_km || 0)
      : 0;
  const insuranceText =
    insuranceType === 'NONE'
      ? null
      : {
          en: klass[`${insuranceType.toLowerCase()}_insurance_text_en`] ?? null,
          de: klass[`${insuranceType.toLowerCase()}_insurance_text_de`] ?? null,
          fr: klass[`${insuranceType.toLowerCase()}_insurance_text_fr`] ?? null,
        };
  if (serviceCode === 'CAR_RENTAL' && Number(klass.one_way_drop_off_charge) > 0 && km === null) {
    throw new AppError(
      422,
      'ROUTE_DISTANCE_REQUIRED',
      'Rental drop-off pricing needs a verified route distance',
    );
  }
  let oneWayCharge =
    serviceCode === 'CAR_RENTAL' && km > 2 ? Number(klass.one_way_drop_off_charge || 0) * km : 0;
  let isPickupAndCollection = false;
  if (
    serviceCode === 'CAR_RENTAL' &&
    vehicleId &&
    pickup &&
    dropoff &&
    Number(klass.one_way_drop_off_charge) > 0
  ) {
    // const originalCities = await fetchAll(
    //   'SELECT locality,country FROM vehicle_cities WHERE vehicle_id=? AND deleted_at IS NULL ORDER BY id',
    //   [vehicleId],
    // );
    
    const originalCities = await fetchAll(
  `SELECT
       vc.city_id,
       c.country_id,
       vc.locality,
       vc.country
   FROM vehicle_cities vc
   JOIN cities c ON c.id = vc.city_id
   WHERE vc.vehicle_id = ?
     AND vc.deleted_at IS NULL
   ORDER BY vc.id`,
  [vehicleId]
);
    // const matches = (point) =>
    //   originalCities.some(
    //     (row) =>
    //       String(row.locality || '').toLowerCase() === String(point.city || '').toLowerCase() &&
    //       String(row.country || '').toUpperCase() === String(country.code || '').toUpperCase(),
    //   );
    
    
    
    const matches = (point) =>
  originalCities.some((row) => {
    if (point?.cityId != null && point?.countryId != null) {
      return (
        Number(row.city_id) === Number(point.cityId) &&
        Number(row.country_id) === Number(point.countryId)
      );
    }

    return (
      String(row.locality || "").trim().toLowerCase() ===
        String(point?.city || "").trim().toLowerCase() &&
      String(row.country || "").trim().toUpperCase() ===
        String(country.code || "").trim().toUpperCase()
    );
  });
    if (originalCities.length && !matches(pickup) && !matches(dropoff)) {
      isPickupAndCollection = true;
      const original = { address: `${originalCities[0].locality}, ${originalCities[0].country}` };
      const pickupKm = await getVerifiedRouteKm({ pickup, dropoff: original });
      const dropoffKm = await getVerifiedRouteKm({ pickup: dropoff, dropoff: original });
      if (pickupKm == null || dropoffKm == null) {
        throw new AppError(
          422,
          'ROUTE_DISTANCE_REQUIRED',
          'Collection pricing requires verified routes',
        );
      }
      const driverFee = (distance) =>
        distance > 100 ? 190 : distance > 50 ? 50 : distance > 20 ? 35 : 0;
      oneWayCharge =
        Number(klass.one_way_drop_off_charge) * (pickupKm + dropoffKm) +
        driverFee(pickupKm) +
        driverFee(dropoffKm);
    }
  }
  const taxes = await fetchAll(
    `SELECT id,title,amount FROM tax_surecharges
      WHERE country_id=? AND service_type=? AND status=1 AND deleted_at IS NULL`,
    [countryId, rentType],
  );
  const lines = computeQuoteBreakdown({
    serviceCode,
    rateAmount: amount,
    rateIsTotal: true,
    durationDays: units,
    options,
    optionSelections,
    taxes,
    currency,
    oneWayCharge,
    chauffeurExtraCost,
    insuranceCost,
  });
  return {
    currency,
    vehicleClassId,
    durationDays: units,
    billableUnits: units,
    // Chauffeur billable units are hours; expose this explicitly so Expo
    // clients never mistake durationDays for days or use Google's route ETA.
    ...(serviceCode === 'CHAUFFEUR' ? { billableHours: units } : {}),
    rentalSeasonId: seasonId,
    durationBandId: durationBand?.id ?? null,
    distanceKm: km,
    insuranceType,
    insuranceText,
    isPickupAndCollection,
    lines,
    sourceRateId,
    sourceRateType,
    validUntil: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
};
