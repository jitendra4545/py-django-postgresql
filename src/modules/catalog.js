import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../common/async-handler.js';
import { validate } from '../common/validate.js';
import { query } from '../db/pool.js';
import { availabilityDateParams, availableClassSql } from '../services/vehicle-availability.js';
import { LEGACY_SERVICE_TYPES } from '../services/legacy-pricing-rules.js';
import { autocompletePlace, getPlaceDetails } from '../services/google-maps.js';

const router = Router();
const rentTypeByService = LEGACY_SERVICE_TYPES;
const placesLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
});
const sessionToken = z.string().uuid().optional();

router.get(
  '/services',
  asyncHandler(async (_request, response) => {
    const services = await query(
      `SELECT code, title, description, icon_url AS iconUrl, booking_mode AS bookingMode,
              legacy_service_id AS legacyServiceId
         FROM app_service_catalog WHERE is_active = 1 ORDER BY display_order`,
    );
    response.json({ items: services });
  }),
);

router.get(
  '/countries',
  validate(
    z.object({
      serviceCode: z.enum(['CHAUFFEUR', 'TRANSFER', 'CAR_RENTAL']).optional(),
    }),
    'query',
  ),
  asyncHandler(async (request, response) => {
    if (!request.query.serviceCode) {
      const items = await query(
        `SELECT id,name,UPPER(code) AS code
           FROM countries
          WHERE status=1 AND deleted_at IS NULL
          ORDER BY name`,
      );
      return response.json({ items });
    }

    const items = await query(
      `SELECT DISTINCT c.id,c.name,UPPER(c.code) AS code
         FROM countries c
         JOIN vehicle_class_countries vcc
           ON vcc.country_id=c.id AND vcc.deleted_at IS NULL
         JOIN vehicle_classes vc
           ON vc.id=vcc.vehicle_class_id AND vc.status=1 AND vc.deleted_at IS NULL
          AND vc.can_reservation_from_website=1 AND vc.rental_type=?
         JOIN vehicle_class_price_rates pr
           ON pr.vehicle_class_id=vc.id AND pr.country_id IN (c.id,0)
          AND pr.rent_type=? AND pr.status=1
         JOIN vehicles v
           ON v.vehicle_class_id=vc.id AND v.status=1 AND v.online_booking_status=1
          AND v.deleted_at IS NULL
        WHERE c.status=1 AND c.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM vehicle_service_types vst
                       WHERE vst.vehicle_id=v.id AND vst.service_type=?)
          AND EXISTS (
            SELECT 1 FROM vehicle_cities country_vehicle_city
            JOIN cities country_city ON country_city.id=country_vehicle_city.city_id
             AND country_city.status=1 AND country_city.deleted_at IS NULL
           WHERE country_vehicle_city.vehicle_id=v.id
             AND country_vehicle_city.deleted_at IS NULL
             AND country_city.country_id=c.id
          )
        ORDER BY c.name`,
      [
        rentTypeByService[request.query.serviceCode],
        rentTypeByService[request.query.serviceCode],
        rentTypeByService[request.query.serviceCode],
      ],
    );
    return response.json({ items });
  }),
);

router.get(
  '/cities',
  validate(
    z.object({
      countryId: z.coerce.number().int().positive(),
      search: z.string().trim().max(100).optional(),
    }),
    'query',
  ),
  asyncHandler(async (request, response) => {
    const search = `%${request.query.search ?? ''}%`;
    const items = await query(
      `SELECT id,country_id AS countryId,name,
              CAST(lat AS DECIMAL(10,7)) AS latitude,
              CAST(lng AS DECIMAL(10,7)) AS longitude
         FROM cities
        WHERE country_id=? AND status=1 AND deleted_at IS NULL
          AND (name LIKE ? OR additional_name_1 LIKE ? OR additional_name_2 LIKE ?
               OR additional_name_3 LIKE ? OR additional_name_4 LIKE ?)
        ORDER BY name
        LIMIT 200`,
      [request.query.countryId, search, search, search, search, search],
    );
    response.json({ items });
  }),
);

router.get(
  '/location/resolve',
  validate(
    z.object({
      countryCode: z
        .string()
        .trim()
        .length(2)
        .transform((value) => value.toUpperCase()),
      city: z.string().trim().min(1).max(191).optional(),
    }),
    'query',
  ),
  asyncHandler(async (request, response) => {
    const countries = await query(
      `SELECT id,name,UPPER(code) AS code
         FROM countries
        WHERE UPPER(code)=? AND status=1 AND deleted_at IS NULL
        LIMIT 1`,
      [request.query.countryCode],
    );
    const country = countries[0] ?? null;
    if (!country) return response.json({ country: null, city: null, exactCityMatch: false });
    if (!request.query.city) {
      return response.json({ country, city: null, exactCityMatch: false });
    }
    const cities = await query(
      `SELECT id,country_id AS countryId,name,
              CAST(lat AS DECIMAL(10,7)) AS latitude,
              CAST(lng AS DECIMAL(10,7)) AS longitude
         FROM cities
        WHERE country_id=? AND status=1 AND deleted_at IS NULL
          AND (LOWER(name)=LOWER(?) OR LOWER(additional_name_1)=LOWER(?)
               OR LOWER(additional_name_2)=LOWER(?) OR LOWER(additional_name_3)=LOWER(?)
               OR LOWER(additional_name_4)=LOWER(?))
        ORDER BY CASE WHEN LOWER(name)=LOWER(?) THEN 0 ELSE 1 END, name
        LIMIT 1`,
      [country.id, ...Array(6).fill(request.query.city)],
    );
    response.json({ country, city: cities[0] ?? null, exactCityMatch: Boolean(cities[0]) });
  }),
);

router.get(
  '/places/autocomplete',
  placesLimiter,
  validate(z.object({ input: z.string().trim().min(3).max(120), sessionToken }), 'query'),
  asyncHandler(async (request, response) => {
    response.json({
      items: await autocompletePlace(request.query.input, request.query.sessionToken),
    });
  }),
);

router.get(
  '/places/:placeId',
  placesLimiter,
  validate(z.object({ placeId: z.string().regex(/^[A-Za-z0-9_:-]{3,191}$/) }), 'params'),
  validate(z.object({ sessionToken }), 'query'),
  asyncHandler(async (request, response) => {
    const place = await getPlaceDetails(request.params.placeId, request.query.sessionToken);
    const component = (kind) => place.addressComponents?.find((item) => item.types?.includes(kind));
    const countryCode = component('country')?.shortText;
    const cityName =
      component('locality')?.longText ??
      component('postal_town')?.longText ??
      component('administrative_area_level_2')?.longText;
    const country = countryCode
      ? ((
          await query(
            'SELECT id,name,code FROM countries WHERE UPPER(code)=? AND status=1 AND deleted_at IS NULL LIMIT 1',
            [countryCode.toUpperCase()],
          )
        )[0] ?? null)
      : null;
    const city =
      country && cityName
        ? ((
            await query(
              `SELECT id,name,country_id AS countryId FROM cities
            WHERE country_id=? AND status=1 AND deleted_at IS NULL AND
              (LOWER(name)=LOWER(?) OR LOWER(additional_name_1)=LOWER(?)
               OR LOWER(additional_name_2)=LOWER(?) OR LOWER(additional_name_3)=LOWER(?)
               OR LOWER(additional_name_4)=LOWER(?)) LIMIT 1`,
              [country.id, ...Array(5).fill(cityName)],
            )
          )[0] ?? null)
        : null;
    response.json({
      placeId: place.id,
      address: place.formattedAddress,
      latitude: place.location?.latitude,
      longitude: place.location?.longitude,
      country,
      city,
      supported: Boolean(country && city),
    });
  }),
);

router.get(
  '/vehicle-classes',
  validate(
    z
      .object({
        serviceCode: z.enum(['CHAUFFEUR', 'TRANSFER', 'CAR_RENTAL']),
        countryId: z.coerce.number().int().positive(),
        cityId: z.coerce.number().int().positive().optional(),
        passengerCount: z.coerce.number().int().positive().default(1),
        startAt: z.string().datetime().optional(),
        endAt: z.string().datetime().optional(),
      })
      .refine((value) => Boolean(value.startAt) === Boolean(value.endAt), {
        message: 'startAt and endAt must be provided together',
      })
      .refine(
        (value) => !value.startAt || new Date(value.endAt) > new Date(value.startAt),
        'endAt must be after startAt',
      ),
    'query',
  ),
  asyncHandler(async (request, response) => {
    const rentType = rentTypeByService[request.query.serviceCode];
    const withDates = Boolean(request.query.startAt);
    const classes = await query(
      `SELECT vc.id, vc.title, vc.description, vc.image,
              COALESCE(capacity.passengerCapacity, 0) AS passengerCapacity,
              pr.startingPrice,
              CASE WHEN country.code='CH' THEN 'CHF' ELSE 'EUR' END AS currency
         FROM vehicle_classes vc
         JOIN countries country ON country.id=?
         JOIN vehicle_class_countries vcc ON vcc.vehicle_class_id = vc.id
            AND vcc.country_id = ? AND vcc.deleted_at IS NULL
         JOIN (
           SELECT vehicle_class_id, MIN(amount) AS startingPrice
             FROM vehicle_class_price_rates
            WHERE country_id IN (?, 0) AND rent_type = ? AND status = 1
            GROUP BY vehicle_class_id
         ) pr ON pr.vehicle_class_id = vc.id
         LEFT JOIN (
           SELECT v.vehicle_class_id,
                  MAX(CAST(vd.seating_capacity AS UNSIGNED)) AS passengerCapacity
             FROM vehicles v JOIN vehicle_dimensions vd ON vd.vehicle_id = v.id
            WHERE v.deleted_at IS NULL AND v.status = 1 AND v.online_booking_status = 1
            GROUP BY v.vehicle_class_id
         ) capacity ON capacity.vehicle_class_id = vc.id
        WHERE vc.status = 1 AND vc.deleted_at IS NULL AND vc.can_reservation_from_website = 1
          AND vc.rental_type=?
          AND (capacity.passengerCapacity IS NULL OR capacity.passengerCapacity >= ?)
          ${availableClassSql({ withDates, withCity: Boolean(request.query.cityId) })}
        ORDER BY pr.startingPrice, vc.title`,
      [
        request.query.countryId,
        request.query.countryId,
        request.query.countryId,
        rentType,
        rentType,
        request.query.passengerCount,
        rentType,
        request.query.countryId,
        ...(request.query.cityId ? [request.query.cityId] : []),
        ...(withDates ? availabilityDateParams(request.query.startAt, request.query.endAt) : []),
      ],
    );
    response.json({
      items: classes.map((item) => ({
        ...item,
        startingPriceIndicative: true,
      })),
    });
  }),
);

router.get(
  '/options',
  validate(
    z.object({
      serviceCode: z.enum(['CHAUFFEUR', 'TRANSFER', 'CAR_RENTAL']),
      vehicleClassId: z.coerce.number().int().positive().optional(),
    }),
    'query',
  ),
  asyncHandler(async (request, response) => {
    const rentType = { CHAUFFEUR: 1, CAR_RENTAL: 2, TRANSFER: 3 }[request.query.serviceCode];
    const items = await query(
      `SELECT id, title, description, based_on AS basedOn, rate_type AS rateType,
              amount, taxable
         FROM rental_options
        WHERE rent_type = ? AND status = 1 AND show_on_frontend = 1 AND deleted_at IS NULL
          ${
            request.query.vehicleClassId
              ? `AND EXISTS (SELECT 1 FROM rental_option_classes roc
                    WHERE roc.rental_option_id=rental_options.id AND roc.vehicle_class_id=?)`
              : ''
          }
        ORDER BY title`,
      [rentType, ...(request.query.vehicleClassId ? [request.query.vehicleClassId] : [])],
    );
    response.json({ items });
  }),
);

export default router;
