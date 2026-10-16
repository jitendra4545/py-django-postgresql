import { query } from '../db/pool.js';

const sqlDateTime = (iso) => new Date(iso).toISOString().slice(0, 19).replace('T', ' ');

const vehicleLocationFilter = ({ alias, countryId, cityId }) => {
  if (!countryId && !cityId) return { sql: '', params: [] };
  const clauses = [];
  const params = [];
  if (countryId) {
    clauses.push('available_city.country_id=?');
    params.push(countryId);
  }
  if (cityId) {
    clauses.push('available_vehicle_city.city_id=?');
    params.push(cityId);
  }
  return {
    sql: `AND EXISTS (
      SELECT 1
        FROM vehicle_cities available_vehicle_city
        JOIN cities available_city ON available_city.id=available_vehicle_city.city_id
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
}) => {
  const start = sqlDateTime(startAt);
  const end = sqlDateTime(endAt);
  const location = vehicleLocationFilter({ alias: 'v', countryId, cityId });
  const run = connection
    ? async (sql, params) => connection.execute(sql, params).then(([rows]) => rows)
    : query;
  return run(
    `SELECT v.id,v.vehicle_class_id AS vehicleClassId,v.title,v.thumbnail,v.model,v.year,
            v.reg_no AS registrationNumber,v.current_location AS currentLocation,v.provider_id AS providerId
       FROM vehicles v
      WHERE v.vehicle_class_id=? AND v.status=1 AND v.online_booking_status=1
        AND v.deleted_at IS NULL
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
        )
        AND NOT EXISTS (
          SELECT 1 FROM reservation_vehicles rv
           WHERE rv.vehicle_id=v.id AND rv.status=1 AND rv.deleted_at IS NULL
             ${excludeReservationDetailId ? 'AND rv.reservation_details_id<>?' : ''}
             AND TIMESTAMP(rv.pick_up_date,COALESCE(rv.pick_up_time,'00:00:00')) < ?
             AND TIMESTAMP(COALESCE(rv.drop_off_date,rv.pick_up_date),COALESCE(rv.drop_off_time,'23:59:59')) > ?
        )
      ORDER BY v.title,v.model,v.year DESC`,
    [
      vehicleClassId,
      ...location.params,
      end,
      start,
      start,
      end,
      ...(excludeReservationDetailId ? [excludeReservationDetailId] : []),
      end,
      start,
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
    })
  ).length > 0;

export const availableClassSql = ({ withDates, withCity }) => `
  AND EXISTS (
    SELECT 1 FROM vehicles av
     WHERE av.vehicle_class_id=vc.id AND av.status=1 AND av.online_booking_status=1
       AND av.deleted_at IS NULL
       AND EXISTS (
         SELECT 1
           FROM vehicle_cities available_vehicle_city
           JOIN cities available_city ON available_city.id=available_vehicle_city.city_id
            AND available_city.status=1 AND available_city.deleted_at IS NULL
          WHERE available_vehicle_city.vehicle_id=av.id
            AND available_vehicle_city.deleted_at IS NULL
            AND available_city.country_id=?
            ${withCity ? 'AND available_vehicle_city.city_id=?' : ''}
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
              )
              AND NOT EXISTS (
                SELECT 1 FROM reservation_vehicles rv
                 WHERE rv.vehicle_id=av.id AND rv.status=1 AND rv.deleted_at IS NULL
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
