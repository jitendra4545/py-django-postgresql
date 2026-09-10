import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRoles } from '../common/auth.js';
import { LegacyRole } from '../common/legacy.js';
import { asyncHandler, ok, validate } from '../common/http.js';
import { badRequest, conflict, forbidden, notFound } from '../common/errors.js';
import { exec, one, rows, transaction } from '../db/pool.js';
import { upload } from '../common/upload.js';
import { storeBuffer } from '../integrations/storage.js';
import { notifyUser } from './notifications.js';
async function agentId(req) {
    if (req.auth?.agentId)
        return req.auth.agentId;
    const row = await one('SELECT id FROM agents WHERE user_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 1', [req.auth.userId]);
    if (!row)
        throw forbidden('Rental agent profile is required');
    return row.id;
}
async function assignmentFor(reservationId, agent) {
    const row = await one(`SELECT a.id,a.reservation_id,a.reservation_details_id,a.vehicle_id,a.agent_id,a.status,r.customer_id
       FROM rental_agent_assignments a JOIN reservations r ON r.id=a.reservation_id AND r.deleted_at IS NULL
      WHERE a.reservation_id=? AND a.agent_id=? AND a.status<>'CANCELLED' LIMIT 1`, [reservationId, agent]);
    if (!row)
        throw forbidden('This rental contract is not assigned to the authenticated agent');
    return row;
}
async function customerUserId(customerId) {
    const row = await one('SELECT user_id FROM customers WHERE id=? AND deleted_at IS NULL', [customerId]);
    return row?.user_id ?? null;
}
async function sessionFor(sessionId, agent) {
    const row = await one('SELECT * FROM inspection_sessions WHERE id=? AND agent_id=?', [sessionId, agent]);
    if (!row)
        throw notFound('Inspection session');
    return row;
}
async function upsertLegacyInspection(session) {
    const current = await one('SELECT id FROM agreement_vehicle_inspections WHERE reservation_id=? AND reservation_details_id=? AND vehicle_id=? LIMIT 1', [session.reservation_id, session.reservation_details_id, session.vehicle_id]);
    if (!current) {
        await exec('INSERT INTO agreement_vehicle_inspections (reservation_id,reservation_details_id,vehicle_id,status,created_at,updated_at) VALUES (?,?,?,1,NOW(),NOW())', [session.reservation_id, session.reservation_details_id, session.vehicle_id]);
    }
    if (session.phase === 'PICKUP') {
        await exec('UPDATE agreement_vehicle_inspections SET pick_up_km=?,tank_reading_pickup=?,updated_at=NOW() WHERE reservation_id=? AND reservation_details_id=? AND vehicle_id=?', [session.mileage, session.fuel_level, session.reservation_id, session.reservation_details_id, session.vehicle_id]);
    }
    else {
        await exec('UPDATE agreement_vehicle_inspections SET drop_off_km=?,tank_reading_drop_off=?,updated_at=NOW() WHERE reservation_id=? AND reservation_details_id=? AND vehicle_id=?', [session.mileage, session.fuel_level, session.reservation_id, session.reservation_details_id, session.vehicle_id]);
    }
}
async function syncChecklist(session) {
    const items = await rows('SELECT item_code,value FROM inspection_checklist_items WHERE inspection_session_id=?', [session.id]);
    const map = new Map(items.map((x) => [x.item_code, x.value]));
    const truthy = (code) => ['true', '1', 'yes', 'ok', 'pass'].includes(String(map.get(code) ?? '').toLowerCase()) ? 1 : 0;
    const current = await one('SELECT id FROM agreement_vehicle_inspections WHERE reservation_id=? AND reservation_details_id=? AND vehicle_id=? LIMIT 1', [session.reservation_id, session.reservation_details_id, session.vehicle_id]);
    if (!current)
        await upsertLegacyInspection(session);
    if (session.phase === 'PICKUP') {
        await exec(`UPDATE agreement_vehicle_inspections SET clean_inside_pick_up=?,clean_outside_pick_up=?,car_papers_pick_up=?,add_navigation_pick_up=?,updated_at=NOW()
                WHERE reservation_id=? AND reservation_details_id=? AND vehicle_id=?`, [truthy('CLEAN_INSIDE'), truthy('CLEAN_OUTSIDE'), truthy('DOCUMENTS'), truthy('GPS_CHECK'), session.reservation_id, session.reservation_details_id, session.vehicle_id]);
    }
    else {
        await exec(`UPDATE agreement_vehicle_inspections SET clean_inside_drop_off=?,clean_outside_drop_off=?,car_papers_drop_off=?,add_navigation_drop_off=?,updated_at=NOW()
                WHERE reservation_id=? AND reservation_details_id=? AND vehicle_id=?`, [truthy('CLEAN_INSIDE'), truthy('CLEAN_OUTSIDE'), truthy('DOCUMENTS'), truthy('GPS_CHECK'), session.reservation_id, session.reservation_details_id, session.vehicle_id]);
    }
}
async function validateInspection(session) {
    if (session.mileage == null)
        throw conflict('INSPECTION_MILEAGE_REQUIRED', 'Mileage is required before inspection completion');
    if (session.fuel_level == null)
        throw conflict('INSPECTION_FUEL_REQUIRED', 'Fuel level is required before inspection completion');
    const media = await rows('SELECT media_type FROM inspection_media WHERE inspection_session_id=?', [session.id]);
    const present = new Set(media.map((m) => m.media_type));
    const requiredMedia = ['FRONT', 'REAR', 'LEFT', 'RIGHT'];
    const missing = requiredMedia.filter((m) => !present.has(m));
    if (missing.length)
        throw conflict('INSPECTION_MEDIA_INCOMPLETE', `Required inspection media missing: ${missing.join(', ')}`);
    const requiredItems = await rows('SELECT item_code,value FROM inspection_checklist_items WHERE inspection_session_id=? AND required=1', [session.id]);
    const requiredCodes = ['CLEAN_INSIDE', 'CLEAN_OUTSIDE', 'GPS_CHECK', 'DOCUMENTS', 'FUEL_VERIFICATION'];
    const completed = new Set(requiredItems.filter((x) => x.value !== '').map((x) => x.item_code));
    const checklistMissing = requiredCodes.filter((c) => !completed.has(c));
    if (checklistMissing.length)
        throw conflict('CHECKLIST_INCOMPLETE', `Required checklist items missing: ${checklistMissing.join(', ')}`);
    const sig = await one('SELECT id,signature,signature_drop_off FROM agreement_signatures WHERE reservation_id=? AND reservation_details_id=? LIMIT 1', [session.reservation_id, session.reservation_details_id]);
    if (!sig)
        throw conflict('SIGNATURE_REQUIRED', 'Customer signature is required before delivery/return validation');
    if (session.phase === 'PICKUP' && !sig.signature)
        throw conflict('SIGNATURE_REQUIRED', 'Pickup customer signature is required');
    if (session.phase === 'RETURN' && !sig.signature_drop_off)
        throw conflict('RETURN_SIGNATURE_REQUIRED', 'Return customer signature is required');
}
export const agentRouter = Router();
agentRouter.use(requireAuth, requireRoles(LegacyRole.AGENT));
agentRouter.get('/contracts', asyncHandler(async (req, res) => {
    const id = await agentId(req);
    const data = await rows(`SELECT a.id AS assignment_id,a.status AS assignment_status,r.id AS reservation_id,r.reservation_no,r.service_type,r.status AS reservation_status,
            rd.id AS reservation_details_id,rd.pick_up_date,rd.drop_off_date,rd.pick_up_location,rd.drop_off_location,
            c.full_name AS customer_name,v.id AS vehicle_id,v.title AS vehicle_title,v.reg_no
       FROM rental_agent_assignments a
       JOIN reservations r ON r.id=a.reservation_id AND r.deleted_at IS NULL
       JOIN reservation_details rd ON rd.id=a.reservation_details_id AND rd.deleted_at IS NULL
       JOIN vehicles v ON v.id=a.vehicle_id
       LEFT JOIN customers c ON c.id=r.customer_id
      WHERE a.agent_id=? AND a.status<>'CANCELLED'
      ORDER BY rd.pick_up_date DESC,a.id DESC`, [id]);
    return ok(res, data);
}));
agentRouter.get('/contracts/:id', asyncHandler(async (req, res) => {
    const id = await agentId(req);
    const a = await assignmentFor(Number(req.params.id), id);
    const detail = await one(`SELECT r.id,r.reservation_no,r.service_type,r.status,r.payment_status,r.special_note,rd.*,c.full_name AS customer_name,c.phone_no,c.email,
            v.id AS vehicle_id,v.title AS vehicle_title,v.model,v.reg_no,vc.title AS vehicle_class
       FROM reservations r JOIN reservation_details rd ON rd.id=?
       LEFT JOIN customers c ON c.id=r.customer_id JOIN vehicles v ON v.id=? JOIN vehicle_classes vc ON vc.id=v.vehicle_class_id WHERE r.id=?`, [a.reservation_details_id, a.vehicle_id, a.reservation_id]);
    const inspections = await rows('SELECT id,phase,mileage,fuel_level,status,created_at,completed_at FROM inspection_sessions WHERE reservation_id=? AND agent_id=? ORDER BY id', [a.reservation_id, id]);
    return ok(res, { assignment: a, contract: detail, inspections });
}));
agentRouter.post('/contracts/:id/inspections', asyncHandler(async (req, res) => {
    const body = validate(z.object({ phase: z.enum(['PICKUP', 'RETURN']) }), req.body);
    const id = await agentId(req);
    const a = await assignmentFor(Number(req.params.id), id);
    if (body.phase === 'RETURN' && !['IN_PROGRESS', 'RETURN_INSPECTION'].includes(a.status))
        throw conflict('RETURN_NOT_ALLOWED', 'Return inspection can start only after vehicle delivery');
    const existing = await one('SELECT * FROM inspection_sessions WHERE reservation_id=? AND reservation_details_id=? AND vehicle_id=? AND phase=?', [a.reservation_id, a.reservation_details_id, a.vehicle_id, body.phase]);
    if (existing)
        return ok(res, existing);
    const result = await exec('INSERT INTO inspection_sessions (reservation_id,reservation_details_id,vehicle_id,agent_id,phase,status,created_at) VALUES (?,?,?,?,?,\'IN_PROGRESS\',NOW())', [a.reservation_id, a.reservation_details_id, a.vehicle_id, id, body.phase]);
    if (body.phase === 'PICKUP')
        await exec('UPDATE rental_agent_assignments SET status=\'PENDING_DELIVERY\',updated_at=NOW() WHERE id=?', [a.id]);
    if (body.phase === 'RETURN')
        await exec('UPDATE rental_agent_assignments SET status=\'RETURN_INSPECTION\',updated_at=NOW() WHERE id=?', [a.id]);
    return ok(res, { id: result.insertId, phase: body.phase, status: 'IN_PROGRESS' }, 201);
}));
agentRouter.patch('/inspections/:id/readings', asyncHandler(async (req, res) => {
    const body = validate(z.object({ mileage: z.number().nonnegative(), fuelLevel: z.number().int().min(0).max(100) }), req.body);
    const id = await agentId(req);
    const s = await sessionFor(Number(req.params.id), id);
    if (s.status === 'COMPLETED')
        throw conflict('INSPECTION_ALREADY_COMPLETED', 'Completed inspection cannot be edited');
    await exec('UPDATE inspection_sessions SET mileage=?,fuel_level=? WHERE id=?', [body.mileage, body.fuelLevel, s.id]);
    return ok(res, { id: s.id, ...body });
}));
agentRouter.post('/inspections/:id/media', upload.array('files', 8), asyncHandler(async (req, res) => {
    const body = validate(z.object({ mediaType: z.enum(['FRONT', 'REAR', 'LEFT', 'RIGHT', 'VIDEO_360', 'DAMAGE', 'OTHER']) }), req.body);
    const id = await agentId(req);
    const s = await sessionFor(Number(req.params.id), id);
    if (s.status === 'COMPLETED')
        throw conflict('INSPECTION_ALREADY_COMPLETED', 'Completed inspection cannot be edited');
    const files = req.files;
    if (!files?.length)
        throw badRequest('FILE_REQUIRED', 'At least one file is required');
    const saved = [];
    for (const file of files) {
        const stored = await storeBuffer(file.buffer, file.originalname, file.mimetype, `inspections/${s.reservation_id}/${s.phase.toLowerCase()}`);
        const result = await exec('INSERT INTO inspection_media (inspection_session_id,media_type,file_path,mime_type,created_at) VALUES (?,?,?,?,NOW())', [s.id, body.mediaType, stored.path, file.mimetype]);
        saved.push({ id: result.insertId, path: stored.path });
    }
    return ok(res, saved, 201);
}));
agentRouter.put('/inspections/:id/checklist', asyncHandler(async (req, res) => {
    const body = validate(z.object({ items: z.array(z.object({ code: z.string().min(1).max(80), label: z.string().min(1).max(191), value: z.union([z.string(), z.boolean(), z.number()]).transform(String), required: z.boolean().default(true) })).min(1) }), req.body);
    const id = await agentId(req);
    const s = await sessionFor(Number(req.params.id), id);
    if (s.status === 'COMPLETED')
        throw conflict('INSPECTION_ALREADY_COMPLETED', 'Completed inspection cannot be edited');
    await transaction(async (conn) => {
        for (const item of body.items) {
            await exec(`INSERT INTO inspection_checklist_items (inspection_session_id,item_code,label,value,required,created_at,updated_at)
                  VALUES (?,?,?,?,?,NOW(),NOW()) ON DUPLICATE KEY UPDATE label=VALUES(label),value=VALUES(value),required=VALUES(required),updated_at=NOW()`, [s.id, item.code, item.label, item.value, item.required ? 1 : 0], conn);
        }
    });
    return ok(res, body.items);
}));
agentRouter.post('/inspections/:id/damages', upload.array('photos', 8), asyncHandler(async (req, res) => {
    const body = validate(z.object({ area: z.string().min(1).max(100), damageType: z.string().max(100).optional(), x: z.string().max(50).optional(), y: z.string().max(50).optional(), notes: z.string().max(4000).optional() }), req.body);
    const id = await agentId(req);
    const s = await sessionFor(Number(req.params.id), id);
    const files = req.files ?? [];
    if (!files.length)
        throw badRequest('DAMAGE_PHOTO_REQUIRED', 'At least one damage photo is required');
    const result = await transaction(async (conn) => {
        const damage = await exec('INSERT INTO reservation_vehicle_damages (reservation_id,reservation_details_id,vehicle_id,created_by,created_at,updated_at) VALUES (?,?,?,?,NOW(),NOW())', [s.reservation_id, s.reservation_details_id, s.vehicle_id, req.auth.userId], conn);
        const structured = await exec('INSERT INTO inspection_damages (inspection_session_id,reservation_vehicle_damage_id,area,damage_type,x,y,notes,created_at) VALUES (?,?,?,?,?,?,?,NOW())', [s.id, damage.insertId, body.area, body.damageType ?? null, body.x ?? null, body.y ?? null, body.notes ?? null], conn);
        if (body.x && body.y) {
            const table = s.phase === 'PICKUP' ? 'agreement_vehicle_damages_pick_up_inspections' : 'agreement_vehicle_damages_drop_off_inspections';
            await conn.execute(`INSERT INTO ${table} (reservation_id,reservation_details_id,vehicle_id,x,y,text,status,created_at,updated_at) VALUES (?,?,?,?,?,?,1,NOW(),NOW())`, [s.reservation_id, s.reservation_details_id, s.vehicle_id, body.x, body.y, body.notes ?? body.area]);
        }
        return { structuredId: structured.insertId, damageId: damage.insertId };
    });
    const photoPaths = [];
    for (const file of files) {
        const stored = await storeBuffer(file.buffer, file.originalname, file.mimetype, `damages/${s.reservation_id}`);
        photoPaths.push(stored.path);
        await exec('INSERT INTO reservation_vehicle_damage_photos (type,is_only_agreement,reservation_vehicle_damage_id,file_path,description,created_at,updated_at) VALUES (?,0,?,?,?,NOW(),NOW())', [s.phase === 'PICKUP' ? 1 : 2, result.damageId, stored.path, body.notes ?? body.area]);
        await exec('INSERT INTO inspection_media (inspection_session_id,media_type,file_path,mime_type,created_at) VALUES (?,\'DAMAGE\',?,?,NOW())', [s.id, stored.path, file.mimetype]);
    }
    return ok(res, { ...result, ...body, photoPaths }, 201);
}));
agentRouter.put('/inspections/:id/signature', asyncHandler(async (req, res) => {
    const body = validate(z.object({ signature: z.string().min(10) }), req.body);
    const id = await agentId(req);
    const s = await sessionFor(Number(req.params.id), id);
    const existing = await one('SELECT id FROM agreement_signatures WHERE reservation_id=? AND reservation_details_id=? LIMIT 1', [s.reservation_id, s.reservation_details_id]);
    if (!existing) {
        if (s.phase === 'RETURN')
            throw conflict('PICKUP_SIGNATURE_MISSING', 'Pickup signature must exist before return signature can be stored');
        await exec('INSERT INTO agreement_signatures (reservation_id,reservation_details_id,signature,created_at,updated_at) VALUES (?,?,?,NOW(),NOW())', [s.reservation_id, s.reservation_details_id, body.signature]);
    }
    else if (s.phase === 'PICKUP') {
        await exec('UPDATE agreement_signatures SET signature=?,updated_at=NOW() WHERE id=?', [body.signature, existing.id]);
    }
    else {
        await exec('UPDATE agreement_signatures SET signature_drop_off=?,signature_drop_off_date=CURDATE(),updated_at=NOW() WHERE id=?', [body.signature, existing.id]);
    }
    return ok(res, { saved: true, phase: s.phase });
}));
agentRouter.post('/inspections/:id/complete', asyncHandler(async (req, res) => {
    const id = await agentId(req);
    const s = await sessionFor(Number(req.params.id), id);
    if (s.status === 'COMPLETED')
        return ok(res, { id: s.id, status: 'COMPLETED', alreadyCompleted: true });
    await validateInspection(s);
    const assignment = await assignmentFor(s.reservation_id, id);
    await transaction(async (conn) => {
        await exec('UPDATE inspection_sessions SET status=\'COMPLETED\',completed_at=NOW() WHERE id=?', [s.id], conn);
        if (s.phase === 'PICKUP')
            await exec('UPDATE rental_agent_assignments SET status=\'IN_PROGRESS\',updated_at=NOW() WHERE id=?', [assignment.id], conn);
        else {
            await exec('UPDATE rental_agent_assignments SET status=\'COMPLETED\',updated_at=NOW() WHERE id=?', [assignment.id], conn);
            await exec('UPDATE reservations SET status=2,updated_at=NOW(),data_sync_to_zoho=0 WHERE id=?', [s.reservation_id], conn);
            await exec('DELETE FROM vehicle_reserved_dates WHERE reservation_id=?', [s.reservation_id], conn);
        }
        await exec('INSERT INTO reservation_status_events (reservation_id,reservation_details_id,actor_user_id,actor_role,status,note,occurred_at) VALUES (?,?,?,\'AGENT\',?,?,NOW())', [s.reservation_id, s.reservation_details_id, req.auth.userId, s.phase === 'PICKUP' ? 'RENTAL_IN_PROGRESS' : 'RENTAL_COMPLETED', `${s.phase} inspection completed`], conn);
    });
    const refreshed = await sessionFor(s.id, id);
    await upsertLegacyInspection(refreshed);
    await syncChecklist(refreshed);
    const customerUser = await customerUserId(assignment.customer_id);
    if (customerUser)
        await notifyUser(customerUser, s.phase === 'PICKUP' ? 'RENTAL_DELIVERED' : 'RENTAL_COMPLETED', s.phase === 'PICKUP' ? 'Vehicle delivered' : 'Rental completed', s.phase === 'PICKUP' ? 'Pickup inspection is complete and the rental is in progress.' : 'Return inspection is complete and the rental is closed.', { reservationId: s.reservation_id });
    return ok(res, { id: s.id, phase: s.phase, status: 'COMPLETED', assignmentStatus: s.phase === 'PICKUP' ? 'IN_PROGRESS' : 'COMPLETED' });
}));
agentRouter.get('/inspections/:id', asyncHandler(async (req, res) => {
    const id = await agentId(req);
    const s = await sessionFor(Number(req.params.id), id);
    const media = await rows('SELECT id,media_type,file_path,mime_type,created_at FROM inspection_media WHERE inspection_session_id=? ORDER BY id', [s.id]);
    const checklist = await rows('SELECT item_code,label,value,required FROM inspection_checklist_items WHERE inspection_session_id=? ORDER BY id', [s.id]);
    const damages = await rows('SELECT id,reservation_vehicle_damage_id,area,damage_type,x,y,notes,created_at FROM inspection_damages WHERE inspection_session_id=? ORDER BY id', [s.id]);
    return ok(res, { ...s, media, checklist, damages });
}));
