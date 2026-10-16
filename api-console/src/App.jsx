import { useMemo, useState } from 'react';
import {
  BookOpenCheck,
  ChevronRight,
  Database,
  ExternalLink,
  ListChecks,
  Search,
  Settings2,
  UsersRound,
} from 'lucide-react';
import EndpointRunner from './EndpointRunner.jsx';
import LoginPanel from './LoginPanel.jsx';
import {
  clearSession,
  DEFAULT_SERVER_URL,
  loadBaseUrl,
  loadSession,
  normalizeApiBaseUrl,
  saveBaseUrl,
  saveSession,
  swaggerUrl,
} from './api.js';
import { endpoints } from './openapi.js';
import { portals, sharedActions } from './flows.js';

const endpointByKey = new Map(endpoints.map((endpoint) => [endpoint.key, endpoint]));

export default function App() {
  const [portalKey, setPortalKey] = useState('client-agent');
  const [flowName, setFlowName] = useState('Client');
  const [mode, setMode] = useState('guided');
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState('All');
  const [baseUrl, setBaseUrl] = useState(loadBaseUrl);
  const [session, setSessionState] = useState(loadSession);
  const [selectedKey, setSelectedKey] = useState('POST /auth/login');

  const portal = portals[portalKey];
  const flow = portal.flows[flowName] ?? Object.values(portal.flows)[0];
  const selectedEndpoint = endpointByKey.get(selectedKey) ?? endpoints[0];

  const updateSession = (next) => {
    setSessionState(next);
    if (next.user || next.tokens) saveSession(next);
    else clearSession();
  };

  const choosePortal = (key) => {
    setPortalKey(key);
    const firstFlow = Object.keys(portals[key].flows)[0];
    setFlowName(firstFlow);
    setTag('All');
    const firstEndpoint = endpointByKey.get(portals[key].flows[firstFlow][0]);
    if (firstEndpoint) setSelectedKey(firstEndpoint.key);
  };

  const visibleEndpoints = useMemo(() => {
    const lowered = search.trim().toLowerCase();
    return endpoints.filter((endpoint) => {
      const portalMatch = showAll || portal.tags.includes(endpoint.tag);
      const tagMatch = tag === 'All' || endpoint.tag === tag;
      const searchMatch =
        !lowered ||
        `${endpoint.method} ${endpoint.path} ${endpoint.summary} ${endpoint.tag}`
          .toLowerCase()
          .includes(lowered);
      return portalMatch && tagMatch && searchMatch;
    });
  }, [portal, search, showAll, tag]);

  const tags = showAll ? [...new Set(endpoints.map((item) => item.tag))] : portal.tags;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">DL</div>
          <div>
            <strong>Drive Luxury</strong>
            <span>Release 1 API Console</span>
          </div>
        </div>
        <div className="base-url">
          <Database size={17} />
          <div className="base-url-control">
            <label htmlFor="base-url">Backend domain or localhost URL</label>
            <input
              id="base-url"
              type="url"
              spellCheck="false"
              placeholder={DEFAULT_SERVER_URL}
              value={baseUrl}
              onChange={(event) => {
                setBaseUrl(event.target.value);
                saveBaseUrl(event.target.value);
              }}
            />
            <small>Requests use: {normalizeApiBaseUrl(baseUrl)}</small>
          </div>
          <button
            type="button"
            className="localhost-button"
            onClick={() => {
              setBaseUrl(DEFAULT_SERVER_URL);
              saveBaseUrl(DEFAULT_SERVER_URL);
            }}
          >
            Localhost
          </button>
        </div>
        <a className="docs-link" href={swaggerUrl(baseUrl)} target="_blank" rel="noreferrer">
          Swagger <ExternalLink size={15} />
        </a>
      </header>

      <LoginPanel baseUrl={baseUrl} session={session} onSession={updateSession} />

      <nav className="portal-tabs" aria-label="Application workspace">
        {Object.entries(portals).map(([key, item]) => (
          <button
            key={key}
            className={portalKey === key ? 'active' : ''}
            onClick={() => choosePortal(key)}
          >
            <UsersRound size={18} />{' '}
            <span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
          </button>
        ))}
      </nav>

      <main className="workspace">
        <aside className="sidebar panel">
          <div className="mode-switch">
            <button className={mode === 'guided' ? 'active' : ''} onClick={() => setMode('guided')}>
              <ListChecks size={16} /> Guided flow
            </button>
            <button
              className={mode === 'explorer' ? 'active' : ''}
              onClick={() => setMode('explorer')}
            >
              <Settings2 size={16} /> API explorer
            </button>
          </div>

          {mode === 'guided' ? (
            <>
              <label className="select-label">
                Flow
                <select value={flowName} onChange={(event) => setFlowName(event.target.value)}>
                  {Object.keys(portal.flows).map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <div className="flow-list">
                {flow.map((key, index) => {
                  const item = endpointByKey.get(key);
                  if (!item) return null;
                  return (
                    <button
                      key={key}
                      className={selectedKey === key ? 'active' : ''}
                      onClick={() => setSelectedKey(key)}
                    >
                      <span className="step-number">{index + 1}</span>
                      <span>
                        <strong>{item.summary}</strong>
                        <code>
                          {item.method} {item.path}
                        </code>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  );
                })}
              </div>
              <div className="shared-block">
                <h3>Shared actions</h3>
                {sharedActions
                  .filter((key) => endpointByKey.has(key))
                  .map((key) => (
                    <button key={key} onClick={() => setSelectedKey(key)}>
                      {key}
                    </button>
                  ))}
              </div>
            </>
          ) : (
            <>
              <label className="search-box">
                <Search size={17} />
                <input
                  placeholder="Search all endpoints"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(event) => {
                    setShowAll(event.target.checked);
                    setTag('All');
                  }}
                />{' '}
                Show all {endpoints.length} APIs
              </label>
              <label className="select-label">
                Module
                <select value={tag} onChange={(event) => setTag(event.target.value)}>
                  <option>All</option>
                  {tags.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <div className="endpoint-count">
                {visibleEndpoints.length} of {endpoints.length} operations
              </div>
              <div className="endpoint-list">
                {visibleEndpoints.map((item) => (
                  <button
                    key={item.key}
                    className={selectedKey === item.key ? 'active' : ''}
                    onClick={() => setSelectedKey(item.key)}
                  >
                    <span className={`method method-${item.method.toLowerCase()}`}>
                      {item.method}
                    </span>
                    <span>
                      <code>{item.path}</code>
                      <small>{item.summary}</small>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>

        <div className="content-column">
          <section className="workspace-heading">
            <div>
              <div className="eyebrow">{portal.label} workspace</div>
              <h1>
                {mode === 'guided' ? `${flowName} integration flow` : 'Complete API explorer'}
              </h1>
            </div>
            <div className="coverage">
              <BookOpenCheck size={18} />
              <strong>{endpoints.length}</strong>
              <span>documented operations</span>
            </div>
          </section>
          <EndpointRunner
            key={selectedEndpoint.key}
            endpoint={selectedEndpoint}
            baseUrl={baseUrl}
            session={session}
            onSession={updateSession}
          />
        </div>
      </main>
    </div>
  );
}
