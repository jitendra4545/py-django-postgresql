import { Router } from 'express';
import { env } from '../config/env.js';
import { asyncHandler } from '../common/async-handler.js';
import { AppError } from '../common/errors.js';
import { handleTelnyxEvent, verifyTelnyxWebhook } from '../services/telnyx-masked-calling.js';
import { query } from '../db/pool.js';

// Public endpoint, authenticated exclusively by Telnyx's Ed25519 signature.
const router = Router();
router.post(
  '/webhook',
  asyncHandler(async (request, response) => {
    if (env.MASKED_CALL_PROVIDER !== 'telnyx')
      throw new AppError(503, 'TELNYX_DISABLED', 'Telnyx is disabled');
    if (
      !verifyTelnyxWebhook(
        request.rawBody,
        request.get('telnyx-signature-ed25519'),
        request.get('telnyx-timestamp'),
      )
    ) {
      throw new AppError(401, 'INVALID_TELNYX_SIGNATURE', 'Invalid Telnyx webhook signature');
    }
    const id = request.body?.data?.id;
    if (typeof id !== 'string' || id.length > 191)
      throw new AppError(400, 'INVALID_TELNYX_EVENT', 'Missing event id');
    // Ignore duplicates even when Telnyx retries a webhook delivery.
    const inserted = await query(
      'INSERT IGNORE INTO app_telnyx_webhook_events (event_id,received_at) VALUES (?,NOW())',
      [id],
    );
    if (inserted.affectedRows) {
      try {
        await handleTelnyxEvent(request.body);
      } catch (error) {
        console.error('Telnyx event processing failed', { code: error.code ?? 'UNKNOWN' });
        // Remove marker to allow provider retries after a temporary database/API outage.
        await query('DELETE FROM app_telnyx_webhook_events WHERE event_id=?', [id]);
        throw error;
      }
    }
    response.status(200).json({ received: true });
  }),
);
export default router;
