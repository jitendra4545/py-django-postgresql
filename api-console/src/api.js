const SESSION_KEY = 'driveLuxuryApiConsoleSession';
const BASE_URL_KEY = 'driveLuxuryApiConsoleBaseUrl';
export const DEFAULT_SERVER_URL = 'http://localhost:3000';

export const loadSession = () => {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) ?? {};
  } catch {
    return {};
  }
};

export const saveSession = (session) => {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
};

export const clearSession = () => localStorage.removeItem(SESSION_KEY);

export const loadBaseUrl = () => {
  const saved = localStorage.getItem(BASE_URL_KEY)?.trim();
  // Migrate the old Vite-proxy default to a direct backend connection.
  return !saved || saved === '/api/v1' ? DEFAULT_SERVER_URL : saved;
};

export const saveBaseUrl = (value) => localStorage.setItem(BASE_URL_KEY, value.trim());

export const normalizeApiBaseUrl = (value) => {
  const serverUrl = value.trim().replace(/\/+$/, '') || DEFAULT_SERVER_URL;
  return /\/api\/v1$/i.test(serverUrl) ? serverUrl : `${serverUrl}/api/v1`;
};

export const swaggerUrl = (value) => {
  const apiBaseUrl = normalizeApiBaseUrl(value);
  return `${apiBaseUrl.replace(/\/api\/v1$/i, '')}/docs`;
};

const joinUrl = (baseUrl, path) => `${normalizeApiBaseUrl(baseUrl)}${path}`;

const parseResponse = async (response) => {
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return response.json();
  if (contentType.startsWith('text/')) return response.text();
  const blob = await response.blob();
  return {
    binary: true,
    size: blob.size,
    type: blob.type,
    downloadUrl: URL.createObjectURL(blob),
  };
};

const buildRequest = ({ endpoint, values, body, extraHeaders, file, accessToken }) => {
  let path = endpoint.path;
  const query = new URLSearchParams();
  const headers = { Accept: 'application/json', ...extraHeaders };

  for (const parameter of endpoint.parameters) {
    const value = values[parameter.name];
    if (value === '' || value === undefined || value === null) continue;
    if (parameter.in === 'path')
      path = path.replace(`{${parameter.name}}`, encodeURIComponent(value));
    if (parameter.in === 'query') query.set(parameter.name, value);
    if (parameter.in === 'header') headers[parameter.name] = value;
  }

  if (accessToken && endpoint.protected) headers.Authorization = `Bearer ${accessToken}`;
  const suffix = query.size ? `?${query}` : '';
  const options = { method: endpoint.method, headers };

  if (endpoint.contentType === 'multipart/form-data') {
    const form = new FormData();
    for (const [key, value] of Object.entries(body ?? {})) {
      if (value !== '' && value !== undefined && value !== null && key !== 'file')
        form.append(key, value);
    }
    if (file) form.append('file', file);
    options.body = form;
  } else if (body !== null && !['GET', 'DELETE'].includes(endpoint.method)) {
    headers['Content-Type'] = endpoint.contentType ?? 'application/json';
    options.body = headers['Content-Type'].includes('json') ? JSON.stringify(body) : String(body);
  }
  return { path: `${path}${suffix}`, options };
};

const execute = async (baseUrl, request) => {
  const startedAt = performance.now();
  const response = await fetch(joinUrl(baseUrl, request.path), request.options);
  const data = await parseResponse(response);
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    durationMs: Math.round(performance.now() - startedAt),
    headers: Object.fromEntries(response.headers.entries()),
    data,
  };
};

export const runEndpoint = async ({
  baseUrl,
  endpoint,
  values = {},
  body = null,
  extraHeaders = {},
  file = null,
  session = {},
  onSession,
}) => {
  const first = buildRequest({
    endpoint,
    values,
    body,
    extraHeaders,
    file,
    accessToken: session.tokens?.accessToken,
  });
  let result = await execute(baseUrl, first);
  const mayRefresh =
    result.status === 401 &&
    session.tokens?.refreshToken &&
    endpoint.path !== '/auth/refresh' &&
    endpoint.path !== '/auth/login';

  if (mayRefresh) {
    const refresh = await execute(baseUrl, {
      path: '/auth/refresh',
      options: {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.tokens.refreshToken }),
      },
    });
    if (refresh.ok && refresh.data?.tokens) {
      const nextSession = { ...session, tokens: refresh.data.tokens };
      onSession?.(nextSession);
      const retry = buildRequest({
        endpoint,
        values,
        body,
        extraHeaders,
        file,
        accessToken: nextSession.tokens.accessToken,
      });
      result = await execute(baseUrl, retry);
      result.refreshedSession = true;
    }
  }
  return result;
};
