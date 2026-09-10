import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { env } from '../config/env.js';
import { logger } from '../common/logger.js';
let enabled = false;
if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
        const account = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
        if (!getApps().length)
            initializeApp({ credential: cert(account) });
        enabled = true;
    }
    catch (error) {
        logger.warn({ error }, 'FCM disabled because service account JSON is invalid');
    }
}
export async function sendPush(tokens, title, body, data = {}) {
    if (!enabled || tokens.length === 0)
        return;
    await getMessaging().sendEachForMulticast({ tokens, notification: { title, body }, data });
}
