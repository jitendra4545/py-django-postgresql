// Read-only comparison of website country/date candidates with the mobile API.
import request from 'supertest';
import app from '../src/app.js';
import {pool,query} from '../src/db/pool.js';
import {websiteVehiclePredicate,availabilityDateParams} from '../src/services/vehicle-availability.js';
import {LEGACY_SERVICE_TYPES} from '../src/services/legacy-pricing-rules.js';
const arg=name=>{const i=process.argv.indexOf('--'+name);return i<0?null:process.argv[i+1];};
const countryId=Number(arg('country-id')),serviceCode=arg('service-code')??'CHAUFFEUR',startAt=arg('start-at'),endAt=arg('end-at');
if(!countryId||!LEGACY_SERVICE_TYPES[serviceCode]||!startAt||!endAt)throw Error('Use --country-id ID --service-code CHAUFFEUR|TRANSFER|CAR_RENTAL --start-at ISO --end-at ISO');
try{
 const website=await query(`SELECT vc.id,vc.title FROM vehicle_classes vc WHERE vc.status=1 AND vc.deleted_at IS NULL AND vc.rental_type=?
 AND EXISTS(SELECT 1 FROM vehicle_class_countries cc WHERE cc.vehicle_class_id=vc.id AND cc.country_id=? AND cc.deleted_at IS NULL)
 AND EXISTS(SELECT 1 FROM vehicles v WHERE v.vehicle_class_id=vc.id AND ${websiteVehiclePredicate({withDates:true})}) ORDER BY vc.id`,
 [LEGACY_SERVICE_TYPES[serviceCode],countryId,LEGACY_SERVICE_TYPES[serviceCode],countryId,...availabilityDateParams(startAt,endAt)]);

 const response=await request(app).get('/api/v1/catalog/vehicle-classes').query({countryId,serviceCode,startAt,endAt,...(arg('city-id')?{cityId:arg('city-id')}:{})});
 if(response.status!==200)throw Error(JSON.stringify(response.body));
 const mobile=response.body.items,ids=new Set(mobile.map(c=>c.id)),websiteIds=new Set(website.map(c=>c.id));
 const observed=arg('website-class-ids')?.split(',').map(value=>Number(value.trim()));
 if(observed?.some(id=>!Number.isInteger(id)||id<=0))throw Error('--website-class-ids must contain positive class IDs separated by commas');
 const observedIds=observed?new Set(observed):null;
 console.log(JSON.stringify({websiteCandidateCount:website.length,mobileCandidateCount:mobile.length,
   missingFromMobile:website.filter(c=>!ids.has(c.id)),extraInMobile:mobile.filter(c=>!websiteIds.has(c.id)),
   websiteCandidates:website,mobileClasses:mobile,
   ...(observedIds?{observedWebsiteComparison:{missingFromMobile:[...observedIds].filter(id=>!ids.has(id)),extraInMobile:mobile.filter(c=>!observedIds.has(c.id))}}:{}),
   note:serviceCode==='CAR_RENTAL'
    ?'websiteCandidates are physical fleet candidates before website price filtering. Rental mobile results also require a positive active rate for the pickup season and nearest duration band; physical candidates omitted for that reason are expected. Pass --website-class-ids with actual website class IDs for a live result comparison.'
    :'Compares the agreed physical inventory policy consumed by Laravel and Node. Indicative classes still require a valid final draft quote; pass --website-class-ids for comparison with actual website result IDs.'},null,2));
}finally{await pool.end();}
