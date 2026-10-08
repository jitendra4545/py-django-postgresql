import crypto from 'node:crypto';
import { v4 as uuid } from 'uuid';
import { AppError } from '../common/errors.js';
import { LEGACY_RESERVATION_STATUS } from '../config/constants.js';
import { calculateQuote } from './pricing.js';
import { syncAgencyCommissions } from './commission-service.js';
import { hasAvailableVehicle } from './vehicle-availability.js';

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
  const legQuotes = [];
  for (const [index, leg] of details.legs.entries()) {
    const start = new Date(leg.startAt);
    const requestedEnd = new Date(leg.endAt ?? leg.startAt);
    const end = requestedEnd > start ? requestedEnd : new Date(start.getTime() + 60 * 60_000);
    if (
      !(await hasAvailableVehicle({
        vehicleClassId: details.vehicleClassId,
        startAt: start.toISOString(),
        endAt: end.toISOString(),
      }))
    ) {
      throw new AppError(
        409,
        'VEHICLE_UNAVAILABLE',
        `No available vehicle remains for booking leg ${index + 1}`,
      );
    }
    const days = Math.max(Math.ceil((end - start) / 86_400_000) + 1, 1);
    const quote = await calculateQuote({
      serviceCode: draft.service_code,
      vehicleClassId: details.vehicleClassId,
      countryId: leg.pickup.countryId,
      durationDays: days,
      pickupCityId: leg.pickup.cityId,
      dropoffCityId: leg.dropoff?.cityId,
      optionSelections: details.options ?? [],
    });
    legQuotes.push({ sequenceNo: index + 1, ...quote });
  }
  const total = legQuotes.reduce((sum, leg) => sum + leg.lines.total, 0);
  return {
    currency: 'EUR',
    legs: legQuotes,
    total: Number(total.toFixed(2)),
    validUntil: new Date(Date.now() + 30 * 60_000).toISOString(),
  };
};

const sqlDate = (iso) => new Date(iso).toISOString().slice(0, 10);
const sqlTime = (iso) => new Date(iso).toISOString().slice(11, 19);

export const createLegacyReservation = async (connection, { draft, quote, auth }) => {
  const details = typeof draft.details === 'string' ? JSON.parse(draft.details) : draft.details;
  const service = await connection
    .execute('SELECT legacy_service_id FROM app_service_catalog WHERE code = ?', [
      draft.service_code,
    ])
    .then(([rows]) => rows[0]);
  if (!service?.legacy_service_id) {
    throw new AppError(
      422,
      'SERVICE_NOT_MAPPED',
      'This service is not mapped to a legacy reservation service',
    );
  }
  const bookingUuid = uuid();
  const reservationNo = `DL-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${bookingUuid.slice(0, 8).toUpperCase()}`;
  const agencyId = auth.agencyId ?? null;
  const [reservationResult] = await connection.execute(
    `INSERT INTO reservations
      (uuid, reservation_no, service_type, customer_id, agency_id, reservation_form,
       currency, discount, user_id, status, payment_status, payment_method,
       is_pick_up_and_collection, dev_vehicle_reserved, is_invoice, office_location_id,
       invoice_office_id, responsible_person_id, created_at, updated_at, special_note,
       data_sync_to_zoho)
     VALUES (?, ?, ?, ?, ?, 2, '€', 0, ?, ?, 0, 0, 0, 0, 0, 1, 0, 0, NOW(), NOW(), ?, 0)`,
    [
      bookingUuid,
      reservationNo,
      service.legacy_service_id,
      draft.customer_id,
      agencyId,
      auth.userId,
      LEGACY_RESERVATION_STATUS.PENDING,
      details.notes ?? null,
    ],
  );
  const reservationId = reservationResult.insertId;
  await connection.execute(
    `INSERT INTO app_reservation_meta
      (reservation_id, service_code, source_channel, created_by_user_id, created_by_agent_id,
       lifecycle_status, currency_code, quote_snapshot_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'PAYMENT_PENDING', 'EUR', ?, NOW(), NOW())`,
    [
      reservationId,
      draft.service_code,
      auth.role === 4 ? 'AGENCY_AGENT_APP' : 'CLIENT_APP',
      auth.userId,
      auth.agentId ?? null,
      draft.quote_snapshot_id,
    ],
  );

  for (const [index, leg] of details.legs.entries()) {
    const endAt = leg.endAt ?? leg.startAt;
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
        Math.max(Math.ceil((new Date(endAt) - new Date(leg.startAt)) / 86_400_000) + 1, 1),
        leg.isHourly ? 1 : 0,
        leg.approximateDistanceKm ?? 0,
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
      `INSERT INTO app_reservation_leg_meta
        (reservation_id, reservation_details_id, sequence_no, vehicle_class_id, passenger_count,
         luggage_count, pickup_details, dropoff_details, flight_number, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NOW(), NOW())`,
      [
        reservationId,
        detailId,
        index + 1,
        details.vehicleClassId,
        details.passenger?.count ?? 1,
        details.passenger?.luggageCount ?? 0,
        JSON.stringify(leg.pickup),
        JSON.stringify(leg.dropoff ?? {}),
        details.passenger?.flightNumber ?? null,
      ],
    );
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
    const legQuote = quote.legs[index];
    const optionalCost = legQuote.lines.taxableOptions + legQuote.lines.nonTaxableOptions;
    await connection.execute(
      `INSERT INTO reservation_costs
        (reservation_id, reservation_details_id, discount, base_rate, base_tax,
         optional_cost, one_way_drop_off_charge, car_with_driver_extra_cost,
         insurance_cost, net_cost, total_tax, total_amount, user_id, status, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, 1, NOW(), NOW())`,
      [
        reservationId,
        detailId,
        legQuote.lines.baseRate,
        legQuote.lines.totalTax,
        optionalCost,
        legQuote.lines.baseRate + optionalCost,
        legQuote.lines.totalTax,
        legQuote.lines.total,
        auth.userId,
      ],
    );
  }
  await connection.execute(
    `INSERT INTO app_booking_status_events
      (reservation_id, status, actor_user_id, note, occurred_at, created_at)
     VALUES (?, 'PAYMENT_PENDING', ?, 'Booking created from mobile application', NOW(), NOW())`,
    [reservationId, auth.userId],
  );
  await syncAgencyCommissions(connection, reservationId, auth.userId);
  return { reservationId, reservationNo };
};
