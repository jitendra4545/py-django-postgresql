import { query } from '../db/pool.js';
import { amountForDuration, billableUnits } from './legacy-pricing-rules.js';
import { availabilityDateParams, websiteVehiclePredicate } from './vehicle-availability.js';

// Laravel selectCar displays only classes with a positive rate for the pickup
// season and nearest rental-day band. A MIN across historical rates is neither
// that list nor its price order. Physical eligibility still uses the shared policy.
export async function listRentalVehicleClasses({ countryId, cityId, startAt, endAt }) {
  const days = billableUnits({ serviceCode: 'CAR_RENTAL', startAt, endAt });
  const pickupDate = new Date(startAt).toISOString().slice(0, 10);
  const [seasons, durations] = await Promise.all([
    query(`SELECT id FROM rental_seasons
      WHERE start<=? AND end>=? AND status=1 AND deleted_at IS NULL
      ORDER BY id LIMIT 1`, [pickupDate, pickupDate]),
    query(`SELECT id,span_duration FROM rental_durations
      WHERE rent_type=2 AND status=1 AND span_duration>0
      ORDER BY ABS(span_duration-?),id LIMIT 1`, [days]),
  ]);
  const duration = durations[0];
  if (!duration) return [];
  const rows = await query(
    `SELECT vc.id,vc.title,vc.description,vc.image,
            COALESCE(CAST(vd.seating_capacity AS UNSIGNED),0) AS passengerCapacity,
            pr.amount AS bandAmount,
            CASE WHEN country.code='CH' THEN 'CHF' ELSE 'EUR' END AS currency
       FROM vehicle_classes vc
       JOIN countries country ON country.id=? AND country.status=1 AND country.deleted_at IS NULL
       JOIN vehicles selected_vehicle ON selected_vehicle.id=(
         SELECT v.id FROM vehicles v
          WHERE v.vehicle_class_id=vc.id AND ${websiteVehiclePredicate({ withDates: true })}
          ORDER BY (EXISTS (SELECT 1 FROM vehicle_original_cities home
            WHERE home.vehicle_id=v.id AND home.deleted_at IS NULL
              AND home.locality=(SELECT name FROM cities WHERE id=?))) DESC,v.id LIMIT 1
       )
       LEFT JOIN vehicle_dimensions vd ON vd.id=(
         SELECT dimensions.id FROM vehicle_dimensions dimensions
          WHERE dimensions.vehicle_id=selected_vehicle.id ORDER BY dimensions.id LIMIT 1
       )
       JOIN vehicle_class_price_rates pr ON pr.id=(
         SELECT rate.id FROM vehicle_class_price_rates rate
          WHERE rate.vehicle_class_id=vc.id AND rate.rent_type=2 AND rate.status=1
            AND rate.rental_season_id=? AND rate.rental_duration_id=?
            AND rate.country_id IN (?,0)
          ORDER BY (rate.country_id=?) DESC,rate.id LIMIT 1
       )
      WHERE vc.rental_type=2 AND vc.status=1 AND vc.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM vehicle_class_countries cc
          WHERE cc.vehicle_class_id=vc.id AND cc.country_id=? AND cc.deleted_at IS NULL)
        AND pr.amount>0
      ORDER BY pr.amount,vc.id`,
    [countryId, 2, countryId, ...availabilityDateParams(startAt, endAt), cityId ?? null,
      seasons[0]?.id ?? 0, duration.id, countryId, countryId, countryId],
  );
  return rows.map(({ bandAmount, ...item }) => ({
    ...item,
    startingPrice: amountForDuration(bandAmount, duration.span_duration, days),
    startingPriceIndicative: true,
  }));
}
