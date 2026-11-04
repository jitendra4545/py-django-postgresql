import { pool } from '../db/pool.js';
import { assertSharedStorageReady } from '../db/shared-schema.js';
import { preflight, retiredTables } from '../../migrations/008_shared_client_storage.js';

const mode = process.argv[2] ?? 'plan';
const connection = await pool.getConnection();
let locked = false;
try {
  if (mode === 'archive' && process.argv.includes('--execute')) {
    const [locks] = await connection.query("SELECT GET_LOCK(CONCAT('dl_migrate_',MD5(DATABASE())),10) AS acquired");
    if (Number(locks[0]?.acquired) !== 1) throw new Error('Another schema operation is running');
    locked = true;
  }
  if (mode === 'plan') {
    const report = await preflight(connection, { notificationModel: process.env.LEGACY_NOTIFICATION_NOTIFIABLE_TYPE ?? '' });
    console.log(JSON.stringify(report, null, 2));
    if (report.blockers.length) process.exitCode = 1;
  } else if (mode === 'verify') {
    console.log(JSON.stringify(await assertSharedStorageReady(connection), null, 2));
  } else if (mode === 'archive') {
    await assertSharedStorageReady(connection);
    const changes = [];
    for (const name of retiredTables) {
      const target = `archive_${name}_008`;
      const [found] = await connection.query('SELECT TABLE_NAME AS name FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN (?,?)', [name, target]);
      if (found.some((row) => row.name === target)) {
        if (found.some((row) => row.name === name)) throw new Error(`Both ${name} and ${target} exist; reconcile manually`);
        continue;
      }
      if (found.some((row) => row.name === name)) changes.push({ name, target });
    }
    console.log(JSON.stringify({ operation: 'RENAME ONLY; NO DATA IS DELETED', changes }, null, 2));
    if (!process.argv.includes('--execute')) {
      console.log('Preview only. After backup and write maintenance, add --execute --maintenance-confirmed to archive.');
    } else {
      if (!process.argv.includes('--maintenance-confirmed')) throw new Error('Archiving requires --maintenance-confirmed and an external snapshot');
      if (changes.length) await connection.query(`RENAME TABLE ${changes.map(({ name, target }) => `\`${name}\` TO \`${target}\``).join(',')}`);
      console.log('Retired tables archived without dropping records. Keep archive retention aligned with your data-retention policy.');
    }
  } else {
    throw new Error('Usage: node src/scripts/shared-storage.js plan|verify|archive');
  }
} finally {
  if (locked) await connection.query("SELECT RELEASE_LOCK(CONCAT('dl_migrate_',MD5(DATABASE())))").catch(() => {});
  connection.release();
  await pool.end();
}
