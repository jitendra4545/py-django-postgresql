const parse=value=>typeof value==='string'?JSON.parse(value):value??{};
export function currentNativeLocation(row,kind){
 const prefix=kind==='pickup'?'pick_up':'drop_off';
 const saved=parse(row[kind+'_details']);
 const address=row[prefix+'_location'];
 const countryId=row[prefix+'_country_id'];
 const cityId=row[prefix+'_city_id'];
 const changed=(saved.address!=null&&saved.address!==address)
   || (saved.countryId!=null&&Number(saved.countryId)!==Number(countryId))
   || (saved.cityId!=null&&Number(saved.cityId)!==Number(cityId));
 const result={...saved,address,countryId,cityId};
 if(row[prefix+'_city']!=null)result.city=row[prefix+'_city'];
 if(changed){delete result.placeId;delete result.latitude;delete result.longitude;}
 return result;
}
