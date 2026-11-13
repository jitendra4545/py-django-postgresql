import {describe,it,expect} from 'vitest';
import {assertNoSchemaMutation,guardExecutor} from '../src/db/schema-guard.js';

describe('fixed existing schema',()=>{
 it.each(['CREATE TABLE app_new(id INT)','ALTER TABLE reservations ADD x INT','DROP VIEW app_messages','TRUNCATE reservations','RENAME TABLE a TO b','/* comment */ CREATE TRIGGER x'])('rejects %s',sql=>{
  expect(()=>assertNoSchemaMutation(sql)).toThrowError(expect.objectContaining({code:'SCHEMA_MUTATION_DISABLED'}));
 });
 it('allows ordinary native data reads/writes and guards a reused connection once',async()=>{
  const calls=[];const executor={execute:async sql=>{calls.push(sql);return [1];},query:async()=>[]};
  const guarded=guardExecutor(executor),method=guarded.execute;expect(guardExecutor(executor).execute).toBe(method);
  await guarded.execute('SELECT * FROM reservations');await guarded.execute('UPDATE reservations SET status=1 WHERE id=3');
  expect(calls).toHaveLength(2);expect(()=>guarded.query('ALTER TABLE reservations ADD x INT')).toThrow();
 });
});
