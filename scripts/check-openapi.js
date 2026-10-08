import fs from 'node:fs';

const modules = {
  'src/modules/auth.js': '/auth',
  'src/modules/catalog.js': '/catalog',
  'src/modules/bookings.js': '/bookings',
  'src/modules/client.js': '/client',
  'src/modules/agency-agent.js': '/agent',
  'src/modules/chauffeur.js': '/chauffeur',
  'src/modules/communication.js': '/communication',
  'src/modules/payments.js': '/payments',
  'src/modules/operations.js': '/operations',
  'src/modules/notifications.js': '/notifications',
  'src/modules/documents.js': '/documents',
};

const implemented = new Set();
for (const [filename, prefix] of Object.entries(modules)) {
  const source = fs.readFileSync(filename, 'utf8');
  const pattern = /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(pattern)) {
    const path = `${prefix}${match[2] === '/' ? '' : match[2]}`.replace(
      /:([A-Za-z0-9_]+)/g,
      '{$1}',
    );
    implemented.add(`${match[1].toUpperCase()} ${path}`);
  }
}

const spec = JSON.parse(fs.readFileSync('docs/openapi.json', 'utf8'));
const documented = new Set();
for (const [path, pathItem] of Object.entries(spec.paths)) {
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
    if (pathItem[method]) documented.add(`${method.toUpperCase()} ${path}`);
  }
}

const missing = [...implemented].filter((item) => !documented.has(item));
const extra = [...documented].filter((item) => !implemented.has(item));
if (missing.length || extra.length) {
  if (missing.length) console.error(`Missing from OpenAPI:\n${missing.join('\n')}`);
  if (extra.length) console.error(`Not implemented:\n${extra.join('\n')}`);
  process.exit(1);
}
console.log(`OpenAPI coverage OK: ${implemented.size} operations`);
