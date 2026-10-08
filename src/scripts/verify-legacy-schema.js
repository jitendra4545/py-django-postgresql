import { pool } from '../db/pool.js';

const required = {
  activity_logs: [
    'id',
    'subject_type',
    'subject_id',
    'feature_name',
    'features_id',
    'action',
    'old_values',
    'new_values',
    'user_id',
    'ip_address',
  ],
  users: ['id', 'email', 'password', 'status', 'role', 'deleted_at'],
  customers: ['id', 'agency_id', 'user_id', 'full_name', 'phone_no', 'deleted_at'],
  agents: ['id', 'agency_id', 'agent_type', 'user_id', 'deleted_at'],
  agencies: ['id', 'commission', 'status', 'deleted_at'],
  agency_commissions: [
    'id',
    'reservation_id',
    'reservation_details_id',
    'agency_id',
    'commission_amount',
    'paid_amount',
    'due_amount',
    'commission_percentage',
    'is_custom_updated',
    'status',
    'user_id',
    'deleted_at',
  ],
  drivers: ['id', 'user_id', 'deleted_at'],
  reservations: [
    'id',
    'uuid',
    'reservation_no',
    'service_type',
    'customer_id',
    'agency_id',
    'status',
    'payment_status',
    'deleted_at',
  ],
  reservation_details: [
    'id',
    'reservation_id',
    'pick_up_location',
    'drop_off_location',
    'pick_up_date',
    'drop_off_date',
    'pick_up_time',
    'drop_off_time',
    'service_details',
    'status',
    'deleted_at',
  ],
  reservation_itineraries: ['id', 'reservation_id', 'reservation_details_id', 'sort_numer'],
  reservation_costs: [
    'id',
    'reservation_id',
    'reservation_details_id',
    'base_rate',
    'total_tax',
    'total_amount',
  ],
  reservation_drivers: ['id', 'reservation_id', 'reservation_details_id', 'pick_up_driver_id'],
  reservation_vehicles: [
    'id',
    'reservation_id',
    'reservation_details_id',
    'vehicle_id',
    'status',
    'deleted_at',
  ],
  vehicle_reserved_dates: [
    'id',
    'vehicle_id',
    'reservation_id',
    'reservation_detail_id',
    'reserved_date',
  ],
  vehicle_blocks: [
    'id',
    'vehicle_id',
    'block_type',
    'start_date',
    'end_date',
    'start_time',
    'end_time',
  ],
  vehicle_status_update_logs: ['id', 'vehicle_id', 'status', 'updated_by', 'created_at'],
  reservation_temp_vehicle_histories: [
    'id',
    'reservation_details_id',
    'reservation_vehicle_id',
    'old_vehicle_id',
    'reservation_id',
    'created_by',
  ],
  vehicles: [
    'id',
    'vehicle_class_id',
    'title',
    'thumbnail',
    'model',
    'year',
    'reg_no',
    'status',
    'online_booking_status',
    'current_location',
    'provider_id',
    'deleted_at',
  ],
  vehicle_classes: ['id', 'title', 'status'],
  vehicle_class_price_rates: [
    'id',
    'vehicle_class_id',
    'country_id',
    'amount',
    'rent_type',
    'status',
  ],
  rental_options: ['id', 'based_on', 'rate_type', 'amount', 'taxable', 'rent_type', 'status'],
  tax_surecharges: ['id', 'country_id', 'service_type', 'amount', 'status'],
};

const [columns] = await pool.query(
  `SELECT TABLE_NAME,COLUMN_NAME,DATA_TYPE,IS_NULLABLE,COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE()`,
);
const available = new Map();
for (const column of columns) {
  if (!available.has(column.TABLE_NAME)) available.set(column.TABLE_NAME, new Set());
  available.get(column.TABLE_NAME).add(column.COLUMN_NAME);
}
const errors = [];
for (const [table, names] of Object.entries(required)) {
  if (!available.has(table)) errors.push(`missing table ${table}`);
  for (const name of names)
    if (!available.get(table)?.has(name)) errors.push(`missing column ${table}.${name}`);
}
await pool.end();
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(
  `Legacy schema verified: ${Object.keys(required).length} tables and ${Object.values(required).flat().length} required columns`,
);
