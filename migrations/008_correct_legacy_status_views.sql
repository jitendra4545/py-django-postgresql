-- Follow-up migration; keep original 000..007 checksums unchanged.
-- Only replaces TWO app compatibility views. It does not change, delete, or
-- redefine any existing website table, column, row, primary key, or index.
-- Preserve 'REJECTED' for mobile bookings even though the legacy numeric
-- status is 3 (website cancelled). Genuine website cancellations stay CANCELLED.
CREATE OR REPLACE ALGORITHM=MERGE VIEW app_reservation_meta AS
SELECT r.id AS reservation_id,
       COALESCE(r.service_code,CASE r.service_type WHEN 1 THEN 'CHAUFFEUR'
         WHEN 2 THEN 'CAR_RENTAL' WHEN 3 THEN 'TRANSFER' ELSE NULL END) AS service_code,
       COALESCE(r.source_channel,'BACK_OFFICE') AS source_channel,
       COALESCE(r.created_by_user_id,r.user_id) AS created_by_user_id,
       r.created_by_agent_id,
       CASE WHEN r.lifecycle_status='REJECTED' THEN 'REJECTED'
            WHEN r.status=3 THEN 'CANCELLED'
            WHEN r.status=2 THEN 'COMPLETED'
            WHEN r.lifecycle_status IS NOT NULL THEN r.lifecycle_status
            WHEN r.status=1 THEN 'CONFIRMED' ELSE 'PENDING' END AS lifecycle_status,
       COALESCE(r.currency_code,CASE WHEN r.currency='CHF' THEN 'CHF' ELSE 'EUR' END) AS currency_code,
       r.quote_snapshot_id,r.created_at,r.updated_at
  FROM reservations r;

-- The website uses reservation_drivers.status=2 for inactive, but the app
-- distinguishes DECLINED / NO_SHOW / COMPLETED from an actual cancellation.
-- Resolve mobile terminal statuses first when available; legacy-only inactive
-- records still fall back to CANCELLED without changing historic website data.
CREATE OR REPLACE VIEW app_driver_assignments AS
SELECT rdv.id,rdv.reservation_id,rdv.reservation_details_id,
       rdv.id AS legacy_reservation_driver_id,
       COALESCE(rdv.pick_up_driver_id,rdv.drop_off_driver_id) AS driver_id,
       CASE WHEN rdv.app_assignment_status IN ('DECLINED','NO_SHOW','COMPLETED','CANCELLED')
              THEN rdv.app_assignment_status
            WHEN rdv.status=2 THEN 'CANCELLED'
            WHEN r.status=3 THEN 'CANCELLED'
            WHEN r.status=2 THEN 'COMPLETED'
            ELSE COALESCE(rdv.app_assignment_status,'OFFERED') END AS status,
       COALESCE(rdv.scheduled_start_at,TIMESTAMP(rdv.pick_up_date,rdv.pick_up_time),
         TIMESTAMP(d.pick_up_date,d.pick_up_time)) AS scheduled_start_at,
       COALESCE(rdv.scheduled_end_at,TIMESTAMP(rdv.drop_off_date,rdv.drop_off_time),
         TIMESTAMP(d.drop_off_date,d.drop_off_time)) AS scheduled_end_at,
       rdv.acknowledged_at,rdv.declined_at,rdv.decline_reason,
       rdv.started_at,rdv.completed_at,
       COALESCE(rdv.assigned_by_user_id,rdv.user_id) AS assigned_by_user_id,
       rdv.created_at,rdv.updated_at
  FROM reservation_drivers rdv
  JOIN reservation_details d ON d.id=rdv.reservation_details_id
  JOIN reservations r ON r.id=rdv.reservation_id
 WHERE rdv.deleted_at IS NULL;
