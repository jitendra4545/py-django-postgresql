import {BOOKING_POLICY} from './booking-policy.js';
import { query } from '../db/pool.js';
import { LEGACY_SERVICE_TYPES } from './legacy-pricing-rules.js';

export const bookingPolicy=BOOKING_POLICY;
const sqlDateTime=iso=>new Date(iso).toISOString().slice(0,19).replace('T',' ');
// The identical SQL contract is consumed by Laravel SharedBookingPolicy.
export const websiteVehiclePredicate=({alias='v',withDates=false}={})=>
  (bookingPolicy.availabilityBaseSql+(withDates?'\n'+bookingPolicy.availabilityDatesSql:'')).replaceAll('{a}',alias);
export const availabilityDateParams=(startAt,endAt,excludeReservationDetailId=0)=>{
  const start=sqlDateTime(startAt),end=sqlDateTime(endAt),exclude=Number(excludeReservationDetailId)||0;
  return [start,end,start,start,end,exclude,exclude,end,start];
};
export const listAvailableVehicles=async({vehicleClassId,countryId,cityId,cityName,startAt,endAt,connection,excludeReservationDetailId,serviceCode})=>{
  const run=connection?(sql,params)=>connection.execute(sql,params).then(([rows])=>rows):query;
  return run(`SELECT v.id,v.vehicle_class_id AS vehicleClassId,v.title,v.thumbnail,v.model,v.year,
    v.reg_no AS registrationNumber,v.current_location AS currentLocation,v.provider_id AS providerId
    FROM vehicles v WHERE v.vehicle_class_id=? AND ${websiteVehiclePredicate({withDates:true})}
    ORDER BY (EXISTS (SELECT 1 FROM vehicle_original_cities home WHERE home.vehicle_id=v.id AND home.deleted_at IS NULL
      AND home.locality=COALESCE(?,(SELECT name FROM cities WHERE id=?)))) DESC,v.id`,
    [vehicleClassId,LEGACY_SERVICE_TYPES[serviceCode],countryId,...availabilityDateParams(startAt,endAt,excludeReservationDetailId),cityName??null,cityId??null]);
};
export const hasAvailableVehicle=async options=>(await listAvailableVehicles(options)).length>0;
export const availableClassSql=({withDates})=>`AND EXISTS (SELECT 1 FROM vehicles av WHERE av.vehicle_class_id=vc.id AND ${websiteVehiclePredicate({alias:'av',withDates})})`;
