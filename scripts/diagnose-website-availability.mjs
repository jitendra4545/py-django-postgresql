// Read-only. Uses the actual public mobile route, then explains native candidates.
import { parseArgs } from 'node:util';
import express from 'express';
import supertest from 'supertest';
import { z } from 'zod';
import { pool, query } from '../src/db/pool.js';
import catalog from '../src/modules/catalog.js';
import { errorHandler } from '../src/middleware/error-handler.js';
import { LEGACY_SERVICE_TYPES } from '../src/services/legacy-pricing-rules.js';
import { listAvailableVehicles } from '../src/services/vehicle-availability.js';

const { values }=parseArgs({options:{'country-id':{type:'string'},'city-id':{type:'string'},'service-code':{type:'string'},
  'start-at':{type:'string'},'end-at':{type:'string'},'passenger-count':{type:'string',default:'1'}}});
try {
  const input=z.object({countryId:z.coerce.number().int().positive(),cityId:z.coerce.number().int().positive().optional(),
    serviceCode:z.enum(['CHAUFFEUR','TRANSFER','CAR_RENTAL']),startAt:z.iso.datetime(),endAt:z.iso.datetime(),passengerCount:z.coerce.number().int().positive()})
    .refine(v=>new Date(v.endAt)>new Date(v.startAt),'End must be after start').parse({countryId:values['country-id'],cityId:values['city-id'],
      serviceCode:values['service-code'],startAt:values['start-at'],endAt:values['end-at'],passengerCount:values['passenger-count']});
  const app=express();app.use('/catalog',catalog);app.use(errorHandler);
  const response=await supertest(app).get('/catalog/vehicle-classes').query(input);
  if(response.status!==200)throw new Error(JSON.stringify(response.body));
  const [country]=await query('SELECT id,code,name FROM countries WHERE id=?',[input.countryId]);
  const type=LEGACY_SERVICE_TYPES[input.serviceCode],start=input.startAt.slice(0,19).replace('T',' '),end=input.endAt.slice(0,19).replace('T',' ');
  const rows=await query(`SELECT v.id AS vehicleId,vc.id AS classId,vc.title AS classTitle,
    (vc.status=1 AND vc.deleted_at IS NULL) AS classActive,(vc.can_reservation_from_website=1) AS classOnline,
    (v.status=1 AND v.deleted_at IS NULL) AS vehicleActive,(v.online_booking_status=1) AS vehicleOnline,
    (v.doa_fleet IS NULL OR v.doa_fleet<=DATE(?)) AS inFleet,
    EXISTS(SELECT 1 FROM vehicle_dimensions vd WHERE vd.vehicle_id=v.id AND vd.seating_capacity REGEXP '^[0-9]+$'
      AND CAST(vd.seating_capacity AS UNSIGNED)>=?) AS enoughSeats,
    EXISTS(SELECT 1 FROM vehicle_class_countries c WHERE c.vehicle_class_id=vc.id AND c.country_id=? AND c.deleted_at IS NULL) AS classCountry,
    EXISTS(SELECT 1 FROM vehicle_service_types s WHERE s.vehicle_id=v.id AND s.service_type=?) AS serviceAllowed,
    EXISTS(SELECT 1 FROM vehicle_cities c WHERE c.vehicle_id=v.id AND c.deleted_at IS NULL AND c.country=?) AS websiteCountry,
    EXISTS(SELECT 1 FROM vehicle_cities c LEFT JOIN cities ct ON ct.id=c.city_id AND ct.status=1 AND ct.deleted_at IS NULL
      WHERE c.vehicle_id=v.id AND c.deleted_at IS NULL AND (ct.country_id=? OR UPPER(TRIM(c.country))=UPPER(?))) AS mobileCountry,
    NOT EXISTS(SELECT 1 FROM vehicle_reserved_dates b WHERE b.vehicle_id=v.id AND b.reserved_date BETWEEN DATE(?) AND DATE(?)) AS websiteDatesFree,
    NOT EXISTS(SELECT 1 FROM vehicle_blocks b WHERE b.vehicle_id=v.id AND TIMESTAMP(b.start_date,COALESCE(b.start_time,'00:00:00'))<?
      AND TIMESTAMP(b.end_date,COALESCE(b.end_time,'23:59:59'))>?) AS noManualBlock,
    (EXISTS(SELECT 1 FROM vehicle_class_price_rates p WHERE p.vehicle_class_id=vc.id AND p.country_id IN (?,0) AND p.rent_type=? AND p.status=1)
      OR (?=3 AND (EXISTS(SELECT 1 FROM vehicle_class_city_wise_base_rates p WHERE p.vehicle_class_id=vc.id AND p.country_id=? AND p.rent_type=3 AND p.deleted_at IS NULL)
      OR EXISTS(SELECT 1 FROM transfer_city_wise_prices p JOIN cities ct ON ct.id IN(p.city_1,p.city_2) WHERE p.vehicle_class_id=vc.id AND ct.country_id=? AND p.deleted_at IS NULL)))) AS rateConfigured
    FROM vehicles v JOIN vehicle_classes vc ON vc.id=v.vehicle_class_id WHERE vc.rental_type=? ORDER BY vc.id,v.id`,
  [start,input.passengerCount,input.countryId,type,country?.code??'',input.countryId,country?.code??'',start,end,end,start,input.countryId,type,type,input.countryId,input.countryId,type]);
  const eligible=new Set();
  for(const classId of new Set(rows.map(r=>r.classId))) {
    for(const v of await listAvailableVehicles({...input,vehicleClassId:classId}))eligible.add(v.id);
  }
  const candidates=rows.map(row=>{
    const excludedBy=Object.keys(row).filter(key=>!['vehicleId','classId','classTitle','websiteCountry','websiteDatesFree'].includes(key)&&!Number(row[key]));
    if(!eligible.has(row.vehicleId)&&!excludedBy.some(k=>['vehicleActive','vehicleOnline','inFleet','enoughSeats','serviceAllowed','mobileCountry','noManualBlock'].includes(k)))excludedBy.push('nativeReservationOrDateConflict');
    const websiteCandidate=['classActive','vehicleActive','vehicleOnline','classCountry','serviceAllowed','websiteCountry','websiteDatesFree'].every(k=>Number(row[k])===1);
    return {...row,websiteCandidateBeforePriceAndViewRules:websiteCandidate,eligiblePhysicalVehicle:eligible.has(row.vehicleId),excludedBy};
  });
  console.log(JSON.stringify({input,country,mobileClassCount:response.body.items.length,mobileClasses:response.body.items,
    eligiblePhysicalVehicleCount:eligible.size,websiteCandidateClassCountBeforePriceAndViewRules:new Set(candidates.filter(r=>r.websiteCandidateBeforePriceAndViewRules).map(r=>r.classId)).size,
    note:'Website candidate count is not a claim about rendered website cards. Its final price >50 rule, requested duration/season, template visibility, and live DB must also match.',candidates},null,2));
} catch(error) { console.error(error.message);process.exitCode=1; }
finally { await pool.end(); }
