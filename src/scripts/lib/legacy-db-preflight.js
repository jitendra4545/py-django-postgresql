// Read-only preflight for a fresh legacy-first installation.
// This list covers the website business tables required by the mobile backend,
// its original-schema verifier, and the six compatibility views. We do NOT
// recreate these website-owned tables from mobile migrations.
export const requiredLegacyTables = Object.freeze([
  'activity_logs',
  'agencies',
  'agency_commissions',
  'agents',
  'cities',
  'countries',
  'customers',
  'drivers',
  'notifications',
  'rental_durations',
  'rental_option_classes',
  'rental_options',
  'rental_seasons',
  'reservation_costs',
  'reservation_details',
  'reservation_driver_statuses',
  'reservation_drivers',
  'reservation_flight_numbers',
  'reservation_insurances',
  'reservation_itineraries',
  'reservation_message_attachments',
  'reservation_message_recipients',
  'reservation_messages',
  'reservation_optional_costs',
  'reservation_payments',
  'reservation_statuses',
  'reservation_taxes',
  'reservation_temp_vehicle_histories',
  'reservation_vehicles',
  'reservations',
  'services',
  'tax_surecharges',
  'transfer_city_wise_prices',
  'users',
  'vehicle_blocks',
  'vehicle_cities',
  'vehicle_class_city_wise_base_rates',
  'vehicle_class_countries',
  'vehicle_class_price_rates',
  'vehicle_classes',
  'vehicle_reserved_dates',
  'vehicle_service_types',
  'vehicle_status_update_logs',
  'vehicles',
]);

export async function inspectLegacyDatabase(connection) {
  const [[identity]] = await connection.query(
    'SELECT DATABASE() AS databaseName, @@hostname AS serverHost, @@port AS serverPort, VERSION() AS serverVersion',
  );
  const [objects] = await connection.query(
    `SELECT TABLE_NAME AS name, TABLE_TYPE AS type
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()`,
  );
  const tables = new Map(objects.map(({ name, type }) => [name, type]));
  const missing = requiredLegacyTables.filter((name) => tables.get(name) !== 'BASE TABLE');
  return {
    ...identity,
    tableCount: [...tables.values()].filter((type) => type === 'BASE TABLE').length,
    missing,
    valid: missing.length === 0,
  };
}

export function legacyPreflightError(report) {
  const where = `${report.databaseName ?? '(none)'} on ${report.serverHost ?? '(unknown host)'}:${report.serverPort ?? '?'}`;
  return (
    `Migration blocked BEFORE changes: incomplete original Drive Luxury schema in ${where}. ` +
    `${report.missing.length} required website BASE TABLE(s) absent: ${report.missing.join(', ')}. ` +
    'Do not create fake replacements or run the mobile migration against this database. ' +
    'Restore the full original production SQL to an isolated staging database, ' +
    'verify DB_HOST/DB_NAME in .env, and rerun npm run db:preflight.'
  );
}
