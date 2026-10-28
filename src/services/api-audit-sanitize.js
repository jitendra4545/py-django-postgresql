// Keep HTTP diagnostics useful without persisting credentials or private client data.
// This is deliberately conservative: adding a new API field should not silently
// make authentication, payment, or precise location data appear in the audit table.
const SENSITIVE_KEY = /password|passwd|passphrase|secret|(?:api|private|public)[_-]?key|auth(?:orization|entication)?|cookie|(?:access|refresh|id|push|reset|verification|session|invitation)[_-]?token|token(?:[_-]?hash)?|otp|one[_-]?time|(?:^|[_-])pin$|cvv|cvc|card|iban|swift|bank[_-]?account|account[_-]?number|client[_-]?secret|signature|signed[_-]?url|(?:download|callback|redirect)[_-]?url|^url$|credential/i;
const PERSONAL_KEY = /email|phone|mobile|telephone|(?:full|first|last|customer|passenger|recipient|contact)[_-]?name|^name$|street|address|original[_-]?name|filename|device[_-]?id|postal|zip[_-]?code|birth|dob|passport|identity|national[_-]?id|license[_-]?number|licence[_-]?number|place[_-]?id|latitude|longitude|^lat$|^lon$|^lng$|coordinate|gps|^location$|search|^input$|^q$/i;
const BANNED_CONTENT = /Bearer\s+[a-z\d._~+\/-]+|\b(?:sk_(?:test|live)_|pk_(?:test|live)_|whsec_|rk_(?:test|live)_)[a-z\d]+|ExponentPushToken\[[^\]]+\]|ExpoPushToken\[[^\]]+\]|\beyJ[a-z\d_-]+\.eyJ[a-z\d_-]+\.[a-z\d_-]+/gi;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const E164_PHONE = /\+\d{7,15}\b/g;
const LONG_PHONE = /\b\d{10,15}\b/g;
const MAX_STRING_LENGTH = 500;
const MAX_DEPTH = 7;
const MAX_KEYS = 60;
const MAX_ARRAY = 30;

export const redactText = (text) => {
  const value = String(text)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(BANNED_CONTENT, '[REDACTED_SECRET]')
    .replace(EMAIL, '[REDACTED_EMAIL]')
    .replace(E164_PHONE, '[REDACTED_PHONE]')
    .replace(LONG_PHONE, '[REDACTED_PHONE]');
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...[TRUNCATED]` : value;
};

export const redactValue = (value, depth = 0, seen = new WeakSet()) => {
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value ?? null;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'string') return redactText(value);
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return '[BINARY_OMITTED]';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '[INVALID_DATE]' : value.toISOString();
  if (typeof value !== 'object') return '[UNSUPPORTED_VALUE]';
  if (depth >= MAX_DEPTH) return '[MAX_DEPTH]';
  if (seen.has(value)) return '[CIRCULAR]';
  seen.add(value);
  let result;
  if (Array.isArray(value)) {
    result = value.slice(0, MAX_ARRAY).map((item) => redactValue(item, depth + 1, seen));
    if (value.length > MAX_ARRAY) result.push(`[${value.length - MAX_ARRAY} MORE ITEMS]`);
  } else {
    result = {};
    const keys = Object.keys(value);
    for (const key of keys.slice(0, MAX_KEYS)) {
      if (SENSITIVE_KEY.test(key) || PERSONAL_KEY.test(key)) {
        result[key] = '[REDACTED]';
      } else {
        try {
          result[key] = redactValue(value[key], depth + 1, seen);
        } catch {
          result[key] = '[UNREADABLE]';
        }
      }
    }
    if (keys.length > MAX_KEYS) result._omittedKeys = keys.length - MAX_KEYS;
  }
  seen.delete(value);
  return result;
};

const utf8Prefix = (value, maxBytes) => {
  const bytes = Buffer.from(value, 'utf8');
  return bytes.subarray(0, maxBytes).toString('utf8');
};

export const safeAuditJson = (value, maxBytes = 8192) => {
  if (value === undefined || value === null) return null;
  const redacted = redactValue(value);
  const serialized = JSON.stringify(redacted);
  if (Buffer.byteLength(serialized, 'utf8') <= maxBytes) return redacted;
  return { _truncated: true, preview: utf8Prefix(serialized, Math.max(128, maxBytes - 256)) };
};

export const safeAuditPath = (path) => {
  const clean = String(path || '/')
    .split('?')[0]
    .replace(/\/[^/]{49,}(?=\/|$)/g, '/[REDACTED_PATH_SEGMENT]')
    .replace(/\/(password-reset|reset-password|invitation|invitations|verify-email)\/[^/]+/gi, '/$1/[REDACTED]');
  return redactText(clean).slice(0, 512);
};

export const isProtectedAuditPayload = (path) =>
  /\/(?:payments\/webhook|communication\/telnyx\/webhook)(?:\/|$)/.test(path);
