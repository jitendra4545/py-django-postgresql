import { env } from '../config/env.js';
import { one, query } from '../db/pool.js';

export const isLocationStale = (
  recordedAt,
  now = new Date(),
  staleAfterSeconds = env.GPS_STALE_AFTER_SECONDS,
) => !recordedAt || now.getTime() - new Date(recordedAt).getTime() > staleAfterSeconds * 1000;

export const locationIntervalDecision = (
  latestRecordedAt,
  incomingRecordedAt,
  minimumSeconds = env.GPS_MIN_INTERVAL_SECONDS,
) => {
  if (!latestRecordedAt) return { accepted: true, retryAfterSeconds: 0 };
  const differenceMs =
    new Date(incomingRecordedAt).getTime() - new Date(latestRecordedAt).getTime();
  if (differenceMs <= 0) return { accepted: false, reason: 'NOT_NEWER', retryAfterSeconds: 0 };
  const remainingMs = minimumSeconds * 1000 - differenceMs;
  if (remainingMs > 0) {
    return {
      accepted: false,
      reason: 'THROTTLED',
      retryAfterSeconds: Math.ceil(remainingMs / 1000),
    };
  }
  return { accepted: true, retryAfterSeconds: 0 };
};

export const loadTrackingView = async (reservationId) => {
  const assignments = await query(
    `SELECT ada.id,ada.reservation_details_id AS reservationDetailsId,ada.status,
            ada.scheduled_start_at AS scheduledStartAt,ada.scheduled_end_at AS scheduledEndAt,
            d.full_name AS chauffeurName,d.photo AS chauffeurPhoto
       FROM app_driver_assignments ada
       JOIN drivers d ON d.id=ada.driver_id
      WHERE ada.reservation_id=? AND ada.status NOT IN ('DECLINED','CANCELLED')
      ORDER BY ada.scheduled_start_at,ada.id`,
    [reservationId],
  );

  for (const assignment of assignments) {
    assignment.location = await one(
      `SELECT latitude,longitude,heading,speed,accuracy,recorded_at AS recordedAt
         FROM app_driver_locations WHERE assignment_id=? ORDER BY recorded_at DESC LIMIT 1`,
      [assignment.id],
    );
    assignment.locationIsStale = isLocationStale(assignment.location?.recordedAt);
  }

  const activeStatuses = new Set([
    'ACKNOWLEDGED',
    'PREPARING',
    'ON_THE_WAY',
    'ARRIVED',
    'WAITING',
    'PASSENGER_ONBOARD',
    'IN_SERVICE',
    'AT_STOP',
    'DROPOFF_REACHED',
  ]);
  const activeAssignment =
    assignments.find((item) => activeStatuses.has(item.status)) ?? assignments[0] ?? null;
  const timeline = await query(
    `SELECT status,note,latitude,longitude,occurred_at AS occurredAt
       FROM app_booking_status_events WHERE reservation_id=? ORDER BY occurred_at`,
    [reservationId],
  );
  return {
    assignment: activeAssignment,
    location: activeAssignment?.location ?? null,
    locationIsStale: activeAssignment?.locationIsStale ?? true,
    staleAfterSeconds: env.GPS_STALE_AFTER_SECONDS,
    serverTime: new Date().toISOString(),
    assignments,
    timeline,
  };
};
