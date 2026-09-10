import { env } from '../config/env.js';
import { db, rows } from '../db/pool.js';
import { logger } from '../common/logger.js';
const required = {
    users: ['id', 'user_name', 'full_name', 'email', 'password', 'status', 'role', 'deleted_at'],
    customers: ['id', 'uuid', 'full_name', 'email', 'phone_no', 'status', 'user_id', 'created_by', 'is_registered', 'deleted_at'],
    drivers: ['id', 'full_name', 'country_id', 'user_id', 'created_by', 'deleted_at'],
    agents: ['id', 'agency_id', 'full_name', 'email', 'agent_type', 'user_id', 'created_by', 'deleted_at'],
    reservations: ['id', 'reservation_no', 'service_type', 'customer_id', 'status', 'payment_status', 'deleted_at'],
    reservation_details: ['id', 'reservation_id', 'pick_up_location', 'drop_off_location', 'pick_up_date', 'drop_off_date', 'pick_up_time', 'drop_off_time', 'deleted_at'],
    reservation_vehicles: ['reservation_id', 'reservation_details_id', 'vehicle_id', 'deleted_at'],
    reservation_drivers: ['reservation_id', 'reservation_details_id', 'pick_up_driver_id', 'drop_off_driver_id', 'deleted_at'],
    vehicles: ['id', 'vehicle_class_id', 'title', 'status', 'online_booking_status', 'deleted_at'],
    vehicle_classes: ['id', 'title', 'daily_rate', 'weekly_rate', 'deleted_at'],
    vehicle_reserved_dates: ['vehicle_id', 'reservation_id', 'reservation_detail_id', 'reserved_date'],
    vehicle_blocks: ['vehicle_id', 'start_date', 'end_date'],
    rental_options: ['id', 'title', 'based_on', 'rate_type', 'amount', 'rent_type', 'status', 'deleted_at'],
    reservation_costs: ['reservation_id', 'reservation_details_id', 'base_rate', 'optional_cost', 'insurance_cost', 'total_tax', 'total_amount'],
    agreement_vehicle_inspections: ['reservation_id', 'reservation_details_id', 'vehicle_id', 'pick_up_km', 'drop_off_km'],
    agreement_signatures: ['reservation_id', 'reservation_details_id', 'signature', 'signature_drop_off']
};
async function run() {
    const data = await rows(`SELECT TABLE_NAME,COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=?`, [env.DB_NAME]);
    const map = new Map();
    for (const row of data) {
        if (!map.has(row.TABLE_NAME))
            map.set(row.TABLE_NAME, new Set());
        map.get(row.TABLE_NAME).add(row.COLUMN_NAME);
    }
    const errors = [];
    for (const [table, columns] of Object.entries(required)) {
        const found = map.get(table);
        if (!found) {
            errors.push(`Missing table: ${table}`);
            continue;
        }
        for (const column of columns)
            if (!found.has(column))
                errors.push(`Missing column: ${table}.${column}`);
    }
    if (errors.length)
        throw new Error(`Legacy schema is incompatible:\n${errors.join('\n')}`);
    logger.info({ tablesChecked: Object.keys(required).length }, 'Legacy schema verification passed');
    await db.end();
}
run().catch(async (error) => {
    logger.fatal({ error }, 'Legacy schema verification failed');
    await db.end();
    process.exit(1);
});
