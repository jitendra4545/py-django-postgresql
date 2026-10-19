import Decimal from 'decimal.js';
import { AppError } from '../common/errors.js';
import { calculateQuote } from './pricing.js';
import { listAvailableVehicles } from './vehicle-availability.js';
import { getVerifiedRouteKm } from './google-maps.js';
import { billableUnits, LEGACY_SERVICE_TYPES } from './legacy-pricing-rules.js';

const parseJson = (value, fallback = {}) => {
  if (!value) return fallback;
  return typeof value === 'string' ? JSON.parse(value) : value;
};
const sqlDate = (iso) => new Date(iso).toISOString().slice(0, 10);
const sqlTime = (iso) => new Date(iso).toISOString().slice(11, 19);
const asIso = (date, time) => {
  const datePart =
    date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);
  return new Date(`${datePart}T${String(time).slice(0, 8)}Z`).toISOString();
};
const round = (value) => new Decimal(value).toDecimalPlaces(2).toNumber();
const reserveDates = async (connection, { reservationId, detailId, vehicleId, startAt, endAt }) => {
  const day = new Date(`${sqlDate(startAt)}T00:00:00Z`);
  const last = new Date(`${sqlDate(endAt)}T00:00:00Z`);
  if ((last - day) / 86_400_000 > 365) {
    throw new AppError(422, 'TRIP_TOO_LONG', 'Trips longer than one year need Operations pricing');
  }
  for (; day <= last; day.setUTCDate(day.getUTCDate() + 1)) {
    await connection.execute(
      `INSERT INTO vehicle_reserved_dates
       (reservation_id,reservation_detail_id,vehicle_id,reserved_date,type,created_at,updated_at)
       VALUES (?,?,?,?,1,NOW(),NOW())`,
      [reservationId, detailId, vehicleId, day.toISOString().slice(0, 10)],
    );
  }
};

export const applyApprovedBookingChange = async (connection, { changeRequest, actorUserId }) => {
  const changes = parseJson(changeRequest.requested_changes);
  const [reservations] = await connection.execute(
    `SELECT r.*,arm.service_code,arm.lifecycle_status
       FROM reservations r
       JOIN app_reservation_meta arm ON arm.reservation_id=r.id
      WHERE r.id=? FOR UPDATE`,
    [changeRequest.reservation_id],
  );
  const reservation = reservations[0];
  if (!reservation) throw new AppError(404, 'BOOKING_NOT_FOUND', 'Booking not found');
  const [draftRows] = await connection.execute(
    `SELECT id,details FROM app_booking_drafts WHERE reservation_id=? ORDER BY id DESC LIMIT 1 FOR UPDATE`,
    [reservation.id],
  );
  const draft = draftRows[0];
  const draftDetails = parseJson(draft?.details);
  const optionSelections = changes.options ?? draftDetails.options ?? [];

  const [rows] = await connection.execute(
    `SELECT rd.*,rlm.vehicle_class_id,rlm.pickup_details,rlm.dropoff_details,
            rlm.passenger_count,rlm.luggage_count,rlm.flight_number
       FROM reservation_details rd
       JOIN app_reservation_leg_meta rlm ON rlm.reservation_details_id=rd.id
      WHERE rd.reservation_id=? AND rd.deleted_at IS NULL
      ORDER BY rlm.sequence_no FOR UPDATE`,
    [reservation.id],
  );
  if (!rows.length) throw new AppError(422, 'BOOKING_HAS_NO_LEGS', 'Booking has no active legs');

  const knownIds = new Set(rows.map((row) => Number(row.id)));
  for (const leg of changes.legs ?? []) {
    if (!knownIds.has(Number(leg.detailId))) {
      throw new AppError(
        422,
        'INVALID_BOOKING_LEG',
        `Leg ${leg.detailId} does not belong to booking`,
      );
    }
  }

  const [beforeRows] = await connection.execute(
    'SELECT COALESCE(SUM(total_amount),0) AS total FROM reservation_costs WHERE reservation_id=? AND status=1',
    [reservation.id],
  );
  const beforeTotal = round(beforeRows[0].total);
  if (Object.hasOwn(changes, 'notes')) {
    await connection.execute(
      'UPDATE reservations SET special_note=?,updated_by=?,updated_at=NOW() WHERE id=?',
      [changes.notes ?? null, actorUserId, reservation.id],
    );
  }

  let requiresReassignment = false;
  let pickupCollection = false;
  let afterTotal = 0;
  for (const row of rows) {
    const requested =
      (changes.legs ?? []).find((leg) => Number(leg.detailId) === Number(row.id)) ?? {};
    const currentPassenger = parseJson(row.service_details);
    const passenger = { ...currentPassenger, ...(changes.passenger ?? {}) };
    const pickup = { ...parseJson(row.pickup_details), ...(requested.pickup ?? {}) };
    const currentDropoff = parseJson(row.dropoff_details);
    const mergedDropoff = { ...currentDropoff, ...(requested.dropoff ?? {}) };
    const dropoff =
      requested.dropoff === null || Object.keys(mergedDropoff).length === 0 ? null : mergedDropoff;
    if (!pickup.address || !pickup.countryId) {
      throw new AppError(422, 'INVALID_PICKUP', 'Pickup address and country are required');
    }
    if (dropoff && (!dropoff.address || !dropoff.countryId)) {
      throw new AppError(422, 'INVALID_DROPOFF', 'Drop-off address and country are required');
    }
    const currentStart = asIso(row.pick_up_date, row.pick_up_time);
    const currentEnd = asIso(row.drop_off_date, row.drop_off_time);
    const startAt = requested.startAt ?? currentStart;
    const endAt = requested.endAt ?? currentEnd;
    const vehicleClassId = changes.vehicleClassId ?? row.vehicle_class_id;
    const [currentVehicles] = await connection.execute(
      'SELECT vehicle_id FROM reservation_vehicles WHERE reservation_details_id=? AND status=1 AND deleted_at IS NULL LIMIT 1',
      [row.id],
    );
    const days = billableUnits({
      serviceCode: reservation.service_code,
      startAt,
      endAt,
      requestedHours:
        requested.requestedHours ??
        (reservation.service_code === 'CHAUFFEUR' ? Number(row.days) : undefined),
    });
    if (new Date(endAt) < new Date(startAt)) {
      throw new AppError(422, 'INVALID_BOOKING_DATES', 'Leg end must be after its start');
    }
    const inventoryChanged = Boolean(
      requested.startAt ||
      requested.endAt ||
      requested.pickup ||
      Object.hasOwn(requested, 'dropoff') ||
      Number(vehicleClassId) !== Number(row.vehicle_class_id),
    );
    let replacementVehicleId = null;
    if (inventoryChanged) {
      const criteria = {
        vehicleClassId,
        countryId: pickup.countryId,
        cityId: pickup.cityId,
        startAt,
        endAt,
        serviceCode: reservation.service_code,
        connection,
        excludeReservationDetailId: row.id,
      };
      const [existing] = await connection.execute(
        'SELECT vehicle_id FROM reservation_vehicles WHERE reservation_details_id=? AND status=1 AND deleted_at IS NULL FOR UPDATE',
        [row.id],
      );
      const candidates = await listAvailableVehicles(criteria);
      const preferred = candidates.find(
        (candidate) => Number(candidate.id) === Number(existing?.vehicle_id),
      );
      const candidate = preferred ?? candidates[0];
      if (!candidate)
        throw new AppError(
          409,
          'VEHICLE_UNAVAILABLE',
          `No available vehicle remains for booking leg ${row.id}`,
        );
      await connection.execute('SELECT id FROM vehicles WHERE id=? FOR UPDATE', [candidate.id]);
      if (
        !(await listAvailableVehicles(criteria)).some(
          (item) => Number(item.id) === Number(candidate.id),
        )
      ) {
        throw new AppError(
          409,
          'VEHICLE_UNAVAILABLE',
          'The replacement vehicle was just booked; retry approval',
        );
      }
      replacementVehicleId = candidate.id;
    }
    if (inventoryChanged) requiresReassignment = true;
    const distanceKm = await getVerifiedRouteKm({
      pickup,
      dropoff,
      stops: requested.stops ?? [],
      approximateDistanceKm: requested.approximateDistanceKm ?? row.approximate_distance,
    });

    await connection.execute(
      `UPDATE reservation_details
          SET days=?,is_hourly=?,approximate_distance=?,pick_up_location=?,drop_off_location=?,
              pick_up_date=?,drop_off_date=?,pick_up_time=?,drop_off_time=?,pick_up_country_id=?,
              drop_off_country_id=?,pick_up_city=?,drop_off_city=?,pick_up_city_id=?,drop_off_city_id=?,
              service_details=?,special_note=?,updated_at=NOW()
        WHERE id=?`,
      [
        days,
        (requested.isHourly ?? Boolean(row.is_hourly)) ? 1 : 0,
        distanceKm ?? row.approximate_distance,
        pickup.address,
        dropoff?.address ?? null,
        sqlDate(startAt),
        sqlDate(endAt),
        sqlTime(startAt),
        sqlTime(endAt),
        pickup.countryId,
        dropoff?.countryId ?? pickup.countryId,
        pickup.city ?? null,
        dropoff?.city ?? null,
        pickup.cityId ?? 0,
        dropoff?.cityId ?? 0,
        JSON.stringify(passenger),
        Object.hasOwn(requested, 'notes') ? requested.notes : row.special_note,
        row.id,
      ],
    );
    await connection.execute(
      `UPDATE app_reservation_leg_meta
          SET vehicle_class_id=?,passenger_count=?,luggage_count=?,pickup_details=?,dropoff_details=?,
              flight_number=?,updated_at=NOW()
        WHERE reservation_details_id=?`,
      [
        vehicleClassId,
        passenger.count ?? row.passenger_count,
        passenger.luggageCount ?? row.luggage_count,
        JSON.stringify(pickup),
        JSON.stringify(dropoff ?? {}),
        passenger.flightNumber ?? row.flight_number,
        row.id,
      ],
    );

    if (requested.stops || Object.hasOwn(requested, 'dropoff')) {
      await connection.execute(
        'DELETE FROM reservation_itineraries WHERE reservation_details_id=?',
        [row.id],
      );
      const stops = [...(requested.stops ?? []), ...(dropoff ? [dropoff] : [])];
      for (const [index, stop] of stops.entries()) {
        await connection.execute(
          `INSERT INTO reservation_itineraries
            (reservation_id,reservation_details_id,reservation_date,full_address,country_id,city,
             distance,duration,status,sort_numer,created_at,updated_at)
           VALUES (?,?,?,?,?,?,0,0,1,?,NOW(),NOW())`,
          [
            reservation.id,
            row.id,
            sqlDate(startAt),
            stop.address,
            stop.countryId ?? null,
            stop.city ?? null,
            index + 1,
          ],
        );
      }
    }

    const quote = await calculateQuote({
      serviceCode: reservation.service_code,
      vehicleClassId,
      countryId: pickup.countryId,
      startAt,
      endAt,
      requestedHours:
        requested.requestedHours ??
        (reservation.service_code === 'CHAUFFEUR' ? Number(row.days) : undefined),
      distanceKm,
      insuranceType: changes.insuranceType ?? draftDetails.insuranceType ?? 'NONE',
      pickupCityId: pickup.cityId,
      dropoffCityId: dropoff?.cityId,
      optionSelections,
      vehicleId: replacementVehicleId ?? currentVehicles[0]?.vehicle_id,
      pickup,
      dropoff,
      connection,
    });
    const currency = reservation.currency === 'CHF' ? 'CHF' : 'EUR';
    if (quote.currency !== currency) {
      throw new AppError(
        422,
        'CURRENCY_CHANGE_UNSUPPORTED',
        'A booking change cannot move the reservation to another currency',
      );
    }
    pickupCollection ||= quote.isPickupAndCollection;
    await connection.execute(
      'UPDATE reservation_costs SET status=0,updated_at=NOW() WHERE reservation_details_id=? AND status=1',
      [row.id],
    );
    const optionalCost = quote.lines.taxableOptions + quote.lines.nonTaxableOptions;
    await connection.execute(
      `INSERT INTO reservation_costs
        (reservation_id,reservation_details_id,discount,base_rate,base_tax,optional_cost,
         one_way_drop_off_charge,car_with_driver_extra_cost,insurance_cost,net_cost,total_tax,
         total_amount,user_id,status,created_at,updated_at)
       VALUES (?,?,0,?,?,?,?,?,?,?,?,?, ?,1,NOW(),NOW())`,
      [
        reservation.id,
        row.id,
        quote.lines.baseRate,
        quote.lines.totalTax,
        optionalCost,
        quote.lines.oneWayCharge,
        quote.lines.chauffeurExtraCost,
        quote.lines.insuranceCost,
        quote.lines.netCost,
        quote.lines.totalTax,
        quote.lines.total,
        actorUserId,
      ],
    );
    await connection.execute(
      'UPDATE reservation_taxes SET status=0,updated_at=NOW() WHERE reservation_details_id=? AND status=1',
      [row.id],
    );
    await connection.execute(
      `INSERT INTO reservation_taxes
        (reservation_id,reservation_details_id,tax,status,created_at,updated_at)
       VALUES (?,?,?,1,NOW(),NOW())`,
      [reservation.id, row.id, quote.lines.taxes.reduce((sum, tax) => sum + tax.ratePercent, 0)],
    );
    await connection.execute(
      'UPDATE reservation_optional_costs SET status=0,updated_at=NOW() WHERE reservation_details_id=? AND status=1',
      [row.id],
    );
    for (const option of quote.lines.options) {
      await connection.execute(
        `INSERT INTO reservation_optional_costs
          (reservation_id,rental_option_id,reservation_details_id,rental_option_text,rent_type,
           rate_type,quantity,based_on,amount,total_amount,status,user_id,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,1,?,NOW(),NOW())`,
        [
          reservation.id,
          option.optionId,
          row.id,
          option.title,
          LEGACY_SERVICE_TYPES[reservation.service_code],
          option.rateType,
          option.quantity,
          option.basedOn,
          option.unitAmount,
          option.amount,
          actorUserId,
        ],
      );
    }
    await connection.execute(
      'UPDATE reservation_insurances SET status=0,updated_at=NOW() WHERE reservation_details_id=? AND status=1',
      [row.id],
    );
    if (quote.insuranceType !== 'NONE') {
      const [assigned] = await connection.execute(
        'SELECT vehicle_id FROM reservation_vehicles WHERE reservation_details_id=? AND status=1 AND deleted_at IS NULL LIMIT 1',
        [row.id],
      );
      await connection.execute(
        `INSERT INTO reservation_insurances
         (reservation_id,reservation_details_id,vehicle_id,vehicle_insurance_text,
          vehicle_insurance_amount,vehicle_insurance_text_en,vehicle_insurance_text_de,
          vehicle_insurance_text_fr,status,user_id,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,1,?,NOW(),NOW())`,
        [
          reservation.id,
          row.id,
          replacementVehicleId ?? assigned?.vehicle_id,
          quote.insuranceType,
          quote.lines.insuranceCost,
          quote.insuranceText?.en,
          quote.insuranceText?.de,
          quote.insuranceText?.fr,
          actorUserId,
        ],
      );
    }
    if (inventoryChanged) {
      await connection.execute(
        'UPDATE reservation_vehicles SET status=2,deleted_at=NOW(),updated_at=NOW() WHERE reservation_details_id=? AND status=1',
        [row.id],
      );
      await connection.execute('DELETE FROM vehicle_reserved_dates WHERE reservation_detail_id=?', [
        row.id,
      ]);
      await connection.execute(
        `INSERT INTO reservation_vehicles
         (reservation_id,reservation_details_id,vehicle_id,pick_up_date,drop_off_date,
          pick_up_time,drop_off_time,status,user_id,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,1,?,NOW(),NOW())`,
        [
          reservation.id,
          row.id,
          replacementVehicleId,
          sqlDate(startAt),
          sqlDate(endAt),
          sqlTime(startAt),
          sqlTime(endAt),
          actorUserId,
        ],
      );
      await reserveDates(connection, {
        reservationId: reservation.id,
        detailId: row.id,
        vehicleId: replacementVehicleId,
        startAt,
        endAt,
      });
      if (quote.insuranceType !== 'NONE') {
        await connection.execute(
          'UPDATE reservation_insurances SET vehicle_id=? WHERE reservation_details_id=? AND status=1',
          [replacementVehicleId, row.id],
        );
      }
    }
    afterTotal = round(new Decimal(afterTotal).plus(quote.lines.total));
  }

  if (requiresReassignment) {
    await connection.execute(
      `UPDATE app_driver_assignments SET status='CANCELLED',updated_at=NOW()
        WHERE reservation_id=? AND status NOT IN ('COMPLETED','CANCELLED')`,
      [reservation.id],
    );
  }
  await connection.execute('UPDATE reservations SET is_pick_up_and_collection=? WHERE id=?', [
    pickupCollection ? 1 : 0,
    reservation.id,
  ]);
  if (draft) {
    await connection.execute(
      'UPDATE app_booking_drafts SET details=?,updated_at=NOW() WHERE id=?',
      [
        JSON.stringify({
          ...draftDetails,
          ...(changes.vehicleClassId ? { vehicleClassId: changes.vehicleClassId } : {}),
          ...(changes.passenger
            ? { passenger: { ...(draftDetails.passenger ?? {}), ...changes.passenger } }
            : {}),
          ...(Object.hasOwn(changes, 'notes') ? { notes: changes.notes } : {}),
          options: optionSelections,
          insuranceType: changes.insuranceType ?? draftDetails.insuranceType ?? 'NONE',
        }),
        draft.id,
      ],
    );
  }
  // Operations will reconcile agency_commissions after the approved change.
  return {
    reservationId: reservation.id,
    previousLifecycleStatus: changeRequest.previous_lifecycle_status,
    requiresReassignment,
    currency: reservation.currency === 'CHF' ? 'CHF' : 'EUR',
    beforeTotal,
    afterTotal,
    difference: round(new Decimal(afterTotal).minus(beforeTotal)),
  };
};
