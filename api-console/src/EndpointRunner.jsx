import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, FileUp, Play, ShieldCheck } from 'lucide-react';
import { runEndpoint } from './api.js';

const pretty = (value) => JSON.stringify(value, null, 2);

export default function EndpointRunner({ endpoint, baseUrl, session, onSession }) {
  const [values, setValues] = useState(endpoint.initialParameters);
  const [bodyText, setBodyText] = useState(
    endpoint.bodySample === null ? '' : pretty(endpoint.bodySample),
  );
  const [headersText, setHeadersText] = useState('{}');
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);

  const groups = useMemo(
    () => ({
      path: endpoint.parameters.filter((parameter) => parameter.in === 'path'),
      query: endpoint.parameters.filter((parameter) => parameter.in === 'query'),
      header: endpoint.parameters.filter((parameter) => parameter.in === 'header'),
    }),
    [endpoint],
  );

  const execute = async () => {
    setRunning(true);
    setError('');
    try {
      const body = bodyText.trim() ? JSON.parse(bodyText) : null;
      const extraHeaders = headersText.trim() ? JSON.parse(headersText) : {};
      const response = await runEndpoint({
        baseUrl,
        endpoint,
        values,
        body,
        extraHeaders,
        file,
        session,
        onSession,
      });
      setResult(response);
      if (endpoint.path === '/auth/login' && response.ok && response.data?.tokens) {
        onSession({ user: response.data.user, tokens: response.data.tokens });
      }
      if (endpoint.path === '/auth/client/register' && response.ok && response.data?.tokens) {
        onSession({ user: response.data.user, tokens: response.data.tokens });
      }
      if (endpoint.path === '/auth/logout' && response.ok) onSession({});
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRunning(false);
    }
  };

  const copyResponse = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(pretty(result));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <section className="runner panel">
      <header className="runner-header">
        <div>
          <div className="eyebrow">{endpoint.tag}</div>
          <h2>
            <span className={`method method-${endpoint.method.toLowerCase()}`}>
              {endpoint.method}
            </span>{' '}
            <code>{endpoint.path}</code>
          </h2>
          <p>{endpoint.summary}</p>
          {endpoint.description && <p className="muted">{endpoint.description}</p>}
        </div>
        <div className="endpoint-flags">
          {endpoint.protected && (
            <span className="flag">
              <ShieldCheck size={15} /> Bearer token
            </span>
          )}
          {endpoint.serverOnly && <span className="flag warning">Stripe server only</span>}
          {endpoint.developmentOnly && <span className="flag warning">Development only</span>}
        </div>
      </header>

      {endpoint.serverOnly && (
        <div className="notice warning-notice">
          <AlertTriangle size={18} /> This endpoint normally receives a raw, signed Stripe event. A
          manual request will fail unless you provide a valid signature and payload.
        </div>
      )}

      {Object.entries(groups).map(([location, parameters]) =>
        parameters.length ? (
          <fieldset key={location}>
            <legend>{location} parameters</legend>
            <div className="field-grid">
              {parameters.map((parameter) => (
                <label key={`${location}-${parameter.name}`}>
                  <span>
                    {parameter.name}
                    {parameter.required ? ' *' : ''}
                  </span>
                  <input
                    value={values[parameter.name] ?? ''}
                    onChange={(event) =>
                      setValues((current) => ({ ...current, [parameter.name]: event.target.value }))
                    }
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ) : null,
      )}

      {endpoint.bodySample !== null && (
        <label className="code-field">
          <span>Request body ({endpoint.contentType})</span>
          <textarea
            value={bodyText}
            onChange={(event) => setBodyText(event.target.value)}
            rows={12}
          />
        </label>
      )}

      {endpoint.contentType === 'multipart/form-data' && (
        <label className="file-picker">
          <FileUp size={18} />
          <span>{file ? file.name : 'Choose upload file'}</span>
          <input type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>
      )}

      <details>
        <summary>Additional request headers</summary>
        <label className="code-field">
          <span>JSON object</span>
          <textarea
            value={headersText}
            onChange={(event) => setHeadersText(event.target.value)}
            rows={4}
          />
        </label>
      </details>

      <div className="runner-actions">
        <button className="primary-button" onClick={execute} disabled={running}>
          <Play size={17} /> {running ? 'Running…' : 'Send request'}
        </button>
        <span className="muted">Base: {baseUrl}</span>
      </div>

      {error && (
        <div className="notice error-notice">
          <AlertTriangle size={18} /> {error}
        </div>
      )}

      {result && (
        <section className={`response ${result.ok ? 'response-ok' : 'response-error'}`}>
          <header>
            <div>
              {result.ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              <strong>
                {result.status} {result.statusText}
              </strong>
              <span>{result.durationMs} ms</span>
              {result.refreshedSession && <span>token refreshed</span>}
            </div>
            <button className="icon-button" onClick={copyResponse} aria-label="Copy response">
              <Copy size={17} /> {copied ? 'Copied' : 'Copy'}
            </button>
          </header>
          {result.data?.downloadUrl ? (
            <a className="download-link" href={result.data.downloadUrl} download>
              Download response ({result.data.size} bytes)
            </a>
          ) : (
            <pre>{typeof result.data === 'string' ? result.data : pretty(result.data)}</pre>
          )}
          <details>
            <summary>Response headers</summary>
            <pre>{pretty(result.headers)}</pre>
          </details>
        </section>
      )}
    </section>
  );
}
