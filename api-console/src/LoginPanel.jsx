import { useState } from 'react';
import { KeyRound, LogIn, LogOut, UserRound } from 'lucide-react';
import { endpoints } from './openapi.js';
import { runEndpoint } from './api.js';

const loginEndpoint = endpoints.find((endpoint) => endpoint.key === 'POST /auth/login');

export default function LoginPanel({ baseUrl, session, onSession }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const login = async (event) => {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      const result = await runEndpoint({
        baseUrl,
        endpoint: loginEndpoint,
        body: {
          email,
          password,
          device: {
            deviceId: `web-console-${crypto.randomUUID()}`,
            platform: 'WEB',
            appVersion: '1.0.0',
          },
        },
      });
      if (!result.ok)
        throw new Error(result.data?.error?.message ?? `Login failed (${result.status})`);
      onSession({ user: result.data.user, tokens: result.data.tokens });
      setPassword('');
      setMessage(`Logged in as ${result.data.user.roleName}`);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  };

  if (session.user) {
    return (
      <section className="login-panel signed-in">
        <UserRound size={19} />
        <div>
          <strong>{session.user.fullName}</strong>
          <span>
            {session.user.email} · {session.user.roleName}
          </span>
        </div>
        <button className="secondary-button" onClick={() => onSession({})}>
          <LogOut size={16} /> Clear local session
        </button>
      </section>
    );
  }

  return (
    <form className="login-panel" onSubmit={login}>
      <KeyRound size={20} />
      <label>
        <span>Email</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label>
        <span>Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      <button className="primary-button" disabled={loading}>
        <LogIn size={16} /> {loading ? 'Logging in…' : 'Login'}
      </button>
      {message && <span className="login-message">{message}</span>}
    </form>
  );
}
