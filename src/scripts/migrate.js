import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../db/pool.js';
import { logger } from '../common/logger.js';
async function run() {
    const dir = path.resolve(process.cwd(), 'migrations');
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    for (const file of files) {
        const sql = await fs.readFile(path.join(dir, file), 'utf8');
        logger.info({ file }, 'Applying migration');
        for (const statement of sql.split(/;\s*(?:\r?\n|$)/).map((s) => s.trim()).filter(Boolean)) {
            await db.query(statement);
        }
    }
    logger.info('Migrations complete');
    await db.end();
}
run().catch(async (error) => {
    logger.fatal({ error }, 'Migration failed');
    await db.end();
    process.exit(1);
});
