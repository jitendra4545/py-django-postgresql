import {assertVehicleCapacity} from './vehicle-capacity.js';
import { recordBookingStatusEvent } from './mobile-status-events.js';
import crypto from 'node:crypto';
import { v4 as uuid } from 'uuid';
import { AppError } from '../common/errors.js';
import { LEGACY_RESERVATION_STATUS } from '../config/constants.js';
import { calculateQuote } from './pricing.js';
import { listAvailableVehicles } from './vehicle-availability.js';
import { getVerifiedRouteKm } from './google-maps.js';
import { billableUnits, LEGACY_SERVICE_TYPES } from './legacy-pricing-rules.js';
import { legacyReservationNumber } from './reservation-number.js';
import { effectiveLegEndAt } from './chauffeur-hours.js';
import { query } from '../db/pool.js';
import { loadNativeCoupon, applyNativeCoupon, reserveNativeCoupon } from './native-coupons.js';
import { syncNativeCommissions } from './native-financials.js';
import { QUOTE_TAX_POLICY } from './quote-tax-policy.js';

export const draftFingerprint = (draft) =>
  crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        serviceCode: draft.service_code,
        customerId: draft.customer_id,
        details: typeof draft.details === 'string' ? JSON.parse(draft.details) : draft.details,
        revision: draft.revision,
      }),
    )
    .digest('hex');

export const buildDraftQuote = async (draft) => {
  const details = typeof draft.details === 'string' ? JSON.parse(draft.details) : draft.details;
  if (!details?.vehicleClassId || !details?.legs?.length) {
    throw new AppError(
      422,
      'DRAFT_INCOMPLETE',
      'Vehicle class and at least one trip leg are required',
    );
  }
  const coupon = details.couponCode ? await loadNativeCoupon(query,details.couponCode) : null;
  const legQuotes = [];
  const selected = [];
  for (const [index, leg] of details.legs.entries()) {
    const start = new Date(leg.startAt);
    const effectiveEnd = effectiveLegEndAt(draft.service_code, leg);
    const requestedEnd = new Date(effectiveEnd ?? leg.startAt);
    const end = requestedEnd > start ? requestedEnd : new Date(start.getTime() + 60 * 60_000);
    const candidates = await listAvailableVehicles({
      vehicleClassId: details.vehicleClassId,
      countryId: leg.pickup.countryId,
      cityId: leg.pickup.cityId,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      serviceCode: draft.service_code,
      passengerCount: details.passenger?.count ?? 1,
      luggageCount: details.passenger?.luggageCount ?? 0,
    });
    let vehicle;
    for(const candidate of candidates){
      if(selected.some(previous=>previous.vehicleId===candidate.id&&previous.start<end&&previous.end>start))continue;
      try { await assertVehicleCapacity(null,candidate.id,details.passenger?.count??1,details.passenger?.luggageCount??0); }
      catch(error){if(error.code==='VEHICLE_CAPACITY_EXCEEDED')continue;throw error;}
      vehicle=candidate;break;
    }
    if (!vehicle) {
      throw new AppError(
        409,
        'VEHICLE_UNAVAILABLE',
        `No available vehicle remains for booking leg ${index + 1}`,
      );
    }
    const distanceKm = await getVerifiedRouteKm(leg);
    const quote = await calculateQuote({
      serviceCode: draft.service_code,
      vehicleClassId: details.vehicleClassId,
      countryId: leg.pickup.countryId,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      requestedHours: leg.requestedHours,
      distanceKm,
      insuranceType: details.insuranceType,
      pickupCityId: leg.pickup.cityId,
      dropoffCityId: leg.dropoff?.cityId,
      optionSelections: details.options ?? [],
      vehicleId: vehicle.id,
      pickup: leg.pickup,
      dropoff: leg.dropoff,
    });
    legQuotes.push({
      sequenceNo: index + 1,
      vehicleId: vehicle.id,
      // Report the same effective window used for availability and pricing.
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      ...quote,
    });
    selected.push({ vehicleId: vehicle.id, start, end });
  }
  if (new Set(legQuotes.map((leg) => leg.currency)).size > 1) {
    throw new AppError(422, 'MIXED_CURRENCY', 'All legs in a checkout must use one currency');
  }
  const total = legQuotes.reduce((sum, leg) => sum + leg.lines.total, 0);
  const result = {
    __native: { taxPolicy: QUOTE_TAX_POLICY },
    currency: legQuotes[0].currency,
    legs: legQuotes,
    total: Number(total.toFixed(2)),
    validUntil: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
  return coupon ? applyNativeCoupon(result,coupon) : result;
};

const sqlDate = (iso) => new Date(iso).toISOString().slice(0, 10);
const sqlTime = (iso) => new Date(iso).toISOString().slice(11, 19);

export const createLegacyReservation = async (connection, { draft, quote, auth }) => {
  const details = typeof draft.details === 'string' ? JSON.parse(draft.details) : draft.details;
  // The original reservation service types are fixed (1=chauffeur,
  // 2=car rental, 3=transfer). The website `services` table is editorial;
  // its IDs must not be substituted for `reservations.service_type`.
  const legacyServiceId = LEGACY_SERVICE_TYPES[draft.service_code];
  if (!legacyServiceId) {
    throw new AppError(
      422,
      'SERVICE_NOT_MAPPED',
      'This service is not mapped to a legacy reservation service',
    );
  }
  const bookingUuid = uuid();
  // Lock the physical candidates before creating any reservation rows. This
  // serializes competing checkouts in this backend; the PHP website must also
  // respect the legacy reserved-date ledger to avoid cross-application races.
  for (const vehicleId of [...new Set(quote.legs.map((leg) => Number(leg.vehicleId)))].sort(
    (a, b) => a - b,
  )) {
    const [locks] = await connection.execute('SELECT id FROM vehicles WHERE id=? FOR UPDATE', [
      vehicleId,
    ]);
    if (!locks.length)
      throw new AppError(409, 'VEHICLE_UNAVAILABLE', 'The quoted vehicle is no longer available');
  }
  for (const [index, leg] of details.legs.entries()) {
    const quoted = quote.legs[index];
    const from = new Date(leg.startAt);
    const requested = new Date(effectiveLegEndAt(draft.service_code,leg) ?? leg.startAt);
    const until = requested > from ? requested : new Date(from.getTime() + 3_600_000);
    const available = await listAvailableVehicles({
      vehicleClassId: details.vehicleClassId,
      countryId: leg.pickup.countryId,
      cityId: leg.pickup.cityId,
      startAt: from.toISOString(),
      endAt: until.toISOString(),
      serviceCode: draft.service_code,
      connection,
      passengerCount: details.passenger?.count ?? 1,
      luggageCount: details.passenger?.luggageCount ?? 0,
    });
    await assertVehicleCapacity(connection,quoted.vehicleId,details.passenger?.count??1,details.passenger?.luggageCount??0);
    if (!available.some((vehicle) => Number(vehicle.id) === Number(quoted.vehicleId))) {
      throw new AppError(
        409,
        'VEHICLE_UNAVAILABLE',
        'The quoted vehicle was booked; request a fresh quote',
      );
    }
  }
  // The PHP Reservation model assigns DL + zero-padded (3614 + reservation ID).
  // Insert with a unique temporary value, then set the number once MySQL has
  // allocated the ID; both statements are part of the checkout transaction.
  const temporaryReservationNo = `DL-TMP-${bookingUuid}`;
  const agencyId = auth.agencyId ?? null;
  const [reservationResult] = await connection.execute(
    `INSERT INTO reservations
      (uuid, reservation_no, service_type, customer_id, agency_id, reservation_form,
       currency, discount, user_id, status, payment_status, payment_method,
       is_pick_up_and_collection, dev_vehicle_reserved, is_invoice, office_location_id,
       invoice_office_id, responsible_person_id, created_at, updated_at, special_note,
       data_sync_to_zoho)
       VALUES (?, ?, ?, ?, ?, 2, ?, 0, ?, ?, 0, 0, 0, 0, 0, 1, 0, 0, NOW(), NOW(), ?, 0)`,
    [
      bookingUuid,
      temporaryReservationNo,
      legacyServiceId,
      draft.customer_id,
      agencyId,
      quote.currency === 'CHF' ? 'CHF' : '€',
      auth.userId,
      LEGACY_RESERVATION_STATUS.PENDING,
      details.notes ?? null,
    ],
  );
  const reservationId = reservationResult.insertId;
  await reserveNativeCoupon(connection,{draft,quote,reservationId,actorUserId:auth.userId});
  const reservationNo = legacyReservationNumber(reservationId);
  const [conflicts] = await connection.execute(
    'SELECT id FROM reservations WHERE reservation_no=? AND id<>? LIMIT 1',
    [reservationNo, reservationId],
  );
  if (conflicts.length) {
    throw new AppError(
      409,
      'RESERVATION_NUMBER_CONFLICT',
      'A legacy reservation already uses this number',
    );
  }
  await connection.execute('UPDATE reservations SET reservation_no=? WHERE id=?', [
    reservationNo,
    reservationId,
  ]);
  // Store the mobile metadata on the same legacy reservation row. The
  // website's numeric `status` and `service_type` are left unchanged.
  await connection.execute(
    `UPDATE reservations
        SET service_code=?, source_channel=?, created_by_user_id=?,
            created_by_agent_id=?, lifecycle_status='PAYMENT_PENDING',
            currency_code=?, quote_snapshot_id=?, updated_at=NOW()
      WHERE id=?`,
    [
      draft.service_code,
      auth.role === 4 ? 'AGENCY_AGENT_APP' : 'CLIENT_APP',
      auth.userId,
      auth.agentId ?? null,
      quote.currency,
      draft.quote_snapshot_id,
      reservationId,
    ],
  );

  for (const [index, leg] of details.legs.entries()) {
    const endAt =
      effectiveLegEndAt(draft.service_code, leg) ??
      new Date(new Date(leg.startAt).getTime() + 3_600_000).toISOString();
    const legQuote = quote.legs[index];
    const [detailResult] = await connection.execute(
      `INSERT INTO reservation_details
        (reservation_id, is_extra_service, days, is_hourly, approximate_distance,
         pick_up_location, drop_off_location, pick_up_date, drop_off_date, pick_up_time,
         drop_off_time, pick_up_country_id, drop_off_country_id, pick_up_city,
         drop_off_city, pick_up_city_id, drop_off_city_id, service_details,
         provider_cost, status, is_delete_history, created_at, updated_at, special_note)
       VALUES (?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 0, NOW(), NOW(), ?)`,
      [
        reservationId,
        billableUnits({
          serviceCode: draft.service_code,
          startAt: leg.startAt,
          endAt,
          requestedHours: leg.requestedHours,
        }),
        leg.isHourly ? 1 : 0,
        legQuote.distanceKm ?? 0,
        leg.pickup.address,
        leg.dropoff?.address ?? null,
        sqlDate(leg.startAt),
        sqlDate(endAt),
        sqlTime(leg.startAt),
        sqlTime(endAt),
        leg.pickup.countryId,
        leg.dropoff?.countryId ?? leg.pickup.countryId,
        leg.pickup.city ?? null,
        leg.dropoff?.city ?? null,
        leg.pickup.cityId ?? 0,
        leg.dropoff?.cityId ?? 0,
        JSON.stringify(details.passenger ?? {}),
        leg.notes ?? null,
      ],
    );
    const detailId = detailResult.insertId;
    await connection.execute(
      `UPDATE reservation_details
          SET sequence_no=?, vehicle_class_id=?, passenger_count=?, luggage_count=?,
              pickup_details=?, dropoff_details=?, flight_number=?,
              mobile_leg_status='PENDING', updated_at=NOW()
        WHERE id=? AND reservation_id=?`,
      [
        index + 1,
        details.vehicleClassId,
        details.passenger?.count ?? 1,
        details.passenger?.luggageCount ?? 0,
        JSON.stringify(leg.pickup),
        JSON.stringify(leg.dropoff ?? {}),
        details.passenger?.flightNumber ?? null,
        detailId,
        reservationId,
      ],
    );
    if(details.passenger?.flightNumber)await connection.execute(
      `INSERT INTO reservation_flight_numbers(reservation_id,reservation_details_id,flight_number,created_at,updated_at) VALUES (?,?,?,NOW(),NOW())`,
      [reservationId,detailId,details.passenger.flightNumber]);
    const stops = [...(leg.stops ?? []), ...(leg.dropoff ? [leg.dropoff] : [])];
    for (const [stopIndex, stop] of stops.entries()) {
      await connection.execute(
        `INSERT INTO reservation_itineraries
          (reservation_id, reservation_details_id, reservation_date, full_address,
           country_id, city, distance, duration, status, sort_numer, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NOW(), NOW())`,
        [
          reservationId,
          detailId,
          sqlDate(leg.startAt),
          stop.address,
          stop.countryId ?? null,
          stop.city ?? null,
          stop.distanceKm ?? 0,
          stop.durationMinutes ?? 0,
          stopIndex + 1,
        ],
      );
    }
    const optionalCost = legQuote.lines.taxableOptions + legQuote.lines.nonTaxableOptions;
    await connection.execute(
      `INSERT INTO reservation_costs
        (reservation_id, reservation_details_id, discount, base_rate, base_tax,
         optional_cost, one_way_drop_off_charge, car_with_driver_extra_cost,
         insurance_cost, net_cost, total_tax, total_amount, user_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [
        reservationId,
        detailId,
        quote.__native?.discounts?.[index] ?? 0,
        legQuote.lines.baseRate,
        legQuote.lines.totalTax,
        optionalCost,
        legQuote.lines.oneWayCharge,
        legQuote.lines.chauffeurExtraCost,
        legQuote.lines.insuranceCost,
        draft.service_code==='CAR_RENTAL' ? legQuote.lines.netCost+legQuote.lines.totalTax : legQuote.lines.netCost,
        legQuote.lines.totalTax,
        legQuote.lines.total,
        auth.userId,
      ],
    );
    await connection.execute(
      `INSERT INTO reservation_taxes
        (reservation_id,reservation_details_id,tax,status,created_at,updated_at)
       VALUES (?,?,?,1,NOW(),NOW())`,
      [
        reservationId,
        detailId,
        legQuote.lines.taxes.reduce((sum, tax) => sum + tax.ratePercent, 0),
      ],
    );
    for (const option of legQuote.lines.options) {
      await connection.execute(
        `INSERT INTO reservation_optional_costs
          (reservation_id,rental_option_id,reservation_details_id,rental_option_text,rent_type,
           rate_type,quantity,based_on,amount,total_amount,status,user_id,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,?,NOW(),NOW())`,
        [
          reservationId,
          option.optionId,
          detailId,
          option.title,
          LEGACY_SERVICE_TYPES[draft.service_code],
          option.rateType,
          option.quantity,
          option.basedOn,
          option.unitAmount,
          option.amount,
          auth.userId,
        ],
      );
    }
    await connection.execute(
      `INSERT INTO reservation_vehicles
        (reservation_id,reservation_details_id,vehicle_id,pick_up_date,drop_off_date,
         pick_up_time,drop_off_time,status,user_id,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,1,?,NOW(),NOW())`,
      [
        reservationId,
        detailId,
        legQuote.vehicleId,
        sqlDate(leg.startAt),
        sqlDate(endAt),
        sqlTime(leg.startAt),
        sqlTime(endAt),
        auth.userId,
      ],
    );
    const firstDay = new Date(`${sqlDate(leg.startAt)}T00:00:00Z`);
    const lastDay = new Date(`${sqlDate(endAt)}T00:00:00Z`);
    if ((lastDay - firstDay) / 86_400_000 > 365) {
      throw new AppError(
        422,
        'TRIP_TOO_LONG',
        'Trips longer than one year need Operations pricing',
      );
    }
    for (let day = new Date(firstDay); day <= lastDay; day.setUTCDate(day.getUTCDate() + 1)) {
      await connection.execute(
        `INSERT INTO vehicle_reserved_dates
          (reservation_id,reservation_detail_id,vehicle_id,reserved_date,type,created_at,updated_at)
         VALUES (?,?,?,?,1,NOW(),NOW())`,
        [reservationId, detailId, legQuote.vehicleId, day.toISOString().slice(0, 10)],
      );
    }
    if (legQuote.insuranceType !== 'NONE') {
      await connection.execute(
        `INSERT INTO reservation_insurances
          (reservation_id,reservation_details_id,vehicle_id,vehicle_insurance_text,
           vehicle_insurance_amount,vehicle_insurance_text_en,vehicle_insurance_text_de,
           vehicle_insurance_text_fr,status,user_id,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,1,?,NOW(),NOW())`,
        [
          reservationId,
          detailId,
          legQuote.vehicleId,
          legQuote.insuranceType,
          legQuote.lines.insuranceCost,
          legQuote.insuranceText?.en,
          legQuote.insuranceText?.de,
          legQuote.insuranceText?.fr,
          auth.userId,
        ],
      );
    }
  }
  if (quote.legs.some((leg) => leg.isPickupAndCollection)) {
    await connection.execute('UPDATE reservations SET is_pick_up_and_collection=1 WHERE id=?', [
      reservationId,
    ]);
  }
  await recordBookingStatusEvent(connection, {
    reservationId,
    status: 'PAYMENT_PENDING',
    actorUserId: auth.userId,
    note: 'Booking created from mobile application',
  });
  await syncNativeCommissions(connection,reservationId,auth.userId);
  return { reservationId, reservationNo };
};
