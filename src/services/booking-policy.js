import fs from 'node:fs';
export const BOOKING_POLICY=Object.freeze(JSON.parse(fs.readFileSync(new URL('../../config/booking-policy.json',import.meta.url),'utf8')));
if(BOOKING_POLICY.taxPolicy!=='BASE_FEE_ONLY'||BOOKING_POLICY.totalRounding!==1)throw Error('Unsupported booking policy; update both adapters and parity fixtures before changing it');
