import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  isProtectedAuditPayload,
  safeAuditJson,
  safeAuditPath,
  redactText,
} from '../services/api-audit-sanitize.js';

const limited = (value, max) => (value == null ? null : redactText(String(value)).slice(0, max));

// Create an isolated middleware so it can be regression-tested without a live MySQL server.
// All work that could perform I/O is deferred until AFTER the response has finished.
export const createApiAuditMiddleware = ({
  enqueue,
  apiPrefix = '/api/v1',
  maxPayloadBytes = 8192,
}) => {
  const normalizedPrefix = apiPrefix.replace(/\/$/, '');
  return (request, response, next) => {
    const rawPath = request.originalUrl?.split('?')[0] ?? request.path ?? '/';
    if (rawPath !== normalizedPrefix && !rawPath.startsWith(`${normalizedPrefix}/`)) {
      next();
      return;
    }

    const startedAt = performance.now();
    const requestId = randomUUID();
    const path = safeAuditPath(rawPath);
    let responseBody;

    // Preserve Express' response methods and status/ETag semantics, including 304.
    const originalJson = response.json;
    response.json = function auditJson(body) {
      responseBody = body;
      return originalJson.call(this, body);
    };
    const originalSend = response.send;
    response.send = function auditSend(body) {
      if (responseBody === undefined && typeof body === 'string') {
        if (String(this.getHeader('content-type') ?? '').includes('json')) {
          try {
            responseBody = JSON.parse(body);
          } catch {
            responseBody = '[NON_JSON_BODY]';
          }
        } else {
          responseBody = '[NON_JSON_RESPONSE_OMITTED]';
        }
      }
      return originalSend.call(this, body);
    };

    response.setHeader('X-Request-ID', requestId);
    let recorded = false;
    const record = (aborted = false) => {
      if (recorded) return;
      recorded = true;
      try {
        const durationMs = Math.round((performance.now() - startedAt) * 1000) / 1000;
        const status = aborted ? 499 : response.statusCode;
        const incoming = isProtectedAuditPayload(rawPath)
          ? { _omitted: 'SIGNED_WEBHOOK_PAYLOAD' }
          : /\/(?:chat|conversations|messages)(?:\/|$)/i.test(rawPath)
            ? { _omitted: 'PRIVATE_CHAT_CONTENT' }
          : request.is?.('multipart/form-data')
            ? {
                _omitted: 'MULTIPART_FILE_CONTENT',
                fileCount: request.files?.length ?? (request.file ? 1 : 0),
              }
            : safeAuditJson(request.body, maxPayloadBytes);
        const isPrivateCommunication = /\/(?:chat|conversations|messages)(?:\/|$)/i.test(rawPath);
        const outgoing = aborted || status === 204 || status === 304
          ? null
          : isPrivateCommunication
            ? { _omitted: 'PRIVATE_CHAT_CONTENT' }
            : safeAuditJson(responseBody, maxPayloadBytes);
        const errorCode = aborted ? 'CLIENT_DISCONNECTED' : outgoing?.error?.code;
        const method = limited(request.method, 10) ?? 'GET';
        const contentLength = response.getHeader('content-length');
        const bytes = contentLength == null ? null : Number(contentLength);
        enqueue({
          requestId,
          method,
          path,
          accessLine: `${method} ${path} ${status} ${durationMs.toFixed(3)} ms`.slice(0, 800),
          statusCode: status,
          durationMs,
          requestQuery: safeAuditJson(request.query, maxPayloadBytes),
          requestBody: incoming,
          responseBody: outgoing,
          userId: Number.isSafeInteger(Number(request.auth?.userId))
            ? Number(request.auth.userId)
            : null,
          userRole: Number.isSafeInteger(Number(request.auth?.role))
            ? Number(request.auth.role)
            : null,
          ipAddress: limited(request.ip ?? request.socket?.remoteAddress, 45),
          userAgent: limited(request.headers?.['user-agent'], 255),
          contentType: limited(response.getHeader('content-type'), 120),
          responseBytes: Number.isSafeInteger(bytes) && bytes >= 0 ? bytes : null,
          errorCode: typeof errorCode === 'string' ? limited(errorCode, 120) : null,
        });
      } catch (error) {
        // Logging must never change API behavior, including failed requests.
        console.warn('API audit record skipped', { code: error?.code ?? 'SANITIZE_FAILED' });
      }
    };
    response.once('finish', () => record(false));
    response.once('close', () => record(true));
    next();
  };
};
