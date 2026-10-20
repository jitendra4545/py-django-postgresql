import 'dotenv/config';
import dns from 'node:dns/promises';
import https from 'node:https';
import { HttpsProxyAgent } from 'https-proxy-agent';

const host = 'api.stripe.com';
const proxy = process.env.STRIPE_PROXY_URL?.trim();
const rawTimeout = Number(process.env.STRIPE_TIMEOUT_MS || '12000');
const timeout = Number.isFinite(rawTimeout) ? Math.max(2000, Math.min(30000, rawTimeout)) : 12000;

console.log('Stripe connectivity diagnostics');
console.log('Proxy configured:', Boolean(proxy));
console.log('This test does not use or print any API keys.');
try {
  const records = await dns.lookup(host, { all: true });
  console.log('DNS:', records.map(({ address, family }) => `${address} (IPv${family})`).join(', '));
} catch (error) {
  console.error('DNS lookup failed:', error.code || error.message);
  process.exitCode = 1;
}

try {
  const status = await new Promise((resolve, reject) => {
    const request = https.get({
      hostname: host,
      port: 443,
      path: '/v1/balance',
      method: 'GET',
      timeout,
      ...(proxy ? { agent: new HttpsProxyAgent(proxy) } : {}),
    }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.once('timeout', () => request.destroy(Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT' })));
    request.once('error', reject);
  });
  console.log('Stripe HTTPS status:', status);
  if ([200, 401, 403].includes(status)) {
    console.log('SUCCESS: Stripe HTTPS endpoint was reached. HTTP 401 without an API key is expected.');
  } else {
    console.log('Stripe replied but returned an unexpected status; investigate upstream/proxy response.');
    process.exitCode = 1;
  }
} catch (error) {
  console.error('FAILED: Node.js cannot reach Stripe HTTPS:', error.code || error.name, error.message);
  console.error('Check firewall/ISP/VPN or use an authorized HTTPS proxy in STRIPE_PROXY_URL.');
  process.exitCode = 1;
}
