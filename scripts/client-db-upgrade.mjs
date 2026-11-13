// Compatibility entry point: upgrades are forbidden in this adapter release.
if(process.argv.includes('--apply')){
  console.error('Schema updates are disabled. Use npm run db:client:verify. No changes were attempted.');
  process.exitCode=1;
}else await import('./verify-existing-schema.mjs');
