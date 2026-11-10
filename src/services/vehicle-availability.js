import { query } from '../db/pool.js';
import { LEGACY_SERVICE_TYPES } from './legacy-pricing-rules.js';

const sqlDateTime = (iso) => new Date(iso).toISOString().slice(0, 19).replace('T', ' ');

const vehicleLocationFilter = ({ alias, countryId, cityId }) => {
  if (!countryId) return { sql: '', params: [] };
  const clauses = [];
  const params = [];
  if (countryId) {
    clauses.push(`(available_city.country_id=? OR UPPER(TRIM(available_vehicle_city.country))=(SELECT UPPER(code) FROM countries WHERE id=? AND status=1 AND deleted_at IS NULL))`);
    params.push(countryId);
    params.push(countryId);
  }
  return {
    sql: `AND EXISTS (
      SELECT 1
        FROM vehicle_cities available_vehicle_city
        LEFT JOIN cities available_city ON available_city.id=available_vehicle_city.city_id
         AND available_city.status=1 AND available_city.deleted_at IS NULL
       WHERE available_vehicle_city.vehicle_id=${alias}.id
         AND available_vehicle_city.deleted_at IS NULL
         AND ${clauses.join(' AND ')}
    )`,
    params,
  };
};

export const listAvailableVehicles = async ({
  vehicleClassId,
  countryId,
  cityId,
  startAt,
  endAt,
  connection,
  excludeReservationDetailId,
  serviceCode,
  passengerCount = null,
  luggageCount = 0,
}) => {
  const start = sqlDateTime(startAt);
  const end = sqlDateTime(endAt);
  const location = vehicleLocationFilter({ alias: 'v', countryId, cityId });
  const serviceType = serviceCode ? LEGACY_SERVICE_TYPES[serviceCode] : null;
  const run = connection
    ? async (sql, params) => connection.execute(sql, params).then(([rows]) => rows)
    : query;
  return run(
    `SELECT v.id,v.vehicle_class_id AS vehicleClassId,v.title,v.thumbnail,v.model,v.year,
            v.reg_no AS registrationNumber,v.current_location AS currentLocation,v.provider_id AS providerId
       FROM vehicles v
      WHERE v.vehicle_class_id=? AND v.status=1 AND v.online_booking_status=1
        AND v.deleted_at IS NULL
        AND (v.doa_fleet IS NULL OR v.doa_fleet<=DATE(?))
        ${passengerCount != null ? `AND EXISTS (SELECT 1 FROM vehicle_dimensions vd WHERE vd.vehicle_id=v.id
          AND vd.seating_capacity REGEXP '^[0-9]+$' AND CAST(vd.seating_capacity AS UNSIGNED)>=?
          ${Number(luggageCount)>0 ? `AND vd.boot_capacity REGEXP '^[0-9]+$' AND CAST(vd.boot_capacity AS UNSIGNED)>=?` : ''})` : ''}
        ${
          serviceType
            ? `AND EXISTS (SELECT 1 FROM vehicle_service_types vst
                          WHERE vst.vehicle_id=v.id AND vst.service_type=?)`
            : ''
        }
        ${location.sql}
        AND NOT EXISTS (
          SELECT 1 FROM vehicle_blocks vb
           WHERE vb.vehicle_id=v.id
             AND TIMESTAMP(vb.start_date,COALESCE(vb.start_time,'00:00:00')) < ?
             AND TIMESTAMP(vb.end_date,COALESCE(vb.end_time,'23:59:59')) > ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM vehicle_reserved_dates vrd
           WHERE vrd.vehicle_id=v.id AND vrd.reserved_date BETWEEN DATE(?) AND DATE(?)
             AND NOT EXISTS(SELECT 1 FROM reservations cancelled WHERE cancelled.id=vrd.reservation_id AND (cancelled.status=3 OR cancelled.deleted_at IS NOT NULL))
             AND NOT EXISTS(SELECT 1 FROM reservation_details retired WHERE retired.id=vrd.reservation_detail_id AND (retired.status<>1 OR retired.deleted_at IS NOT NULL))
             ${excludeReservationDetailId ? 'AND vrd.reservation_detail_id<>?' : ''}
        )
        AND NOT EXISTS (
          SELECT 1 FROM reservation_vehicles rv
           WHERE rv.vehicle_id=v.id AND rv.status=1 AND rv.deleted_at IS NULL
             AND EXISTS(SELECT 1 FROM reservations live_parent WHERE live_parent.id=rv.reservation_id AND live_parent.status<>3 AND live_parent.deleted_at IS NULL)
             AND EXISTS(SELECT 1 FROM reservation_details live_leg WHERE live_leg.id=rv.reservation_details_id AND live_leg.status=1 AND live_leg.deleted_at IS NULL)
             ${excludeReservationDetailId ? 'AND rv.reservation_details_id<>?' : ''}
             AND TIMESTAMP(rv.pick_up_date,COALESCE(rv.pick_up_time,'00:00:00')) < ?
             AND TIMESTAMP(COALESCE(rv.drop_off_date,rv.pick_up_date),COALESCE(rv.drop_off_time,'23:59:59')) > ?
        )
      ORDER BY ${cityId ? `(EXISTS (SELECT 1 FROM vehicle_original_cities home WHERE home.vehicle_id=v.id AND home.city_id=? AND home.deleted_at IS NULL)) DESC,` : ''}
        v.title,v.model,v.year DESC`,
    [
      vehicleClassId,
      start,
      ...(passengerCount != null ? [passengerCount,...(Number(luggageCount)>0?[luggageCount]:[])] : []),
      ...(serviceType ? [serviceType] : []),
      ...location.params,
      end,
      start,
      start,
      end,
      ...(excludeReservationDetailId ? [excludeReservationDetailId] : []),
      ...(excludeReservationDetailId ? [excludeReservationDetailId] : []),
      end,
      start,
      ...(cityId ? [cityId] : []),
    ],
  );
};

export const hasAvailableVehicle = async ({
  vehicleClassId,
  countryId,
  cityId,
  startAt,
  endAt,
  connection,
  excludeReservationDetailId,
  serviceCode,
}) =>
  (
    await listAvailableVehicles({
      vehicleClassId,
      countryId,
      cityId,
      startAt,
      endAt,
      connection,
      excludeReservationDetailId,
      serviceCode,
    })
  ).length > 0;

export const availableClassSql = ({ withDates, withCity }) => `
  AND EXISTS (
    SELECT 1 FROM vehicles av
     WHERE av.vehicle_class_id=vc.id AND av.status=1 AND av.online_booking_status=1
       AND av.deleted_at IS NULL
       AND (av.doa_fleet IS NULL OR av.doa_fleet<=?)
       AND EXISTS (SELECT 1 FROM vehicle_dimensions vd WHERE vd.vehicle_id=av.id
         AND vd.seating_capacity REGEXP '^[0-9]+$' AND CAST(vd.seating_capacity AS UNSIGNED)>=?)
       AND EXISTS (SELECT 1 FROM vehicle_service_types vst
                    WHERE vst.vehicle_id=av.id AND vst.service_type=?)
       AND EXISTS (
         SELECT 1
           FROM vehicle_cities available_vehicle_city
           LEFT JOIN cities available_city ON available_city.id=available_vehicle_city.city_id
            AND available_city.status=1 AND available_city.deleted_at IS NULL
          WHERE available_vehicle_city.vehicle_id=av.id
            AND available_vehicle_city.deleted_at IS NULL
            AND (available_city.country_id=? OR UPPER(TRIM(available_vehicle_city.country))=(SELECT UPPER(code) FROM countries WHERE id=? AND status=1 AND deleted_at IS NULL))
       )
       ${
         withDates
           ? `AND NOT EXISTS (
                SELECT 1 FROM vehicle_blocks vb
                 WHERE vb.vehicle_id=av.id
                   AND TIMESTAMP(vb.start_date,COALESCE(vb.start_time,'00:00:00')) < ?
                   AND TIMESTAMP(vb.end_date,COALESCE(vb.end_time,'23:59:59')) > ?
              )
              AND NOT EXISTS (
                SELECT 1 FROM vehicle_reserved_dates vrd
                 WHERE vrd.vehicle_id=av.id AND vrd.reserved_date BETWEEN DATE(?) AND DATE(?)
                   AND NOT EXISTS(SELECT 1 FROM reservations cancelled WHERE cancelled.id=vrd.reservation_id AND (cancelled.status=3 OR cancelled.deleted_at IS NOT NULL))
                   AND NOT EXISTS(SELECT 1 FROM reservation_details retired WHERE retired.id=vrd.reservation_detail_id AND (retired.status<>1 OR retired.deleted_at IS NOT NULL))
              )
              AND NOT EXISTS (
                SELECT 1 FROM reservation_vehicles rv
                 WHERE rv.vehicle_id=av.id AND rv.status=1 AND rv.deleted_at IS NULL
                   AND EXISTS(SELECT 1 FROM reservations live_parent WHERE live_parent.id=rv.reservation_id AND live_parent.status<>3 AND live_parent.deleted_at IS NULL)
                   AND EXISTS(SELECT 1 FROM reservation_details live_leg WHERE live_leg.id=rv.reservation_details_id AND live_leg.status=1 AND live_leg.deleted_at IS NULL)
                   AND TIMESTAMP(rv.pick_up_date,COALESCE(rv.pick_up_time,'00:00:00')) < ?
                   AND TIMESTAMP(COALESCE(rv.drop_off_date,rv.pick_up_date),COALESCE(rv.drop_off_time,'23:59:59')) > ?
              )`
           : ''
       }
  )`;

export const availabilityDateParams = (startAt, endAt) => {
  const start = sqlDateTime(startAt);
  const end = sqlDateTime(endAt);
  return [end, start, start, end, end, start];
};
