import { mobileStatusSql } from './native-status-mapping.js';

// The legacy numeric fields and active trip rows are authoritative. Laravel
// does not maintain the optional mobile metadata columns in the supplied dump.
export const nativeServiceCodeSql = (alias = 'r') => `CASE ${alias}.service_type
  WHEN 1 THEN 'CHAUFFEUR' WHEN 2 THEN 'CAR_RENTAL' WHEN 3 THEN 'TRANSFER'
  ELSE ${alias}.service_code END`;
export const nativeCurrencySql = (alias = 'r') => `CASE
  WHEN TRIM(${alias}.currency) IN ('€','EUR') THEN 'EUR'
  ELSE UPPER(TRIM(${alias}.currency)) END`;

export const nativeLegStatusSql = (alias = 'rd') => `CASE
  WHEN (SELECT actor.role FROM users actor WHERE actor.id=${alias}.trip_status_updated_by) IN (1,2)
  THEN COALESCE((SELECT ${mobileStatusSql('s.slug')} FROM reservation_statuses s WHERE s.id=${alias}.trip_status_id LIMIT 1),'CONFIRMED')
  ELSE COALESCE(${alias}.mobile_leg_status,(SELECT ${mobileStatusSql('s.slug')} FROM reservation_statuses s WHERE s.id=${alias}.trip_status_id LIMIT 1),'CONFIRMED') END`;

export const nativeLifecycleSql = (alias = 'r') => `CASE
  WHEN ${alias}.status=3 THEN 'CANCELLED'
  WHEN ${alias}.status=2 THEN 'COMPLETED'
  WHEN EXISTS (SELECT 1 FROM reservation_details d WHERE d.reservation_id=${alias}.id
    AND d.status=1 AND d.deleted_at IS NULL AND COALESCE(d.is_extra_service,0)=0)
    AND NOT EXISTS (SELECT 1 FROM reservation_details d WHERE d.reservation_id=${alias}.id
      AND d.status=1 AND d.deleted_at IS NULL AND COALESCE(d.is_extra_service,0)=0
      AND (${nativeLegStatusSql('d')})<>'COMPLETED') THEN 'COMPLETED'
  WHEN ${alias}.lifecycle_status IN ('CHANGE_REQUESTED','CANCELLATION_REQUESTED','CHANGE_PAYMENT_PENDING')
    THEN ${alias}.lifecycle_status
  WHEN EXISTS (SELECT 1 FROM reservation_details d WHERE d.reservation_id=${alias}.id
    AND d.status=1 AND d.deleted_at IS NULL AND COALESCE(d.is_extra_service,0)=0
    AND (${nativeLegStatusSql('d')}) IN ('OFFERED','ASSIGNED','ACKNOWLEDGED','PREPARING','ON_THE_WAY','ARRIVED',
      'WAITING','PASSENGER_ONBOARD','IN_SERVICE','AT_STOP','DROPOFF_REACHED'))
    THEN (SELECT CASE (${nativeLegStatusSql('d')}) WHEN 'OFFERED' THEN 'ASSIGNED'
      WHEN 'ACKNOWLEDGED' THEN 'ASSIGNED' ELSE (${nativeLegStatusSql('d')}) END
      FROM reservation_details d WHERE d.reservation_id=${alias}.id AND d.status=1 AND d.deleted_at IS NULL
      AND COALESCE(d.is_extra_service,0)=0 AND (${nativeLegStatusSql('d')}) IN
      ('OFFERED','ASSIGNED','ACKNOWLEDGED','PREPARING','ON_THE_WAY','ARRIVED','WAITING','PASSENGER_ONBOARD','IN_SERVICE','AT_STOP','DROPOFF_REACHED')
      ORDER BY d.trip_status_updated_at DESC,d.id DESC LIMIT 1)
  WHEN ${alias}.lifecycle_status IN ('PAYMENT_PENDING','PAYMENT_FAILED','PAYMENT_DUE')
    AND ${alias}.payment_status<>20 THEN ${alias}.lifecycle_status
  WHEN ${alias}.status=1 AND EXISTS (SELECT 1 FROM reservation_drivers dr
    JOIN reservation_details dl ON dl.id=dr.reservation_details_id AND dl.status=1 AND dl.deleted_at IS NULL
    WHERE dr.reservation_id=${alias}.id AND dr.status=1 AND dr.deleted_at IS NULL
      AND (dr.pick_up_driver_id IS NOT NULL OR dr.drop_off_driver_id IS NOT NULL)) THEN 'ASSIGNED'
  WHEN ${alias}.status=1 OR ${alias}.payment_status=20 THEN 'CONFIRMED'
  ELSE 'PAYMENT_DUE' END`;
