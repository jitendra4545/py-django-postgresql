import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  additiveColumns, extraRequiredTables, requiredIndexes,
  requiredIncidentForeignKeys, idAllocatorTables,
} from './lib/consolidation-schema-spec.mjs';
import { compareConsolidationMetadata } from './lib/consolidation-schema-check.mjs';

const buildValidFixture = () => {
  const columns = new Map();
  for (const [table, names] of Object.entries(extraRequiredTables)) {
    for (const name of names) columns.set(`${table}.${name}`, {
      TABLE_NAME:table,COLUMN_NAME:name,COLUMN_TYPE: 'int unsigned',IS_NULLABLE:'YES',EXTRA:'',
    });
  }
  for (const [table, definitions] of Object.entries(additiveColumns)) {
    for (const [column, def] of Object.entries(definitions)) {
      columns.set(`${table}.${column}`,{
        TABLE_NAME:table,COLUMN_NAME:column,COLUMN_TYPE:def.toLowerCase(), IS_NULLABLE:'YES',EXTRA:'',
      });
    }
  }
  for (const table of idAllocatorTables) columns.set(`${table}.id`,{
    TABLE_NAME:table,COLUMN_NAME:'id',COLUMN_TYPE:'bigint unsigned', IS_NULLABLE:'NO',EXTRA:'auto_increment',
  });
  const indexes = Object.entries(requiredIndexes).flatMap(([table, defs]) =>
    Object.entries(defs).flatMap(([name, info]) => info.columns.map((column,index)=>({
      TABLE_NAME:table,INDEX_NAME:name,COLUMN_NAME:column,SEQ_IN_INDEX:index+1,NON_UNIQUE:info.unique?0:1,
    }))));
  const foreignKeys = Object.entries(requiredIncidentForeignKeys).map(([column,[target,col]])=>({
    TABLE_NAME:'reservation_service_incidents',COLUMN_NAME:column,REFERENCED_TABLE_NAME:target,REFERENCED_COLUMN_NAME:col,
  }));
  return {tables:[...new Set([...columns.values()].map((c)=>c.TABLE_NAME))].map(name=>({TABLE_NAME:name,TABLE_TYPE:'BASE TABLE'})),columns:[...columns.values()],indexes,foreignKeys};
};
const sql = await readFile(new URL('./sql/REPAIR_008_010_STAGING.sql',import.meta.url),'utf8');
const verifySql = await readFile(new URL('./sql/VERIFY_008_010_READONLY.sql',import.meta.url),'utf8');
const originalMigration = await readFile(new URL('../migrations/010_consolidate_status_expenses_and_service_incidents.sql',import.meta.url),'utf8');

test('valid schema has no missing columns, tables, indices or foreign keys',()=>{
  const output=compareConsolidationMetadata(buildValidFixture());
  assert.equal(output.ok,true,output.errors.join('\n'));
});
test('reports all three recurring failures in ONE pass',()=>{
  const f=buildValidFixture();
  f.columns=f.columns.filter(c=> !(c.TABLE_NAME==='activity_logs' && c.COLUMN_NAME==='mobile_event_id') &&
                                  !(c.TABLE_NAME==='reservation_details' && c.COLUMN_NAME==='mobile_leg_status') &&
                                  c.TABLE_NAME!=='app_mobile_status_event_ids');
  f.tables=f.tables.filter(t=>t.TABLE_NAME!=='app_mobile_status_event_ids');
  const result=compareConsolidationMetadata(f);
  assert.equal(result.ok,false);
  for(const word of ['missing column activity_logs.mobile_event_id',
                     'missing column reservation_details.mobile_leg_status',
                     'missing table app_mobile_status_event_ids'])
    assert.ok(result.errors.some(e=>e.includes(word)),word);
});
test('rejects incomplete index uniqueness and invalid allocator auto-increment',()=>{
  const f=buildValidFixture();
  f.indexes.find(i=>i.INDEX_NAME==='uq_activity_mobile_event').NON_UNIQUE=1;
  f.columns.find(c=>c.TABLE_NAME==='app_mobile_status_event_ids'&&c.COLUMN_NAME==='id').EXTRA='';
  const r=compareConsolidationMetadata(f);
  assert.ok(r.errors.some(e=>e.includes('incompatible index activity_logs.uq_activity_mobile_event')));
  assert.ok(r.errors.some(e=>e.includes('incompatible allocator app_mobile_status_event_ids.id')));
});
test('rejects website-incompatible nonnullable mobile additions and missing incident FK',()=>{
  const f=buildValidFixture();
  f.columns.find(c=>c.TABLE_NAME==='activity_logs'&&c.COLUMN_NAME==='mobile_note').IS_NULLABLE='NO';
  f.foreignKeys=f.foreignKeys.filter(f=>f.COLUMN_NAME!=='vehicle_damage_id');
  const r=compareConsolidationMetadata(f);
  assert.ok(r.errors.some(e=>e.includes('mobile_note: must be NULLABLE')));
  assert.ok(r.errors.some(e=>e.includes('missing foreign key reservation_service_incidents.vehicle_damage_id')));
});
test('staging repair includes every additive column and index in schema manifest',()=>{
  for(const [table,defs] of Object.entries(additiveColumns)){
    assert.ok(sql.includes(`ALTER TABLE \`${table}\``),table);
    for(const col of Object.keys(defs))assert.ok(sql.includes(`'${col}'`),`${table}.${col}`);
  }
  for(const defs of Object.values(requiredIndexes)){
    for(const name of Object.keys(defs))assert.ok(sql.includes(name),name);
  }
  for(const table of idAllocatorTables)assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS `'+table+'`'));
});
test('repair guards source backfill and does not drop/rename original website fields',()=>{
  assert.match(sql,/STOP_MISSING_BASE_TABLES_APPLY_FOUNDATION_FIRST/);
  assert.match(sql,/STOP_HISTORICAL_ASSIGNMENTS_APPLY_MIGRATION_009_FIRST/);
  assert.match(sql,/INSERT IGNORE INTO `app_mobile_status_event_ids`/);
  assert.match(sql,/WHERE existing\.id IS NULL/);
  assert.doesNotMatch(sql,/^\s*(?:DROP|TRUNCATE)\s+TABLE\b|\bDROP\s+COLUMN\b|\bRENAME\s+COLUMN\b/igm);
  assert.doesNotMatch(sql,/INSERT\s+INTO\s+app_schema_migrations/i);
});
test('Workbench verification includes all columns and no write SQL',()=>{
  for(const defs of Object.values(additiveColumns))for(const column of Object.keys(defs))assert.ok(verifySql.includes(`'${column}'`));
  assert.doesNotMatch(verifySql,/^\s*(?:ALTER|INSERT|UPDATE|DELETE|CREATE|DROP)\s+(?:TABLE|FROM|INTO)?/gim);
});
test('previous numbered migration 010 remains unchanged and still contains backfill SQL',()=>{
  for(const word of ['INSERT INTO activity_logs','INSERT INTO reservation_driver_statuses',
    'INSERT INTO reservation_other_costs','INSERT INTO reservation_service_incidents'])
    assert.ok(originalMigration.includes(word));
});
test('checkout, catalog and API route response contracts are not changed by this repair',async()=>{
  const catalog=await readFile(new URL('../src/modules/catalog.js',import.meta.url),'utf8');
  const bookings=await readFile(new URL('../src/modules/bookings.js',import.meta.url),'utf8');
  assert.match(catalog,/FROM services/);
  assert.match(catalog,/response\.json\(\{\s*items:/);
  assert.match(bookings,/response\.status\(201\)\.json\(payload\)/);
});

test('generated repair uses balanced SQL string literals and prepared statements',()=>{
  let quoted=false;
  let n=0;
  for(let i=0;i<sql.length;i++){
    const c=sql[i];
    if(c==="'"){
      if(quoted&&sql[i+1]==="'"){i++;continue;}
      quoted=!quoted;
    }
    if(c===';'&&!quoted)n++;
  }
  assert.equal(quoted,false,'unclosed SQL string literal');
  assert.ok(n>50,`Expected dozens of SQL statements, got ${n}`);
  const preparations=(sql.match(/^PREPARE [\w]+ FROM /gm)||[]).length;
  const releases=(sql.match(/^DEALLOCATE PREPARE [\w]+;/gm)||[]).length;
  assert.ok(preparations>15);
  assert.equal(preparations,releases,'prepared statements must be deallocated');
});

test('optional all-api mode separately flags a missing integration table',()=>{
  const result=compareConsolidationMetadata(buildValidFixture(),{allApi:true});
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(e=>e.includes('app_telnyx_call_routes')));
  assert.ok(result.errors.some(e=>e.includes('app_push_delivery_jobs')));
});
