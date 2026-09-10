import { createServer } from 'node:http';
import { app } from './app.js';
import { env } from './config/env.js';
import { db } from './db/pool.js';
import { logger } from './common/logger.js';
import { initSocket } from './realtime/socket.js';
import { redis } from './db/redis.js';
const server = createServer(app);
initSocket(server);
async function start() {
    await db.query('SELECT 1');
    server.listen(env.PORT, () => logger.info({ port: env.PORT, docs: `${env.APP_URL}/docs` }, 'Drive Luxury API started'));
}
async function shutdown(signal) {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
        await db.end();
        try {
            await redis.quit();
        }
        catch { }
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
start().catch((error) => {
    logger.fatal({ error }, 'Startup failed');
    process.exit(1);
});
