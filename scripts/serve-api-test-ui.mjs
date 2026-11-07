/** Local-only Drive Luxury test UI. Never deploy this listener to a public host. */
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

const folder = resolve(dirname(fileURLToPath(import.meta.url)), '../tools/api-test-ui');
const port = Number(process.env.TEST_UI_PORT ?? 4173);
const backendPort = Number(process.env.TEST_UI_BACKEND_PORT ?? 3000);
const files = {
  '/': ['index.html','text/html; charset=utf-8'],
  '/index.html': ['index.html','text/html; charset=utf-8'],
  '/app.js': ['app.js','text/javascript; charset=utf-8'],
  '/styles.css': ['styles.css','text/css; charset=utf-8'],
};
const fail = (response, status, message) => {
  response.writeHead(status, {'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store'});
  response.end(JSON.stringify({error:message}));
};
const server = http.createServer(async (request, response) => {
  const host = request.headers.host ?? '';
  if (!new RegExp(`^(127\\.0\\.0\\.1|localhost):${port}$`).test(host)) {
    return fail(response, 403, 'Local test UI only');
  }
  const pathname = (request.url ?? '/').split('?')[0];
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if (files[pathname] && ['GET', 'HEAD'].includes(request.method)) {
    const [filename, contentType] = files[pathname];
    try {
      const data = await readFile(resolve(folder,filename));
      response.writeHead(200, {'Content-Type':contentType});
      return response.end(request.method === 'HEAD' ? undefined : data);
    } catch { return fail(response,500,'Test UI asset unavailable'); }
  }
  if (!pathname.startsWith('/api-proxy/')) return fail(response,404,'Not found');
  const path = request.url.slice('/api-proxy'.length);
  if (!(path === '/health' || path.startsWith('/api/v1/'))) {
    return fail(response,403,'Only this backend health check and API routes are allowed');
  }
  if (!['GET','POST','PUT','PATCH','DELETE'].includes(request.method)) {
    return fail(response,405,'Method not supported');
  }
  // Prevent path traversal, URL injection, and off-host proxying.
  if (path.includes('\\') || path.includes('//') || /[\r\n]/.test(path)) return fail(response,400,'Invalid path');
  try {
    const parts=[];
    let size=0;
    for await (const part of request) {
      size+=part.length;
      if (size>1024*1024) return fail(response,413,'Request too large');
      parts.push(part);
    }
    const abort=new AbortController();
    const timeout=setTimeout(()=>abort.abort(),20000);
    try {
      const headers = {'Accept':'application/json'};
      if (request.headers.authorization) headers.Authorization = request.headers.authorization;
      if (request.headers['content-type']) headers['Content-Type'] = request.headers['content-type'];
      if (request.headers['idempotency-key']) headers['Idempotency-Key'] = request.headers['idempotency-key'];
      const upstream = await fetch(`http://127.0.0.1:${backendPort}${path}`, {
        method:request.method,headers,
        body:['GET','HEAD'].includes(request.method)?undefined:Buffer.concat(parts),
        signal:abort.signal,
      });
      const raw=await upstream.arrayBuffer();
      response.writeHead(upstream.status,{'Content-Type':upstream.headers.get('content-type')??'application/json; charset=utf-8','Cache-Control':'no-store'});
      return response.end(Buffer.from(raw));
    } finally {clearTimeout(timeout);}
  } catch (error) {
    return fail(response,502,`Local backend unavailable (${error?.cause?.code??error?.name??'network error'}). Start npm start on port ${backendPort}.`);
  }
});
server.listen(port,'127.0.0.1',()=>console.log(`Drive Luxury API Test UI: http://127.0.0.1:${port} (API -> localhost:${backendPort})`));
