import { query } from '../db/pool.js';
import { AppError } from '../common/errors.js';
import { computeQuoteBreakdown } from './pricing-core.js';
import { getVerifiedRouteKm } from './google-maps.js';
import {
  LEGACY_SERVICE_TYPES,
  amountForDuration,
  billableUnits,
  currencyForCountry,
  optionBillingDays,
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
  insuranceType,
  optionSelections = [],
  existingOptions = null,
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
  const billedDays = optionBillingDays({ serviceCode, billableUnits: units });
  const klass = await fetchOne(
    `SELECT id,rental_type,one_way_drop_off_charge,car_with_driver_free_km,
            car_with_driver_extra_cost_per_km,half_insurance_amount,full_insurance_amount,
            half_insurance_text_en,half_insurance_text_de,half_insurance_text_fr,
            full_insurance_text_en,full_insurance_text_de,full_insurance_text_fr
       FROM vehicle_classes
      WHERE id=? AND rental_type=? AND status=1
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
      ORDER BY id LIMIT 1`,
    [pickupDate, pickupDate],
  );
  // PHP uses season 0 when no active season covers the pickup date. A
  // seasonal row missing within an active season is NOT silently replaced.
  const seasonId = season?.id ?? 0;
  let amount;
  let sourceRateId;
  let sourceRateType;
  let durationBand = null;

  const resolvePricingCity = async (id,point) => {
    if(id)return id;
    if(!point?.city)return null;
    const city=await fetchOne(`SELECT id FROM cities WHERE deleted_at IS NULL
      AND (? IS NULL OR country_id=?) AND (name=? OR additional_name_1=? OR additional_name_2=? OR additional_name_3=? OR additional_name_4=?)
      ORDER BY id LIMIT 1`,[point.countryId??null,point.countryId??null,...Array(5).fill(point.city)]);
    return city?.id??null;
  };
  const pickupRateCityId=await resolvePricingCity(pickupCityId,pickup);
  const dropoffRateCityId=await resolvePricingCity(dropoffCityId,dropoff);
  if (serviceCode === 'TRANSFER') {
    const cityRate =
      pickupRateCityId && dropoffRateCityId
        ? await fetchOne(
            `SELECT id,price FROM transfer_city_wise_prices
              WHERE vehicle_class_id=? AND deleted_at IS NULL
                AND ((city_1=? AND city_2=?) OR (city_1=? AND city_2=?))
              ORDER BY (city_1=? AND city_2=?) DESC,id LIMIT 1`,
            [vehicleClassId,pickupRateCityId,dropoffRateCityId,dropoffRateCityId,pickupRateCityId,pickupRateCityId,dropoffRateCityId],
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
            AND rent_type=3 AND deleted_at IS NULL ORDER BY id LIMIT 1`,
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
              AND rental_duration_id IN (9,10)
            ORDER BY id DESC`,
          [vehicleClassId, seasonId],
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
        ORDER BY ABS(span_duration-?),id LIMIT 1`,
      [rentType, units],
    );
    if (!durationBand)
      throw new AppError(422, 'DURATION_UNAVAILABLE', 'No duration band is configured');
    const rate = await fetchOne(
      `SELECT id,amount,country_id FROM vehicle_class_price_rates
        WHERE vehicle_class_id=? AND rental_season_id=? AND rental_duration_id=?
          AND rent_type=? AND country_id IN (?,0)
          ${serviceCode === 'CAR_RENTAL' ? 'AND status=1' : ''}
        ORDER BY (country_id=?) DESC,id LIMIT 1`,
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
  // Only internal booking-change code supplies trusted native snapshots. New
  // customer selections always pass the public visibility/class validation.
  const options = existingOptions ?? (selectedIds.length
    ? await fetchAll(
        `SELECT ro.id,COALESCE(NULLIF(ro.title_en,''),ro.title) AS title,ro.based_on,ro.rate_type,ro.amount,ro.taxable
           FROM rental_options ro
          WHERE ro.id IN (${selectedIds.map(() => '?').join(',')})
            AND ro.show_on_frontend=1 AND ro.deleted_at IS NULL
            AND EXISTS (SELECT 1 FROM rental_option_classes roc
                         WHERE roc.rental_option_id=ro.id AND roc.vehicle_class_id=?)`,
        [...selectedIds, vehicleClassId],
      )
    : []);
  if (options.length !== selectedIds.length) {
    throw new AppError(422, 'OPTION_UNAVAILABLE', 'An extra is not offered for this vehicle class');
  }
  // In the website, included half insurance is checked by default.
  // Never assume an undefined or NULL legacy insurance price is 'included':
  // require a zero amount AND a configured coverage description.
  const halfInsuranceIncluded =
    serviceCode === 'CAR_RENTAL' &&
    klass.half_insurance_amount != null &&
    Number(klass.half_insurance_amount) === 0 &&
    [klass.half_insurance_text_en, klass.half_insurance_text_de, klass.half_insurance_text_fr].some(
      (text) => typeof text === 'string' && text.trim().length > 0,
    );
  const resolvedInsuranceType = insuranceType ?? (halfInsuranceIncluded ? 'HALF' : 'NONE');
  if (
    !['NONE', 'HALF', 'FULL'].includes(resolvedInsuranceType) ||
    (resolvedInsuranceType !== 'NONE' && serviceCode !== 'CAR_RENTAL')
  ) {
    throw new AppError(422, 'INSURANCE_UNAVAILABLE', 'This insurance choice is not offered');
  }
  const insuranceUnitAmount =
    resolvedInsuranceType === 'HALF'
      ? Number(klass.half_insurance_amount ?? 0)
      : resolvedInsuranceType === 'FULL'
        ? Number(klass.full_insurance_amount ?? 0)
        : 0;
  // Full insurance is displayed by the legacy website as CHF X/day.
  const insuranceCost = serviceCode === 'CAR_RENTAL' ? insuranceUnitAmount * billedDays : 0;
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
    resolvedInsuranceType === 'NONE'
      ? null
      : {
          en: klass[`${resolvedInsuranceType.toLowerCase()}_insurance_text_en`] ?? null,
          de: klass[`${resolvedInsuranceType.toLowerCase()}_insurance_text_de`] ?? null,
          fr: klass[`${resolvedInsuranceType.toLowerCase()}_insurance_text_fr`] ?? null,
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
    const originalCities = await fetchAll(
      `SELECT
       vc.city_id,
       c.country_id,
       vc.locality,
       vc.country
   FROM vehicle_original_cities vc
   LEFT JOIN cities c ON c.id = vc.city_id
   WHERE vc.vehicle_id = ?
     AND vc.deleted_at IS NULL
   ORDER BY vc.id`,
      [vehicleId],
    );
    const matches = (point) =>
      originalCities.some((row) => {
        if (point?.cityId != null && point?.countryId != null) {
          return (
            Number(row.city_id) === Number(point.cityId) &&
            Number(row.country_id) === Number(point.countryId)
          );
        }

        return (
          String(row.locality || '')
            .trim()
            .toLowerCase() ===
            String(point?.city || '')
              .trim()
              .toLowerCase() &&
          String(row.country || '')
            .trim()
            .toUpperCase() ===
            String(country.code || '')
              .trim()
              .toUpperCase()
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
    durationDays: billedDays,
    options,
    optionSelections,
    taxes,
    currency,
    oneWayCharge,
    chauffeurExtraCost,
    insuranceCost,
    optionBillingUnits: serviceCode === 'CHAUFFEUR' ? units : billedDays,
  });
  return {
    currency,
    vehicleClassId,
    durationDays: billedDays,
    billableUnits: units,
    // Base-rate units are hours for chauffeur, rental days for car rental.
    // Per-day child seats/insurance use durationDays instead of these hours.
    ...(serviceCode === 'CHAUFFEUR'
      ? {
          billableHours: units,
          includedDistanceKm: freeKm,
          freeKmPerHour: Number(klass.car_with_driver_free_km || 0) / 8,
          extraCostPerKm: Number(klass.car_with_driver_extra_cost_per_km || 0),
        }
      : {}),
    rentalSeasonId: seasonId,
    durationBandId: durationBand?.id ?? null,
    distanceKm: km,
    insuranceType: resolvedInsuranceType,
    insuranceText,
    insuranceIncluded: halfInsuranceIncluded && resolvedInsuranceType === 'HALF',
    insuranceUnitAmount,
    insuranceBillingDays: serviceCode === 'CAR_RENTAL' ? billedDays : 0,
    isPickupAndCollection,
    lines,
    sourceRateId,
    sourceRateType,
    validUntil: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
};
