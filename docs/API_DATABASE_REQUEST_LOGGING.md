# Drive Luxury: database-backed HTTP request/response logs

The API continues to print Morgan logs to the console, for example:

```text
GET /api/v1/notifications/unread-count 304 1679.043 ms
```

With audit logging enabled, it also stores a **redacted diagnostic record** in `route_access_logs`, including method, path, status, duration in milliseconds, query parameters, request JSON, response JSON, authenticated user ID/role (if available), request ID, client IP, user-agent, response content type, and error code.

A `304 Not Modified` has **no HTTP response body**, so `mobile_response_body` is stored as `NULL` even if Express generated a JSON representation internally. A prematurely disconnected client is recorded with diagnostic status `499` and `CLIENT_DISCONNECTED` (this is an internal audit value, not an HTTP response sent by Express). A GET normally has no request body. Console log timing and the DB's duration may differ slightly because they are recorded by separate middleware.

## Setup (release 2.4.0)

Apply the shared database migration using the root `START_HERE_SHARED_DATABASE.md` guide first. Migration 008 moves old audit rows into the existing client `route_access_logs` table. `npm run audit:setup` now verifies shared-schema readiness; it does not recreate an obsolete app audit table or bypass checksum conflicts.

Keep the existing backend settings:

```dotenv
API_AUDIT_LOG_ENABLED=true
API_AUDIT_LOG_MAX_BODY_BYTES=8192
API_AUDIT_LOG_MAX_QUEUE=2000
API_AUDIT_LOG_BATCH_SIZE=50
API_AUDIT_LOG_FLUSH_MS=1000
API_AUDIT_LOG_RETENTION_DAYS=14
```

Restart only after schema verification. Stored request/response content remains redacted. Both automated retention and `audit:prune` delete only mobile-origin rows, not the client's other access logs. The eight source app tables are inactive migration snapshots.

## Example MySQL queries

Latest 20 requests:

```sql
SELECT id, created_at, mobile_access_line, mobile_actor_user_id, ip_address, mobile_error_code
FROM route_access_logs
WHERE mobile_source='MOBILE_API'
ORDER BY id DESC LIMIT 20;
```

Full request and response data:

```sql
SELECT created_at, mobile_request_id, method, mobile_request_path, status_code, mobile_duration_ms,
       query_params, request_body, mobile_response_body, mobile_actor_user_id, mobile_actor_role,
       ip_address, mobile_response_content_type, mobile_response_bytes, mobile_error_code
FROM route_access_logs
WHERE mobile_source='MOBILE_API'
ORDER BY id DESC LIMIT 20;
```

Errors for the past day:

```sql
SELECT created_at, mobile_access_line, request_body, mobile_response_body, mobile_error_code
FROM route_access_logs
WHERE mobile_source='MOBILE_API' AND status_code >= 400 AND created_at >= NOW() - INTERVAL 1 DAY
ORDER BY id DESC LIMIT 50;
```

Logs for a specific API:

```sql
SELECT created_at, mobile_access_line, query_params, request_body, mobile_response_body
FROM route_access_logs
WHERE mobile_source='MOBILE_API' AND mobile_request_path = '/api/v1/notifications/unread-count'
ORDER BY id DESC LIMIT 50;
```

Correlate a frontend report to the API call by reading the `X-Request-ID` response header and then searching `mobile_request_id`.

## Security and behavior

- **Enabled only after explicit opt-in** (`API_AUDIT_LOG_ENABLED=false` by default), so an unmigrated database will not generate logging errors.
- Never saves `Authorization` or `Cookie` request headers, JWTs, access/refresh/Expo tokens, passwords, OTPs, API keys, secrets, card/bank details, email/phone/name/address, precise GPS, signed URLs, file bytes, or raw Stripe/Telnyx webhook payloads. Authenticated user numeric ID is stored when the auth middleware has resolved it.
- Uploads record limited file metadata (such as count), **not** private document content. Private chat bodies are omitted, even if a new chat API sends a nested text object.
- Truncates large nested data, limits strings/arrays/depth, and never logs raw credentials deliberately placed in regular free-text values when they match known credential formats. This is defense in depth, **not a guarantee** of eliminating every possible user-entered secret. Control database access accordingly.
- Logging is **best effort**. The bounded in-memory queue batches inserts after requests complete. DB errors never make successful business API calls fail; a long DB outage may drop audit records. Use a central log service or a durable outbox if legally required to record every request with no gaps.
- Existing Morgan console logs, signed webhooks, authentication, HTTP/ETag/304 behavior, booking logic, payment, Twilio/Telnyx, and real-time tracking are unchanged. Socket.IO events are **not** HTTP requests and are not included in this API log table.
- Auto-prunes audit rows older than the configured retention period in small batches every five minutes. For manual cleanup run `npm run audit:prune` (deletes up to 5000 expired rows).
- Do not make this table publicly accessible through a client/agent/chauffeur endpoint. Restrict MySQL query access to authorized operators, follow local retention/privacy policies, and keep database backups appropriately encrypted.

## Validation

```bash
npm run audit:selftest
npm run syntax:check
```

The audit self-test runs without a live MySQL connection; successful MySQL logging must still be verified on the staging/production database after applying migration 008.
