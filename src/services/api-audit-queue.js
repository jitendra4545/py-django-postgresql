import { setImmediate, setTimeout } from 'node:timers';

// Small bounded in-memory buffer. Database latency never holds up the HTTP response.
// The queue is best-effort: a sustained database outage can drop audit entries.
export const createAuditQueue = ({ writeBatch, maxQueue = 2000, batchSize = 50, onError = () => {} }) => {
  const queue = [];
  let inFlight = null;
  let dropped = 0;
  const maxAttempts = 3;

  const flush = () => {
    if (inFlight) return inFlight;
    if (queue.length === 0) return Promise.resolve();
    const batch = queue.splice(0, batchSize);
    inFlight = Promise.resolve()
      .then(() => writeBatch(batch.map(({ _auditAttempts, ...entry }) => entry)))
      .catch((error) => {
        const retry = [];
        for (const item of batch) {
          const attempts = (item._auditAttempts ?? 0) + 1;
          if (attempts < maxAttempts) retry.push({ ...item, _auditAttempts: attempts });
          else dropped += 1;
        }
        const slots = Math.max(0, maxQueue - queue.length);
        dropped += Math.max(0, retry.length - slots);
        queue.unshift(...retry.slice(0, slots));
        onError(error, dropped);
      })
      .finally(() => {
        inFlight = null;
        if (queue.length >= batchSize) setImmediate(() => void flush());
      });
    return inFlight;
  };

  const enqueue = (entry) => {
    if (queue.length >= maxQueue) {
      dropped += 1;
      onError({ code: 'AUDIT_QUEUE_FULL' }, dropped);
      return false;
    }
    queue.push(entry);
    if (queue.length >= batchSize && !inFlight) void flush();
    return true;
  };

  const drain = async (maxMs = 2000) => {
    const deadline = Date.now() + maxMs;
    while ((queue.length || inFlight) && Date.now() < deadline) {
      const result = flush();
      const remaining = Math.max(0, deadline - Date.now());
      await Promise.race([
        result,
        new Promise((resolve) => setTimeout(resolve, remaining)),
      ]);
      if (Date.now() >= deadline) break;
    }
    return { queued: queue.length, dropped };
  };

  return { enqueue, flush, drain, stats: () => ({ queued: queue.length, dropped }) };
};
