import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../common/async-handler.js';
import { validate } from '../common/validate.js';
import { query } from '../db/pool.js';
import { availabilityDateParams, availableClassSql } from '../services/vehicle-availability.js';

const router = Router();

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
  '/vehicle-classes',
  validate(
    z
      .object({
        serviceCode: z.enum(['CHAUFFEUR', 'TRANSFER', 'CAR_RENTAL']),
        countryId: z.coerce.number().int().positive(),
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
    const rentType = { CHAUFFEUR: 1, CAR_RENTAL: 3, TRANSFER: 4 }[request.query.serviceCode];
    const withDates = Boolean(request.query.startAt);
    const classes = await query(
      `SELECT vc.id, vc.title, vc.description, vc.image,
              COALESCE(capacity.passengerCapacity, 0) AS passengerCapacity,
              pr.startingPrice, 'EUR' AS currency
         FROM vehicle_classes vc
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
          AND (capacity.passengerCapacity IS NULL OR capacity.passengerCapacity >= ?)
          ${availableClassSql(withDates)}
        ORDER BY pr.startingPrice, vc.title`,
      [
        request.query.countryId,
        request.query.countryId,
        rentType,
        request.query.passengerCount,
        ...(withDates ? availabilityDateParams(request.query.startAt, request.query.endAt) : []),
      ],
    );
    response.json({ items: classes });
  }),
);

router.get(
  '/options',
  validate(z.object({ serviceCode: z.enum(['CHAUFFEUR', 'TRANSFER', 'CAR_RENTAL']) }), 'query'),
  asyncHandler(async (request, response) => {
    const rentType = { CHAUFFEUR: 1, CAR_RENTAL: 2, TRANSFER: 3 }[request.query.serviceCode];
    const items = await query(
      `SELECT id, title, description, based_on AS basedOn, rate_type AS rateType,
              amount, taxable
         FROM rental_options
        WHERE rent_type = ? AND status = 1 AND show_on_frontend = 1 AND deleted_at IS NULL
        ORDER BY title`,
      [rentType],
    );
    response.json({ items });
  }),
);

export default router;
