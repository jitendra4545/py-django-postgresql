import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../common/async-handler.js';
import { requireAuth, requireRoles } from '../common/auth.js';
import { validate } from '../common/validate.js';
import { ROLES } from '../config/constants.js';
import { one, query, transaction } from '../db/pool.js';
import { getReservationForAccess } from '../services/access.js';
import { loadBookingView } from '../services/booking-view.js';
import { updateProfileTable } from '../services/profile-updates.js';

const router = Router();
router.use(requireAuth, requireRoles(ROLES.CLIENT));

const loadClientProfile = (customerId) =>
  one(
    `SELECT c.id,c.title,c.full_name AS fullName,c.last_name AS lastName,
            COALESCE(c.email,u.email) AS email,c.phone_no AS phone,
            c.date_of_birth AS dateOfBirth,c.country_id AS countryId,c.city,c.state,
            c.zip_code AS zipCode,c.address_one AS addressOne,c.address_two AS addressTwo,
            COALESCE(c.photo,u.photo) AS photo,u.lang AS language
       FROM customers c JOIN users u ON u.id=c.user_id
      WHERE c.id=? AND c.deleted_at IS NULL`,
    [customerId],
  );

router.get(
  '/dashboard',
  asyncHandler(async (request, response) => {
    const [upcoming, active, recent] = await Promise.all([
      query(
        `SELECT r.id, r.reservation_no AS reservationNo, arm.service_code AS serviceCode,
              arm.lifecycle_status AS status, MIN(rd.pick_up_date) AS serviceDate
         FROM reservations r JOIN app_reservation_meta arm ON arm.reservation_id=r.id
         JOIN reservation_details rd ON rd.reservation_id=r.id AND rd.deleted_at IS NULL
        WHERE r.customer_id=? AND r.deleted_at IS NULL AND rd.pick_up_date >= CURRENT_DATE
          AND arm.lifecycle_status NOT IN ('COMPLETED','CANCELLED')
        GROUP BY r.id, arm.service_code, arm.lifecycle_status ORDER BY serviceDate LIMIT 5`,
        [request.auth.customerId],
      ),
      one(
        `SELECT r.id, r.reservation_no AS reservationNo, arm.service_code AS serviceCode,
              arm.lifecycle_status AS status
         FROM reservations r JOIN app_reservation_meta arm ON arm.reservation_id=r.id
        WHERE r.customer_id=? AND arm.lifecycle_status IN ('PREPARING','ON_THE_WAY','ARRIVED','WAITING','PASSENGER_ONBOARD','IN_SERVICE','AT_STOP','DROPOFF_REACHED')
        ORDER BY r.updated_at DESC LIMIT 1`,
        [request.auth.customerId],
      ),
      query(
        `SELECT r.id, r.reservation_no AS reservationNo, arm.service_code AS serviceCode,
              arm.lifecycle_status AS status
         FROM reservations r JOIN app_reservation_meta arm ON arm.reservation_id=r.id
        WHERE r.customer_id=? AND arm.lifecycle_status IN ('COMPLETED','CANCELLED')
        ORDER BY r.updated_at DESC LIMIT 5`,
        [request.auth.customerId],
      ),
    ]);
    response.json({ activeBooking: active, upcomingBookings: upcoming, recentBookings: recent });
  }),
);

router.get(
  '/profile',
  asyncHandler(async (request, response) => {
    response.json(await loadClientProfile(request.auth.customerId));
  }),
);

router.patch(
  '/profile',
  validate(
    z
      .object({
        title: z.string().max(191).nullable().optional(),
        fullName: z.string().min(2).max(191).optional(),
        lastName: z.string().max(255).nullable().optional(),
        phone: z.string().min(6).max(30).optional(),
        dateOfBirth: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        countryId: z.number().int().positive().nullable().optional(),
        city: z.string().max(191).nullable().optional(),
        state: z.string().max(191).nullable().optional(),
        zipCode: z.string().max(50).nullable().optional(),
        addressOne: z.string().max(191).nullable().optional(),
        addressTwo: z.string().max(191).nullable().optional(),
        language: z.string().min(2).max(10).optional(),
      })
      .refine((value) => Object.keys(value).length > 0, {
        message: 'At least one profile field is required',
      }),
  ),
  asyncHandler(async (request, response) => {
    const b = request.body;
    await transaction(async (connection) => {
      await updateProfileTable(connection, 'customers', request.auth.customerId, b, {
        title: 'title',
        fullName: 'full_name',
        lastName: 'last_name',
        phone: 'phone_no',
        dateOfBirth: 'date_of_birth',
        countryId: 'country_id',
        city: 'city',
        state: 'state',
        zipCode: 'zip_code',
        addressOne: 'address_one',
        addressTwo: 'address_two',
      });
      await updateProfileTable(connection, 'users', request.auth.userId, b, {
        fullName: 'full_name',
        language: 'lang',
      });
    });
    response.json({
      message: 'Profile updated',
      profile: await loadClientProfile(request.auth.customerId),
    });
  }),
);

router.get(
  '/bookings/:reservationId/tracking',
  asyncHandler(async (request, response) => {
    await getReservationForAccess(request.auth, request.params.reservationId);
    const assignment = await one(
      `SELECT ada.id, ada.status, d.full_name AS chauffeurName, d.photo AS chauffeurPhoto
       FROM app_driver_assignments ada JOIN drivers d ON d.id=ada.driver_id
      WHERE ada.reservation_id=? AND ada.status NOT IN ('DECLINED','CANCELLED')
      ORDER BY ada.updated_at DESC LIMIT 1`,
      [request.params.reservationId],
    );
    const location = assignment
      ? await one(
          `SELECT latitude, longitude, heading, speed, accuracy, recorded_at AS recordedAt FROM app_driver_locations WHERE assignment_id=? ORDER BY recorded_at DESC LIMIT 1`,
          [assignment.id],
        )
      : null;
    const timeline = await query(
      `SELECT status, note, occurred_at AS occurredAt FROM app_booking_status_events WHERE reservation_id=? ORDER BY occurred_at`,
      [request.params.reservationId],
    );
    response.json({ assignment, location, timeline });
  }),
);

router.get(
  '/bookings/:reservationId/receipt',
  asyncHandler(async (request, response) => {
    await getReservationForAccess(request.auth, request.params.reservationId);
    const booking = await loadBookingView(request.params.reservationId);
    response.json({
      reservationNo: booking.reservationNo,
      currency: booking.currency,
      costs: booking.costs,
      payments: booking.payments,
    });
  }),
);

export default router;
