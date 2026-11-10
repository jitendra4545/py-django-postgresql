// Dedicated additive triggers keep the native service, currency and trip state
// readable by existing mobile contracts. Existing client triggers are preserved.
import {mobileStatusSql} from '../src/services/native-status-mapping.js';
export async function installMetadata(c,paidStatus=20) {
 const base=`SET NEW.service_code=CASE NEW.service_type WHEN 1 THEN 'CHAUFFEUR' WHEN 2 THEN 'CAR_RENTAL' WHEN 3 THEN 'TRANSFER' ELSE NEW.service_code END;
 SET NEW.created_by_user_id=NEW.user_id;
 SET NEW.currency_code=CASE WHEN NEW.currency IN ('€','EUR') THEN 'EUR' ELSE UPPER(NEW.currency) END;`;
 const native=`CASE NEW.status WHEN 3 THEN 'CANCELLED' WHEN 2 THEN 'COMPLETED' WHEN 1 THEN 'CONFIRMED' ELSE 'PAYMENT_PENDING' END`;
 for(const event of ['INSERT','UPDATE']){
  const name='dl_mobile_res_'+event.toLowerCase();await c.query('DROP TRIGGER IF EXISTS '+name);
  const status=event==='INSERT'?`SET NEW.lifecycle_status=COALESCE(NEW.lifecycle_status,${native});`:
  `IF NOT (NEW.status <=> OLD.status) THEN SET NEW.lifecycle_status=${native};
   ELSEIF NEW.lifecycle_status IN ('CONFIRMED','ASSIGNED','PAYMENT_DUE','PREPARING','ON_THE_WAY','ARRIVED','WAITING','PASSENGER_ONBOARD','IN_SERVICE','AT_STOP','DROPOFF_REACHED') AND NOT (NEW.lifecycle_status <=> OLD.lifecycle_status) THEN SET NEW.status=1;
   ELSEIF NEW.lifecycle_status='COMPLETED' THEN SET NEW.status=2;
   ELSEIF NEW.lifecycle_status='CANCELLED' THEN SET NEW.status=3;
   ELSEIF NEW.payment_status=${Number(paidStatus)} AND NOT (NEW.payment_status <=> OLD.payment_status) AND NEW.status=1 AND NEW.lifecycle_status IN ('PAYMENT_PENDING','PAYMENT_FAILED','PAYMENT_DUE') THEN SET NEW.lifecycle_status='CONFIRMED';
   END IF;
   SET NEW.lifecycle_status=COALESCE(NEW.lifecycle_status,${native});`;
  await c.query(`CREATE TRIGGER ${name} BEFORE ${event} ON reservations FOR EACH ROW BEGIN ${base} ${status} END`);
 }
 const states=['ASSIGNED','OFFERED','ACKNOWLEDGED','PREPARING','ON_THE_WAY','ARRIVED','WAITING','PASSENGER_ONBOARD','IN_SERVICE','AT_STOP','DROPOFF_REACHED','COMPLETED','NO_SHOW','CANCELLED'];
 for(const status of states){
  const [found]=await c.execute("SELECT id FROM reservation_statuses WHERE UPPER(REPLACE(slug,'-','_'))=? LIMIT 1",[status]);
  if(!found.length)await c.execute(`INSERT INTO reservation_statuses(name,slug,type,driver_status,sort_order,status,created_at,updated_at) VALUES (?,?,'driver_status',1,0,1,NOW(),NOW())`,[status.replaceAll('_',' '),status.toLowerCase()]);
 }
 // Keep the admin trip selector separate from detailed chauffeur progress.
 // Never take over an existing client driver status with the same unique slug.
 for(const slug of ['confirmed','completed','no_show_chargeable','cancelled_chargeable']){
  const [found]=await c.execute('SELECT id,type FROM reservation_statuses WHERE slug=?',[slug]);
  if(slug.endsWith('_chargeable')&&found[0]&&found[0].type!=='trip_status')throw Error(`Native chargeable status ${slug} has another type; DBA review required`);
  const target=found[0]&&found[0].type!=='trip_status'?`${slug}_trip`:slug;
  await c.execute(`INSERT INTO reservation_statuses(name,slug,type,driver_status,sort_order,status,created_at,updated_at)
    SELECT ?,?,'trip_status',0,0,1,NOW(),NOW() WHERE NOT EXISTS(SELECT 1 FROM reservation_statuses WHERE slug=?)`,
  [slug.replaceAll('_',' '),target,target]);
 }
 for(const event of ['INSERT','UPDATE']){
  const name='dl_mobile_leg_'+event.toLowerCase();await c.query('DROP TRIGGER IF EXISTS '+name);
  const logic=event==='INSERT'?`IF NEW.trip_status_id IS NOT NULL THEN
    SET NEW.mobile_leg_status=(SELECT ${mobileStatusSql('slug')} FROM reservation_statuses WHERE id=NEW.trip_status_id LIMIT 1);
    END IF;`:
   `IF NOT (NEW.trip_status_id <=> OLD.trip_status_id) THEN
    SET NEW.mobile_leg_status=(SELECT ${mobileStatusSql('slug')} FROM reservation_statuses WHERE id=NEW.trip_status_id LIMIT 1);
    ELSEIF NOT (NEW.mobile_leg_status <=> OLD.mobile_leg_status) THEN
    SET NEW.trip_status_id=(SELECT id FROM reservation_statuses WHERE type='trip_status' AND status=1 AND
      slug IN (CASE NEW.mobile_leg_status WHEN 'COMPLETED' THEN 'completed' WHEN 'NO_SHOW' THEN 'no_show_chargeable' WHEN 'CANCELLED' THEN 'cancelled_chargeable' ELSE 'confirmed' END,
      CASE NEW.mobile_leg_status WHEN 'COMPLETED' THEN 'completed_trip' WHEN 'NO_SHOW' THEN 'no_show_chargeable_trip' WHEN 'CANCELLED' THEN 'cancelled_chargeable_trip' ELSE 'confirmed_trip' END) ORDER BY id LIMIT 1);
    SET NEW.trip_status_updated_at=NOW();
    END IF;`;
  await c.query(`CREATE TRIGGER ${name} BEFORE ${event} ON reservation_details FOR EACH ROW BEGIN ${logic} END`);
 }
 await c.query(`UPDATE reservations SET service_code=CASE service_type WHEN 1 THEN 'CHAUFFEUR' WHEN 2 THEN 'CAR_RENTAL' WHEN 3 THEN 'TRANSFER' ELSE service_code END,
   currency_code=CASE WHEN currency IN ('€','EUR') THEN 'EUR' ELSE UPPER(currency) END,created_by_user_id=user_id,
   lifecycle_status=COALESCE(lifecycle_status,CASE status WHEN 3 THEN 'CANCELLED' WHEN 2 THEN 'COMPLETED' WHEN 1 THEN 'CONFIRMED' ELSE 'PAYMENT_PENDING' END)`);
 await c.query(`UPDATE reservation_details d LEFT JOIN reservation_statuses s ON s.id=d.trip_status_id
   SET d.mobile_leg_status=COALESCE(${mobileStatusSql('d.mobile_leg_status')},${mobileStatusSql('s.slug')}),
   d.vehicle_class_id=COALESCE(d.vehicle_class_id,(SELECT v.vehicle_class_id FROM reservation_vehicles rv JOIN vehicles v ON v.id=rv.vehicle_id WHERE rv.reservation_details_id=d.id AND rv.status=1 ORDER BY rv.id DESC LIMIT 1))`);
}
