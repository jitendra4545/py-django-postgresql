import { legacyText } from './shared-storage.js';

export const sharedAuditColumns = Object.freeze([
  'user_id', 'feature_name', 'method', 'uri', 'query_params', 'request_body',
  'ip_address', 'user_agent', 'status_code', 'duration_ms',
  'mobile_request_id', 'mobile_request_path', 'mobile_access_line', 'mobile_duration_ms',
  'mobile_response_body', 'mobile_actor_user_id', 'mobile_actor_role',
  'mobile_response_content_type', 'mobile_response_bytes', 'mobile_error_code', 'mobile_source',
]);
const json = (value) => value == null ? null : JSON.stringify(value);

// Only already-sanitized middleware entries belong here. Retain the existing
// sanitizer/queue and never broaden logging to secrets or raw credentials.
export const buildSharedAuditBatch = (entries) => {
  if (!entries.length) return null;
  const tuple = `(${sharedAuditColumns.map(() => '?').join(',')},NOW(3))`;
  return {
    sql: `INSERT INTO route_access_logs (${sharedAuditColumns.map((name) => `\`${name}\``).join(',')},mobile_created_at) VALUES ${entries.map(() => tuple).join(',')}`,
    values: entries.flatMap((entry) => [
      entry.userId, 'mobile_api', entry.method, legacyText(entry.path, 500),
      json(entry.requestQuery), json(entry.requestBody), entry.ipAddress, entry.userAgent,
      entry.statusCode, Math.round(entry.durationMs), entry.requestId, entry.path, entry.accessLine,
      entry.durationMs, json(entry.responseBody), entry.userId, entry.userRole,
      entry.contentType, entry.responseBytes, entry.errorCode, 'MOBILE_API',
    ]),
  };
};
