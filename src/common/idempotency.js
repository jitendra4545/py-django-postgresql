import { conflict } from './errors.js';
import { exec, one } from '../db/pool.js';
export async function getIdempotentResponse(req, scope) {
    const key = req.header('Idempotency-Key');
    if (!key)
        return null;
    const row = await one('SELECT response_status,response_body,locked_until FROM mobile_idempotency_keys WHERE user_id=? AND idempotency_key=? AND request_scope=?', [req.auth.userId, key, scope]);
    if (!row)
        return null;
    if (row.response_status && row.response_body) {
        const body = typeof row.response_body === 'string' ? JSON.parse(row.response_body) : row.response_body;
        return { status: row.response_status, body };
    }
    throw conflict('REQUEST_IN_PROGRESS', 'A request with this Idempotency-Key is already being processed');
}
export async function beginIdempotency(req, scope) {
    const key = req.header('Idempotency-Key');
    if (!key)
        return null;
    try {
        await exec(`INSERT INTO mobile_idempotency_keys (user_id,idempotency_key,request_scope,locked_until,created_at,updated_at)
       VALUES (?,?,?,DATE_ADD(NOW(),INTERVAL 2 MINUTE),NOW(),NOW())`, [req.auth.userId, key, scope]);
        return key;
    }
    catch (error) {
        if (error?.code === 'ER_DUP_ENTRY')
            throw conflict('REQUEST_IN_PROGRESS', 'A request with this Idempotency-Key already exists');
        throw error;
    }
}
export async function finishIdempotency(req, scope, status, body) {
    const key = req.header('Idempotency-Key');
    if (!key)
        return;
    await exec('UPDATE mobile_idempotency_keys SET response_status=?,response_body=?,locked_until=NULL,updated_at=NOW() WHERE user_id=? AND idempotency_key=? AND request_scope=?', [status, JSON.stringify(body), req.auth.userId, key, scope]);
}
export async function failIdempotency(req, scope) {
    const key = req.header('Idempotency-Key');
    if (!key)
        return;
    await exec('DELETE FROM mobile_idempotency_keys WHERE user_id=? AND idempotency_key=? AND request_scope=? AND response_status IS NULL', [req.auth.userId, key, scope]);
}
