import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { env } from '../src/config/env.js';
import {installConcurrencyGuards,concurrencyTriggerNames} from '../db/client-concurrency.mjs';
const manifest=JSON.parse(await fs.readFile(new URL('../db/client-schema.json',import.meta.url),'utf8'));
const apply=process.argv.includes('--apply'),verify=process.argv.includes('--verify');
const q=name=>{if(!/^[A-Za-z0-9_]+$/.test(name))throw Error('Invalid SQL identifier');return '`'+name+'`';};
const c=await mysql.createConnection({host:env.DB_HOST,port:env.DB_PORT,user:env.DB_USER,password:env.DB_PASSWORD,database:env.DB_NAME,
 ssl:env.DB_SSL?{rejectUnauthorized:true,...(env.DB_SSL_CA_PATH?{ca:await fs.readFile(env.DB_SSL_CA_PATH,'utf8')}:env.DB_SSL_CA_BASE64?{ca:Buffer.from(env.DB_SSL_CA_BASE64,'base64')}: {})}:undefined,decimalNumbers:true,timezone:'Z'});
const pending=[];
async function sql(statement,params=[]){if(apply)return c.query(statement,params);pending.push(statement);}
async function kind(name){const [rows]=await c.execute('SELECT TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[name]);return rows[0]?.TABLE_TYPE;}
async function columns(name){const [rows]=await c.execute('SELECT COLUMN_NAME,COLUMN_TYPE,IS_NULLABLE,EXTRA FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=?',[name]);return new Map(rows.map(r=>[r.COLUMN_NAME,r]));}
function columnType(value){return value.toLowerCase().replace(/\b(bigint|int|tinyint|smallint)\(\d+\)/g,'$1').replace(/\s+/g,' ').trim();}
async function ensureColumn(table,col){
 const cols=await columns(table),actual=cols.get(col.name);
 if(!actual){await sql(`ALTER TABLE ${q(table)} ADD COLUMN ${q(col.name)} ${col.definition}`);return;}
 if(/AUTO_INCREMENT/i.test(col.definition)&&!actual.EXTRA.includes('auto_increment'))throw Error(`Missing AUTO_INCREMENT ${table}.${col.name}`);
 if(!/NOT NULL/i.test(col.definition)&&actual.IS_NULLABLE!=='YES')throw Error(`Expected nullable compatibility field ${table}.${col.name}`);
 const expected=col.definition.match(/^(?:ENUM\([^)]*\)|[A-Z]+(?:\([^)]*\))?)(?: UNSIGNED)?/i)?.[0];
 if(expected && columnType(actual.COLUMN_TYPE)!==columnType(expected) && !(expected==='JSON'&&actual.COLUMN_TYPE==='longtext'))
   throw Error(`Column type mismatch ${table}.${col.name}: expected ${expected}; actual ${actual.COLUMN_TYPE}. Review with DBA; no automatic type conversion.`);
}

async function ensureIndex(table,ix){const [rows]=await c.execute('SELECT COLUMN_NAME,NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? ORDER BY SEQ_IN_INDEX',[table,ix.name]);if(rows.length){if(rows.map(x=>x.COLUMN_NAME).join(',')!==ix.columns.join(',')||Boolean(rows[0].NON_UNIQUE)===ix.unique)throw Error(`Index definition mismatch ${table}.${ix.name}`);return;}await sql(`ALTER TABLE ${q(table)} ADD ${ix.unique?'UNIQUE ':''}KEY ${q(ix.name)} (${ix.columns.map(q).join(',')})`);}
async function count(name){if(!(await kind(name)))return 0;const [[r]]=await c.query(`SELECT COUNT(*) AS n FROM ${q(name)}`);return Number(r.n);}
const extras=manifest.retained_additional_tables;
const dupNames=['app_notifications','app_documents','app_messages','app_vip_requests','app_concierge_requests'];
try{
 console.log(`Target ${env.DB_HOST}:${env.DB_PORT}/${env.DB_NAME}; mode ${verify?'VERIFY':apply?'APPLY':'PLAN'}`);
 const missing=[];for(const t of manifest.target_client_tables)if(!(await kind(t)))missing.push(t);
 if(missing.length)throw Error('Import the client database first. Missing native tables: '+missing.join(', '));
 // Native client schema and reported additions are supported directly. Never
 // import unreviewed duplicate business rows into an existing client ledger.
 for(const name of dupNames)if(await kind(name)==='BASE TABLE' && await count(name)>0)
   throw Error('Populated legacy mobile store requires a reviewed data migration before upgrade: '+name+'. No source rows have been renamed or copied.');
 // Never silently overwrite an archived store during retries.
 for(const name of dupNames)if(await kind(name)==='BASE TABLE' && await kind(name+'_client_archive'))throw Error('Both live and archive mobile stores exist: '+name);
 if(verify){
  for(const entry of extras)if(await kind(entry.table)!=='BASE TABLE')missing.push(entry.table);
  const required=structuredClone(manifest.client_reported_baseline.columns_reported_applied_by_table);for(const [t,cs]of Object.entries(manifest.proposed_client_column_additions))required[t]=[...(required[t]??[]),...cs];required.app_mobile_assignment_ids=manifest.remaining_if_reported_exactly_true.expand_reported_assignment_allocator.columns;
  for(const [t,cs]of Object.entries(required)){const actual=await columns(t);for(const col of cs){if(!actual.has(col.name))missing.push(t+'.'+col.name);else await ensureColumn(t,col);}}
  for(const name of dupNames)if(await kind(name)!=='VIEW')missing.push(name+' view');
  const [[tr]]=await c.query("SELECT COUNT(*) AS n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME IN ('dl_mobile_res_insert','dl_mobile_res_update','dl_mobile_leg_insert','dl_mobile_leg_update')");
  if(Number(tr.n)!==4)missing.push('four dl_mobile metadata triggers');
  const [guardRows]=await c.execute(`SELECT TRIGGER_NAME FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME IN (${concurrencyTriggerNames.map(()=>'?').join(',')})`,concurrencyTriggerNames);
  if(guardRows.length!==concurrencyTriggerNames.length)missing.push('ten shared vehicle concurrency triggers');
  if(missing.length)throw Error('Missing schema objects: '+missing.join(', '));
  for(const [t,ixs]of Object.entries(manifest.proposed_client_indexes))for(const ix of ixs)await ensureIndex(t,ix);
  for(const ix of manifest.remaining_if_reported_exactly_true.expand_reported_assignment_allocator.indexes)await ensureIndex('app_mobile_assignment_ids',ix);
  for(const entry of extras){
   for(const m of entry.proposed_definition.matchAll(/^\s*`?(\w+)`?\s+((?:BIGINT|INT|SMALLINT|TINYINT|VARCHAR|CHAR|TEXT|JSON|ENUM|DECIMAL|DATETIME|TIMESTAMP)[^\n]*),?$/gmi))
    await ensureColumn(entry.table,{name:m[1],definition:m[2].replace(/,$/,'')});
   for(const m of entry.proposed_definition.matchAll(/^\s*(UNIQUE )?KEY\s+`?(\w+)`?\s*\(([^)]+)\)/gmi))
    await ensureIndex(entry.table,{name:m[2],unique:Boolean(m[1]),columns:m[3].replaceAll('`','').split(',').map(x=>x.trim())});
   for(const m of entry.proposed_definition.matchAll(/CONSTRAINT\s+(\w+)\s+FOREIGN KEY\s*\((\w+)\)\s*REFERENCES\s+(\w+)\s*\((\w+)\)/gi)){
    const [fks]=await c.execute('SELECT REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?',[entry.table,m[2]]);
    if(!fks.some(x=>x.REFERENCED_TABLE_NAME===m[3]&&x.REFERENCED_COLUMN_NAME===m[4]))throw Error('Missing or incompatible foreign key '+entry.table+'.'+m[2]+' -> '+m[3]+'.'+m[4]);
   }
  }
  if(pending.length)throw Error('Missing definitions: '+pending.join('; '));
  console.log('PASS: client tables, application tables, views, metadata triggers, columns and indexes');
 }else{
  const allColumns={...manifest.client_reported_baseline.columns_reported_applied_by_table};
  for(const [t,cs]of Object.entries(manifest.proposed_client_column_additions))allColumns[t]=[...(allColumns[t]??[]),...cs.filter(x=>!(allColumns[t]??[]).some(y=>y.name===x.name))];
  // Notification UUID primary keys stay intact; allocate collision-free numeric IDs on a separate unique key.
  for(const [t,cs]of Object.entries(allColumns))for(const col of cs){
   if(t==='notifications'&&col.name==='mobile_notification_id'){
    if(!(await columns(t)).has(col.name))await sql('ALTER TABLE notifications ADD COLUMN mobile_notification_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT, ADD UNIQUE KEY uq_notifications_mobile_id(mobile_notification_id)');else await ensureColumn(t,col);
   }else await ensureColumn(t,col);
  }
  for(const[t,ixs]of Object.entries(manifest.proposed_client_indexes))for(const ix of ixs)await ensureIndex(t,ix);
  const allocator=extras.find(x=>x.table==='app_mobile_assignment_ids');
  await sql(allocator.proposed_definition);
  if(await kind('app_mobile_assignment_ids'))for(const col of manifest.remaining_if_reported_exactly_true.expand_reported_assignment_allocator.columns)await ensureColumn('app_mobile_assignment_ids',col);
  if(apply||await kind('app_mobile_assignment_ids'))for(const ix of manifest.remaining_if_reported_exactly_true.expand_reported_assignment_allocator.indexes)await ensureIndex('app_mobile_assignment_ids',ix);
  for(const entry of extras)if(entry!==allocator){
   await sql(entry.proposed_definition);
   if(await kind(entry.table)){
    for(const m of entry.proposed_definition.matchAll(/^\s*`?(\w+)`?\s+((?:BIGINT|INT|SMALLINT|TINYINT|VARCHAR|CHAR|TEXT|JSON|ENUM|DECIMAL|DATETIME|TIMESTAMP)[^\n]*),?$/gmi)){
      const definition=m[2].replace(/,$/,'');await ensureColumn(entry.table,{name:m[1],definition});
    }
   }
  }
  for(const entry of extras){
   for(const m of entry.proposed_definition.matchAll(/^\s*(UNIQUE )?KEY\s+`?(\w+)`?\s*\(([^)]+)\)/gmi)){
    if(m[2]==='id')continue;
    if(apply||await kind(entry.table))await ensureIndex(entry.table,{name:m[2],unique:Boolean(m[1]),columns:m[3].replaceAll('`','').split(',').map(x=>x.trim())});
   }
  }
  if(apply){
   // Empty old mobile tables can be archived without discarding source data.
   for(const name of dupNames)if(await kind(name)==='BASE TABLE'){
    await c.query(`RENAME TABLE ${q(name)} TO ${q(name+'_client_archive')}`);
    console.log('Archived empty legacy store',name);
   }
   const {reconcileNativeRows}=await import('../src/services/client-assignment-sync.js');
   await c.beginTransaction();try{await reconcileNativeRows(c,{notify:false,all:true});await c.commit();}catch(e){await c.rollback();throw e;}
   await c.query(`INSERT INTO app_driver_expenses
    (id,assignment_id,reservation_id,driver_id,category,amount,currency,description,document_id,status,review_note,incurred_at,reviewed_by_user_id,reviewed_at,created_at,updated_at)
    SELECT x.mobile_expense_id,x.mobile_assignment_id,x.reservation_id,x.mobile_driver_id,x.mobile_category,x.mobile_expense_amount,x.mobile_currency,x.mobile_description,x.mobile_document_id,
      COALESCE(x.mobile_expense_status,'SUBMITTED'),x.mobile_review_note,x.mobile_incurred_at,x.mobile_reviewed_by_user_id,x.mobile_reviewed_at,x.created_at,x.updated_at
    FROM reservation_other_costs x LEFT JOIN app_driver_expenses e ON e.id=x.mobile_expense_id
    WHERE x.type='MOBILE_DRIVER_EXPENSE' AND x.mobile_expense_id IS NOT NULL AND e.id IS NULL`);
   // Retarget only the assignment/document/notification FKs owned by these application tables.
   for(const entry of extras){
    const desired=[...entry.proposed_definition.matchAll(/CONSTRAINT\s+(\w+)\s+FOREIGN KEY\s*\((\w+)\)\s*REFERENCES\s+(\w+)\s*\((\w+)\)(\s+ON DELETE (?:CASCADE|SET NULL))?/gi)];
    for(const m of desired){
     const [,name,col,table,ref,onDelete='']=m;
     const [fks]=await c.execute(`SELECT CONSTRAINT_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? AND REFERENCED_TABLE_NAME IS NOT NULL`,[entry.table,col]);
     if(fks.some(x=>x.REFERENCED_TABLE_NAME===table&&x.REFERENCED_COLUMN_NAME===ref))continue;
     const [[orphan]]=await c.query(`SELECT COUNT(*) AS n FROM ${q(entry.table)} s LEFT JOIN ${q(table)} t ON t.${q(ref)}=s.${q(col)} WHERE s.${q(col)} IS NOT NULL AND t.${q(ref)} IS NULL`);
     if(Number(orphan.n))throw Error(`Cannot retarget ${entry.table}.${col}: ${orphan.n} orphan references`);
     for(const fk of fks)await c.query(`ALTER TABLE ${q(entry.table)} DROP FOREIGN KEY ${q(fk.CONSTRAINT_NAME)}`);
     await c.query(`ALTER TABLE ${q(entry.table)} ADD CONSTRAINT ${q(name)} FOREIGN KEY(${q(col)}) REFERENCES ${q(table)}(${q(ref)}) ${onDelete}`);
    }
   }
   const views=(await fs.readFile(new URL('../db/client-views.sql',import.meta.url),'utf8')).split(';').map(x=>x.trim()).filter(Boolean);
   for(const view of views)await c.query(view.replace("'App\\\\Models\\\\User'",c.escape(env.LEGACY_USER_MODEL)));
   await c.execute(`UPDATE notifications SET notifiable_type=? WHERE mobile_notification_id IS NOT NULL AND notifiable_type=?`,[env.LEGACY_USER_MODEL,'App\\Models\\User']);
   const {installMetadata}=await import('../db/client-metadata.mjs');await installMetadata(c,env.LEGACY_PAID_PAYMENT_STATUS);
   await installConcurrencyGuards(c);
   const {syncNativeStatusEvents}=await import('../src/services/client-status-sync.js');
   await c.beginTransaction();try{await syncNativeStatusEvents(c);await c.commit();}catch(e){await c.rollback();throw e;}
   console.log('Upgrade complete. Run npm run db:client:verify before starting.');
  }else{
   pending.push('CREATE OR REPLACE five compatibility views over native stores','INSTALL four metadata triggers and backfill native metadata','INSTALL ten shared vehicle concurrency triggers and rebuild derived booking locks','RECONCILE pickup/drop-off public assignment IDs');
   console.log(pending.join(';\n'));console.log(`\nPLAN ONLY: ${pending.length} operations; run npm run db:client:upgrade to apply to this configured database.`);
  }
 }
}catch(error){console.error('Client DB upgrade failed:',error.message);process.exitCode=1;}finally{await c.end();}
