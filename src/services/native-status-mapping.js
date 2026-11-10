export const nativeStatusToMobile = (slug, {driverHistory=false}={}) => {
  const value=String(slug??'').toUpperCase().replaceAll('-','_');
  return ({CONFIRMED:driverHistory?'ACKNOWLEDGED':'ASSIGNED',CONFIRMED_TRIP:'ASSIGNED',COMPLETED_TRIP:'COMPLETED',
    NO_SHOW_CHARGEABLE:'NO_SHOW',CANCELLED_CHARGEABLE:'CANCELLED',NO_SHOW_CHARGEABLE_TRIP:'NO_SHOW',CANCELLED_CHARGEABLE_TRIP:'CANCELLED'})[value]??value;
};

// SQL expression accepts a trusted, code-owned column reference only.
export const mobileStatusSql = column => `CASE UPPER(REPLACE(${column},'-','_'))
 WHEN 'CONFIRMED' THEN 'ASSIGNED' WHEN 'CONFIRMED_TRIP' THEN 'ASSIGNED'
 WHEN 'COMPLETED_TRIP' THEN 'COMPLETED' WHEN 'NO_SHOW_CHARGEABLE' THEN 'NO_SHOW'
 WHEN 'CANCELLED_CHARGEABLE' THEN 'CANCELLED' WHEN 'NO_SHOW_CHARGEABLE_TRIP' THEN 'NO_SHOW'
 WHEN 'CANCELLED_CHARGEABLE_TRIP' THEN 'CANCELLED' ELSE UPPER(REPLACE(${column},'-','_')) END`;
