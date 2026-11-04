import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {retiredTables} from '../migrations/008_shared_client_storage.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=f=>readFileSync(path.join(root,f),'utf8');
const baseline=JSON.parse(read('tests/fixtures/api-contract-baseline.json'));
const walk=d=>readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(d+'/'+x.name):[d+'/'+x.name]);

test('all original HTTP method/path pairs and their module locations are unchanged',()=>{
 let total=0;
 for(const [f,expected] of Object.entries(baseline.routes)){
  const actual=[...read(f).matchAll(/router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g)].map(m=>[m[1],m[2]]);
  assert.deepEqual(actual,expected,f);total+=actual.length;
 }
 assert.equal(total,96);
});
test('all existing response-call expressions remain present verbatim except whitespace',()=>{
 for(const [f,expressions] of Object.entries(baseline.responseExpressions)){
  const source=read(f).replace(/\s+/g,'');
  for(const expr of expressions)assert.ok(source.includes(expr),`${f}: response expression changed: ${expr}`);
 }
});
test('existing request validation expressions are unchanged',()=>{
 for(const [f,expressions] of Object.entries(baseline.requestValidators)){
  const source=read(f).replace(/\s+/g,'');
  for(const expr of expressions)assert.ok(source.includes(expr),`${f}: request schema changed`);
 }
});
test('OpenAPI, app mounting, auth, errors, pagination, enums and historical migrations retain original hashes',()=>{
 for(const [f,expected] of Object.entries(baseline.immutableFiles))
  assert.equal(createHash('sha256').update(readFileSync(path.join(root,f))).digest('hex'),expected,f);
});
test('runtime business queries no longer read or write the eight retired tables',()=>{
 for(const f of walk('src').filter(f=>f.endsWith('.js')&&!f.startsWith('src/scripts/')&&!f.startsWith('src/db/shared-schema'))){
  const source=read(f).replace(/\/\*[\s\S]*?\*\//g,'').replace(/^\s*\/\/.*$/gm,'');
  for(const table of retiredTables)
   assert.ok(!new RegExp('\\b(?:FROM|JOIN|INTO|UPDATE|DELETE\\s+FROM)\\s+`?'+table+'\\b','i').test(source),`${f} still uses ${table}`);
 }
});
test('all compatibility projections are read-only in application code',()=>{
 for(const f of walk('src').filter(f=>f.endsWith('.js')))
  assert.doesNotMatch(read(f),/\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+dl_mobile_/i,f);
});
test('migration does not drop or rename client tables, original fields or original indexes',()=>{
 const source=read('migrations/008_shared_client_storage.js');
 assert.doesNotMatch(source,/DROP\s+(TABLE|COLUMN|INDEX)|RENAME\s+TABLE|TRUNCATE\s+TABLE/i);
 assert.match(source,/DROP FOREIGN KEY/); // Only app_* child references are rebound.
 assert.match(source,/constraint\.tableName\.startsWith\('app_'\)/);
});
test('audit retention never deletes website route logs',()=>{
 for(const f of ['src/services/api-audit-log.js','src/scripts/prune-api-audit.js'])
  assert.match(read(f),/DELETE FROM route_access_logs\s+WHERE mobile_source='MOBILE_API'/);
});
test('server fails closed before starting workers/listener when shared migration is missing',()=>{
 const source=read('src/server.js');const guard=source.indexOf('await assertSharedStorageReady(pool)');
 assert.ok(guard>=0);assert.ok(guard<source.indexOf('server.listen('));
});
test('website-created bookings cannot be automatically repriced using invented mobile snapshots',()=>{
 assert.match(read('src/services/booking-change-service.js'),/if \(!draft\)[\s\S]*?LEGACY_BOOKING_REVIEW_REQUIRED/);
});

test('SELECT-star compatibility views retain the historical public column sets and order',async()=>{
 const {viewDefinitions}=await import('../migrations/008_shared_client_storage.js');
 const foundation=read('migrations/001_release_1_mobile_foundation.sql');
 const views=viewDefinitions('App\\Models\\User');
 function fields(sql){
  const source=sql.slice(7);let quote=null,level=0,buf='',parts=[];
  for(let i=0;i<source.length;i++){
   const c=source[i];
   if(quote){buf+=c;if(c===quote&&source[i-1]!=='\\')quote=null;continue;}
   if(c==="'"||c==='"'){quote=c;buf+=c;continue;}
   if(c==='(')level++;if(c===')')level--;
   if(level===0&&/^\s+FROM\s/.test(source.slice(i))){parts.push(buf.trim());break;}
   if(c===','&&level===0){parts.push(buf.trim());buf='';}else buf+=c;
  }
  return parts.map(s=>s.match(/\bAS\s+(\w+)$/i)?.[1]||s.match(/\.(\w+)$/)?.[1]||s);
 }
 for(const original of ['app_reservation_meta','app_reservation_leg_meta','app_driver_assignments','app_notifications','app_vip_requests','app_concierge_requests']){
  const ddl=foundation.match(new RegExp('CREATE TABLE IF NOT EXISTS '+original+' \\(([\\s\\S]*?)\\) ENGINE'))[1];
  const expected=[...ddl.matchAll(/^\s+([a-z_]+)\s+(?:BIGINT|INT|SMALLINT|TINYINT|CHAR|VARCHAR|ENUM|TEXT|JSON|TIMESTAMP|DATETIME)\b/gm)].map(m=>m[1]);
  const projection=views[original.replace('app_','dl_mobile_')];
  assert.deepEqual(fields(projection),expected,original);
 }
});

test('current GPS is bound to the canonical assignment driver, not merely the historical assignment id',()=>{
 assert.match(read('src/services/tracking.js'),/current_assignment\.driver_id=location\.driver_id/);
 assert.match(read('src/modules/chauffeur.js'),/WHERE assignment_id=\? AND driver_id=\?/);
});
