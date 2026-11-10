import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const snapshot=JSON.parse(await fs.readFile(new URL('../db/client-api-contract.json',import.meta.url),'utf8'));
const routes=source=>[...source.replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'').matchAll(/(?:router|app)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)].map(m=>[m[1].toUpperCase(),m[2]]);
for(const [file,expected]of Object.entries(snapshot.routes)){
 const actual=routes(await fs.readFile(new URL('../'+file,import.meta.url),'utf8'));
 if(JSON.stringify(expected)!==JSON.stringify(actual))throw Error('Existing API routes changed: '+file);
}
const hash=crypto.createHash('sha256').update(await fs.readFile(new URL('../docs/openapi.json',import.meta.url))).digest('hex');
if(hash!==snapshot.openapi_sha256)throw Error('Existing OpenAPI contract was changed');
console.log('Client contract gate passed: original route declarations and OpenAPI schema retained');
