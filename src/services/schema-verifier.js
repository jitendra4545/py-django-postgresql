import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
// Only SELECTs against information_schema. No migration, view, trigger, index,
// column, constraint, backfill or data repair is performed by verification.
export async function verifyExistingSchema(connection) {
  const contract=JSON.parse(await readFile(new URL('../../db/existing-schema-contract.json',import.meta.url),'utf8'));
  const [rows]=await connection.execute(`SELECT TABLE_NAME,COLUMN_NAME FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE()`);
  const available=new Map();
  for(const r of rows){if(!available.has(r.TABLE_NAME))available.set(r.TABLE_NAME,new Set());available.get(r.TABLE_NAME).add(r.COLUMN_NAME);}
  const missing=[];
  for(const [table,columns] of Object.entries(contract)) {
    if(!available.has(table)){missing.push(table+' (missing existing table)');continue;}
    for(const column of columns)if(!available.get(table).has(column))missing.push(table+'.'+column);
  }
  if(missing.length)throw new Error('Database differs from the supplied dump: '+missing.join(', ')+'. No changes were attempted.');
  return {verifiedTables:Object.keys(contract).length,schemaChanges:0};
}
