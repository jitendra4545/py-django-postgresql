import { one, query } from '../db/pool.js';
import { notFound } from '../common/errors.js';
import { LEGACY_SERVICE_TYPES } from './legacy-pricing-rules.js';

export async function loadBookingOptions(vehicleClassId,serviceCode){
  const klass=await one(`SELECT * FROM vehicle_classes WHERE id=? AND rental_type=? AND status=1 AND deleted_at IS NULL`,[vehicleClassId,LEGACY_SERVICE_TYPES[serviceCode]]);
  if(!klass)throw notFound('Vehicle class is not offered for this service');
  const options=await query(`SELECT ro.id,COALESCE(NULLIF(ro.title_en,''),ro.title) AS title,ro.description,
    ro.based_on AS basedOn,ro.rate_type AS rateType,ro.amount,0 AS taxable
    FROM rental_options ro WHERE ro.show_on_frontend=1 AND ro.deleted_at IS NULL
      AND EXISTS(SELECT 1 FROM rental_option_classes pivot WHERE pivot.rental_option_id=ro.id AND pivot.vehicle_class_id=?) ORDER BY title`,[vehicleClassId]);
  const insuranceChoices=[{type:'NONE',title:'No additional insurance',unitAmount:0,billingUnit:'DAY',included:false,description:null}];
  if(serviceCode==='CAR_RENTAL')for(const [type,prefix,title] of [['HALF','half','Half coverage'],['FULL','full','Full coverage']]){
    const description=klass[`${prefix}_insurance_text_en`]??klass[`${prefix}_insurance_text`];
    const amount=klass[`${prefix}_insurance_amount`];
    if(amount!=null&&(Number(amount)>0||String(description??'').trim()))insuranceChoices.push({type,title,unitAmount:Number(amount),billingUnit:'DAY',included:Number(amount)===0,description:description??null});
  }
  return {vehicleClassId:Number(vehicleClassId),serviceCode,options:options.map(option=>({...option,
    billingUnit:Number(option.basedOn)===1?(serviceCode==='CHAUFFEUR'?'HOUR':'DAY'):'BOOKING'})),insuranceChoices:serviceCode==='CAR_RENTAL'?insuranceChoices:[],
    defaultInsuranceType:serviceCode==='CAR_RENTAL'&&insuranceChoices.some(i=>i.type==='HALF'&&i.included)?'HALF':'NONE'};
}
