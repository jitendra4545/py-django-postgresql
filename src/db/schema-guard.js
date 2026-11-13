const guarded = new WeakSet();
export function assertNoSchemaMutation(sql) {
  const text=String(sql).replace(/\/\*[\s\S]*?\*\//g,' ').replace(/--[^\n]*/g,' ').trim();
  if(/^(CREATE|ALTER|DROP|TRUNCATE|RENAME|GRANT|REVOKE)\b/i.test(text)) {
    const error=new Error('Schema changes are disabled. This release only uses the supplied existing schema.');
    error.code='SCHEMA_MUTATION_DISABLED'; throw error;
  }
}
export function guardExecutor(executor) {
  if(guarded.has(executor))return executor;
  for(const name of ['query','execute']) {
    const original=executor[name].bind(executor);
    executor[name]=(sql,...args)=>{assertNoSchemaMutation(sql?.sql??sql);return original(sql,...args);};
  }
  guarded.add(executor);
  return executor;
}
