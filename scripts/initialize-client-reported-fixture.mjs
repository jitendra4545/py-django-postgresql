// Test fixture only: simulate exactly the 3 tables, 51 columns and 11 indexes reported by the client.
import fs from 'node:fs/promises';
import {pool} from '../src/db/pool.js';
if(process.env.CLIENT_DB_TEST_DISPOSABLE!=='true')throw Error('Disposable test database flag required');
const m=JSON.parse(await fs.readFile(new URL('../db/client-schema.json',import.meta.url),'utf8'));
try{
 const [[count]]=await pool.query('SELECT COUNT(*) AS n FROM users');if(Number(count.n))throw Error('Fixture requires an empty schema import');
 for(const t of m.client_reported_baseline.tables_reported_created)await pool.query(`CREATE TABLE ${t.table}(id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,PRIMARY KEY(id)) ENGINE=InnoDB`);
 for(const[t,cs]of Object.entries(m.client_reported_baseline.columns_reported_applied_by_table))for(const c of cs)await pool.query(`ALTER TABLE ${t} ADD COLUMN ${c.name} ${c.definition}`);
 for(const x of m.client_reported_baseline.indexes_reported_applied)await pool.query(`ALTER TABLE ${x.table} ADD ${x.unique?'UNIQUE ':''}INDEX ${x.name} (${x.columns.join(',')})`);
 console.log('Initialized reported baseline: 3 tables, 51 columns, 11 indexes');
}finally{await pool.end();}
