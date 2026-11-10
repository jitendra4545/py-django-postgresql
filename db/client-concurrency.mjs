// Derived concurrency metadata only. Native booking rows remain authoritative.
// MySQL prohibits locking a trigger's own subject table; a separate claim index
// permits current locking reads in both PHP and Node transactions.
export const concurrencyTriggerNames=[
 ...['rv','date','block'].flatMap(kind=>['insert','update','delete'].map(event=>`dl_mobile_lock_${kind}_${event}`)),
 'dl_mobile_lock_parent_update',
];
const registration=(kind,sourceId,vehicle,reservation,start,end,active)=>`
  DELETE FROM app_vehicle_booking_locks WHERE source_kind='${kind}' AND source_id=${sourceId};
  SET claim_start=${start}; SET claim_end=GREATEST(${end},claim_start);
  SET claim_parent=1;
  IF ${reservation}<>0 THEN
    SELECT IF(status=3 OR deleted_at IS NOT NULL,0,1) INTO claim_parent FROM reservations WHERE id=${reservation} FOR UPDATE;
  END IF;
  IF ${active} AND claim_end>=CURRENT_DATE THEN
    SELECT id INTO locked_vehicle FROM vehicles WHERE id=${vehicle} FOR UPDATE;
    IF locked_vehicle IS NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DL_VEHICLE_UNAVAILABLE'; END IF;
    IF claim_parent=1 THEN
      SELECT source_id INTO busy FROM app_vehicle_booking_locks
        WHERE vehicle_id=${vehicle} AND reservation_id<>${reservation} AND parent_active=1
          AND reserved_start<=claim_end AND reserved_end>=claim_start LIMIT 1 FOR UPDATE;
      IF busy IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DL_VEHICLE_UNAVAILABLE'; END IF;
    END IF;
    INSERT INTO app_vehicle_booking_locks(source_kind,source_id,vehicle_id,reservation_id,reserved_start,reserved_end,parent_active)
      VALUES ('${kind}',${sourceId},${vehicle},${reservation},claim_start,claim_end,claim_parent);
  END IF;`;

export async function installConcurrencyGuards(c){
 for(const name of ['dl_mobile_vehicle_guard_insert','dl_mobile_vehicle_guard_update','dl_mobile_date_guard_insert','dl_mobile_date_guard_update'])await c.query('DROP TRIGGER IF EXISTS '+name);
 const sources=[
  ['rv','reservation_vehicles','RV','NEW.vehicle_id','NEW.reservation_id','NEW.pick_up_date','COALESCE(NEW.drop_off_date,NEW.pick_up_date)','NEW.status=1 AND NEW.deleted_at IS NULL'],
  ['date','vehicle_reserved_dates','DATE','NEW.vehicle_id','NEW.reservation_id','NEW.reserved_date','NEW.reserved_date','1=1'],
  ['block','vehicle_blocks','BLOCK','NEW.vehicle_id','0','NEW.start_date','NEW.end_date','1=1'],
 ];
 for(const [label,table,kind,vehicle,reservation,start,end,active] of sources){
  for(const event of ['INSERT','UPDATE','DELETE']){
   const name=`dl_mobile_lock_${label}_${event.toLowerCase()}`;
   await c.query('DROP TRIGGER IF EXISTS '+name);
   const body=event==='DELETE'?`DELETE FROM app_vehicle_booking_locks WHERE source_kind='${kind}' AND source_id=OLD.id;`:
    registration(kind,'NEW.id',vehicle,reservation,start,end,active);
   await c.query(`CREATE TRIGGER ${name} AFTER ${event} ON ${table} FOR EACH ROW BEGIN
    DECLARE locked_vehicle BIGINT DEFAULT NULL; DECLARE busy BIGINT DEFAULT NULL;
    DECLARE claim_start DATE; DECLARE claim_end DATE; DECLARE claim_parent TINYINT DEFAULT 1;
    ${body} END`);
  }
 }
 const name='dl_mobile_lock_parent_update';await c.query('DROP TRIGGER IF EXISTS '+name);
 await c.query(`CREATE TRIGGER ${name} AFTER UPDATE ON reservations FOR EACH ROW BEGIN
   DECLARE done INT DEFAULT 0; DECLARE vehicle BIGINT; DECLARE locked_vehicle BIGINT; DECLARE busy BIGINT DEFAULT NULL;
   DECLARE claims CURSOR FOR SELECT DISTINCT vehicle_id FROM app_vehicle_booking_locks WHERE reservation_id=NEW.id AND reserved_end>=CURRENT_DATE ORDER BY vehicle_id;
   DECLARE CONTINUE HANDLER FOR NOT FOUND SET done=1;
   IF NEW.status=3 OR NEW.deleted_at IS NOT NULL THEN
     UPDATE app_vehicle_booking_locks SET parent_active=0 WHERE reservation_id=NEW.id;
   ELSEIF OLD.status=3 OR OLD.deleted_at IS NOT NULL THEN
     OPEN claims;
     vehicle_loop: LOOP
       FETCH claims INTO vehicle; IF done THEN LEAVE vehicle_loop; END IF;
       SELECT id INTO locked_vehicle FROM vehicles WHERE id=vehicle FOR UPDATE;
       SET busy=NULL;
       SELECT other.source_id INTO busy FROM app_vehicle_booking_locks own
         JOIN app_vehicle_booking_locks other ON other.vehicle_id=own.vehicle_id
          AND other.reservation_id<>NEW.id AND other.parent_active=1
          AND other.reserved_start<=own.reserved_end AND other.reserved_end>=own.reserved_start
         WHERE own.reservation_id=NEW.id AND own.vehicle_id=vehicle AND own.reserved_end>=CURRENT_DATE LIMIT 1 FOR UPDATE;
       IF busy IS NOT NULL THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='DL_VEHICLE_UNAVAILABLE'; END IF;
       SET done=0;
     END LOOP;
     CLOSE claims;
     UPDATE app_vehicle_booking_locks SET parent_active=1 WHERE reservation_id=NEW.id;
   END IF;
 END`);
 // Maintenance rebuild changes only derived claims, never native business rows.
 await c.query('DELETE FROM app_vehicle_booking_locks');
 await c.query(`INSERT INTO app_vehicle_booking_locks(source_kind,source_id,vehicle_id,reservation_id,reserved_start,reserved_end,parent_active)
   SELECT 'RV',rv.id,rv.vehicle_id,rv.reservation_id,rv.pick_up_date,GREATEST(COALESCE(rv.drop_off_date,rv.pick_up_date),rv.pick_up_date),IF(r.status=3 OR r.deleted_at IS NOT NULL,0,1)
   FROM reservation_vehicles rv JOIN reservations r ON r.id=rv.reservation_id
   WHERE rv.status=1 AND rv.deleted_at IS NULL AND GREATEST(COALESCE(rv.drop_off_date,rv.pick_up_date),rv.pick_up_date)>=CURRENT_DATE`);
 await c.query(`INSERT INTO app_vehicle_booking_locks(source_kind,source_id,vehicle_id,reservation_id,reserved_start,reserved_end,parent_active)
   SELECT 'DATE',d.id,d.vehicle_id,d.reservation_id,d.reserved_date,d.reserved_date,IF(r.id IS NULL OR (r.status<>3 AND r.deleted_at IS NULL),1,0)
   FROM vehicle_reserved_dates d LEFT JOIN reservations r ON r.id=d.reservation_id WHERE d.reserved_date>=CURRENT_DATE`);
 await c.query(`INSERT INTO app_vehicle_booking_locks(source_kind,source_id,vehicle_id,reservation_id,reserved_start,reserved_end,parent_active)
   SELECT 'BLOCK',id,vehicle_id,0,start_date,GREATEST(end_date,start_date),1 FROM vehicle_blocks WHERE end_date>=CURRENT_DATE`);
 const [clashes]=await c.query(`SELECT a.vehicle_id,a.reservation_id,b.reservation_id AS conflicting_reservation_id
   FROM app_vehicle_booking_locks a JOIN app_vehicle_booking_locks b ON b.vehicle_id=a.vehicle_id
    AND b.reservation_id<>a.reservation_id AND b.parent_active=1 AND b.reserved_start<=a.reserved_end AND b.reserved_end>=a.reserved_start
   WHERE a.parent_active=1 LIMIT 1`);
 if(clashes.length)throw Error(`Existing future native vehicle conflict requires operations review: vehicle ${clashes[0].vehicle_id}, reservations ${clashes[0].reservation_id}/${clashes[0].conflicting_reservation_id}`);
}
