import {query} from '../db/pool.js';
import {AppError} from '../common/errors.js';
// Search includes classes with incomplete legacy dimensions; a known small
// physical vehicle must still be refused when it is actually allocated.
export async function assertVehicleCapacity(connection,vehicleId,passengers=1,luggage=0){
  const sql='SELECT seating_capacity,boot_capacity FROM vehicle_dimensions WHERE vehicle_id=?';
  const rows=connection?(await connection.execute(sql,[vehicleId]))[0]:await query(sql,[vehicleId]);
  const numeric=value=>/^\d+$/.test(String(value??''))?Number(value):null;
  const seats=numeric(rows[0]?.seating_capacity),bags=numeric(rows[0]?.boot_capacity);
  if((seats!==null&&seats<passengers)||(bags!==null&&bags<luggage))throw new AppError(422,'VEHICLE_CAPACITY_EXCEEDED','Selected vehicle cannot carry the requested passengers or luggage');
}
