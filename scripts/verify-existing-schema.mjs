import {pool} from '../src/db/pool.js';
import {verifyExistingSchema} from '../src/services/schema-verifier.js';
try{console.log(JSON.stringify(await verifyExistingSchema(pool)));}finally{await pool.end();}
