import { env } from '../config/env.js';

// Code-owned SQL projections replace the former database VIEW dependency.
// These are SELECT expressions, never schema objects. The app_* tables with
// the same names in the supplied dump are independent historical stores.
const literal = value => `'${String(value).replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
export const NATIVE_NOTIFICATIONS = `(SELECT mobile_notification_id AS id,
  notifiable_id AS user_id,type,JSON_UNQUOTE(JSON_EXTRACT(data,'$.title')) AS title,
  JSON_UNQUOTE(JSON_EXTRACT(data,'$.body')) AS body,
  JSON_REMOVE(data,'$.title','$.body') AS data,read_at,created_at
  FROM notifications WHERE notifiable_type=${literal(env.LEGACY_USER_MODEL)}
  AND mobile_notification_id IS NOT NULL)`;

export const NATIVE_MESSAGES = `(SELECT COALESCE(m.mobile_message_id,m.id) AS id,
  c.id AS conversation_id,m.sender_id AS sender_user_id,
  IF(m.mobile_document_id IS NULL,'TEXT','DOCUMENT') AS message_type,
  m.body,m.mobile_document_id AS document_id,m.created_at,m.deleted_at
  FROM reservation_messages m JOIN app_conversations c ON c.reservation_id=m.reservation_id)`;

export const NATIVE_DOCUMENTS = `(SELECT COALESCE(f.mobile_document_id,f.id) AS id,
  f.created_by AS owner_user_id,
  (SELECT rf.reservation_id FROM reservation_files rf WHERE rf.mobile_file_manager_id=f.id ORDER BY rf.id LIMIT 1) AS reservation_id,
  f.mobile_category AS category,COALESCE(f.mobile_original_name,f.file_org_name) AS original_name,
  m.disk AS storage_disk,m.path AS storage_key,f.mobile_visibility AS visibility,
  m.mime_type,m.size AS size_bytes,f.mobile_expires_at AS expires_at,
  f.created_at,f.updated_at,f.deleted_at
  FROM file_managers f JOIN media_files m ON m.id=f.mobile_media_file_id
  WHERE f.mobile_visibility='PRIVATE')`;

const inquiry = kind => `(SELECT COALESCE(mobile_request_id,id) AS id,
  mobile_customer_id AS customer_id,mobile_agency_id AS agency_id,
  mobile_created_by_user_id AS created_by_user_id,
  ${kind === 'VIP' ? `pickup_location AS airport,
    JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.mobile.terminal')) AS terminal,
    TIMESTAMP(pickup_date,pickup_time) AS service_at,
    number_of_passengers AS passenger_count,flight_train_number AS flight_number,` : `
    JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.mobile.category')) AS category,
    JSON_UNQUOTE(JSON_EXTRACT(metadata,'$.mobile.requestedFor')) AS requested_for,
    pickup_location AS city,`}
  message_details AS request_text,mobile_request_status AS status,
  mobile_operations_note AS operations_note,created_at,updated_at
  FROM contacts WHERE mobile_request_kind='${kind}')`;
export const NATIVE_VIP_REQUESTS = inquiry('VIP');
export const NATIVE_CONCIERGE_REQUESTS = inquiry('CONCIERGE');
