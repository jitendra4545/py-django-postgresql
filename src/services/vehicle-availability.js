import { query } from '../db/pool.js';

const sqlDateTime = (iso) => new Date(iso).toISOString().slice(0, 19).replace('T', ' ');

export const listAvailableVehicles = async ({ vehicleClassId, startAt, endAt }) => {
  const start = sqlDateTime(startAt);
  const end = sqlDateTime(endAt);
  return query(
    `SELECT v.id,v.vehicle_class_id AS vehicleClassId,v.title,v.thumbnail,v.model,v.year,
            v.reg_no AS registrationNumber,v.current_location AS currentLocation,v.provider_id AS providerId
       FROM vehicles v
      WHERE v.vehicle_class_id=? AND v.status=1 AND v.online_booking_status=1
        AND v.deleted_at IS NULL
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
             AND TIMESTAMP(rv.pick_up_date,COALESCE(rv.pick_up_time,'00:00:00')) < ?
             AND TIMESTAMP(COALESCE(rv.drop_off_date,rv.pick_up_date),COALESCE(rv.drop_off_time,'23:59:59')) > ?
        )
      ORDER BY v.title,v.model,v.year DESC`,
    [vehicleClassId, end, start, start, end, end, start],
  );
};

export const hasAvailableVehicle = async ({ vehicleClassId, startAt, endAt }) =>
  (await listAvailableVehicles({ vehicleClassId, startAt, endAt })).length > 0;

export const availableClassSql = (withDates) => `
  AND EXISTS (
    SELECT 1 FROM vehicles av
     WHERE av.vehicle_class_id=vc.id AND av.status=1 AND av.online_booking_status=1
       AND av.deleted_at IS NULL
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
