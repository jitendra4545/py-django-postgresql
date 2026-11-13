import {describe,it,expect} from 'vitest';
import {websiteVehiclePredicate,availabilityDateParams,listAvailableVehicles} from '../src/services/vehicle-availability.js';

describe('website search policy',()=>{
 it('uses website country, service and inclusive reserved-date predicates',()=>{
  const sql=websiteVehiclePredicate({withDates:true});
  expect(sql).toContain('vehicle_cities');expect(sql).toContain('vehicle_service_types');expect(sql).toContain('vehicle_reserved_dates');
  expect(sql).toMatch(/vehicle_blocks/);expect(sql).toMatch(/doa_fleet/);expect(sql).toMatch(/reservation_vehicles/);expect(sql).not.toMatch(/vehicle_dimensions/);
  expect(availabilityDateParams('2027-09-01T10:00:00Z','2027-09-02T12:00:00Z')).toEqual(['2027-09-01 10:00:00','2027-09-02 12:00:00','2027-09-01 10:00:00','2027-09-01 10:00:00','2027-09-02 12:00:00',0,0,'2027-09-02 12:00:00','2027-09-01 10:00:00']);
 });
 it('applies the same date exclusions during checkout and retains city preference',async()=>{
  let captured;
  const connection={execute:async(sql,params)=>{captured={sql,params};return [[{id:9}]];}};
  const rows=await listAvailableVehicles({connection,vehicleClassId:3,countryId:2,cityId:4,serviceCode:'CHAUFFEUR',startAt:'2027-09-01T10:00:00Z',endAt:'2027-09-01T12:00:00Z',excludeReservationDetailId:12});
  expect(rows).toEqual([{id:9}]);expect(captured.params).toEqual([3,1,2,...availabilityDateParams('2027-09-01T10:00:00Z','2027-09-01T12:00:00Z',12),null,4]);
  expect(captured.sql).toContain('home.locality=COALESCE');expect(captured.sql).toContain('COALESCE(busy.reservation_detail_id,0)<>?');
  expect((captured.sql.match(/\?/g)||[]).length).toBe(captured.params.length);
 });
});
