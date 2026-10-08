import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { asyncHandler } from '../common/async-handler.js';
import { requireAuth } from '../common/auth.js';
import { AppError, forbidden, notFound } from '../common/errors.js';
import { env } from '../config/env.js';
import { ROLES } from '../config/constants.js';
import { one, query } from '../db/pool.js';
import { getReservationForAccess } from '../services/access.js';
import { localFilePath, signedDownloadUrl, storePrivateFile } from '../services/storage.js';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const detectedMime = (buffer) => {
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'application/pdf';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP')
    return 'image/webp';
  return null;
};
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) =>
    callback(
      allowedTypes.has(file.mimetype)
        ? null
        : new AppError(
            415,
            'FILE_TYPE_UNSUPPORTED',
            'Only JPEG, PNG, WebP and PDF files are allowed',
          ),
      allowedTypes.has(file.mimetype),
    ),
});
const router = Router();
router.use(requireAuth);

router.post(
  '/',
  upload.single('file'),
  asyncHandler(async (request, response) => {
    if (!request.file) throw new AppError(422, 'FILE_REQUIRED', 'A file is required');
    if (detectedMime(request.file.buffer) !== request.file.mimetype) {
      throw new AppError(
        415,
        'FILE_CONTENT_INVALID',
        'File content does not match its declared type',
      );
    }
    const reservationId = request.body.reservationId ? Number(request.body.reservationId) : null;
    if (reservationId) await getReservationForAccess(request.auth, reservationId);
    const stored = await storePrivateFile(request.file);
    const result = await query(
      `INSERT INTO app_documents
      (owner_user_id, reservation_id, category, original_name, storage_disk, storage_key,
       mime_type, size_bytes, expires_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        request.auth.userId,
        reservationId,
        request.body.category ?? 'GENERAL',
        request.file.originalname.slice(0, 255),
        stored.disk,
        stored.key,
        request.file.mimetype,
        request.file.size,
        request.body.expiresAt ?? null,
      ],
    );
    response.status(201).json({
      id: result.insertId,
      category: request.body.category ?? 'GENERAL',
      name: request.file.originalname,
    });
  }),
);

const assertDocumentAccess = async (request, document) => {
  if (Number(document.owner_user_id) === Number(request.auth.userId)) return;
  if ([ROLES.ADMIN, ROLES.STAFF].includes(request.auth.role)) return;
  if (document.reservation_id)
    return getReservationForAccess(request.auth, document.reservation_id);
  throw forbidden();
};

router.get(
  '/:id/download',
  asyncHandler(async (request, response) => {
    const document = await one('SELECT * FROM app_documents WHERE id=? AND deleted_at IS NULL', [
      request.params.id,
    ]);
    if (!document) throw notFound('Document not found');
    await assertDocumentAccess(request, document);
    if (document.storage_disk === 's3')
      return response.redirect(await signedDownloadUrl(document.storage_key));
    const path = localFilePath(document.storage_key);
    if (!fs.existsSync(path)) throw notFound('Stored document file not found');
    response.setHeader('Content-Type', document.mime_type);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.original_name.replaceAll('"', '')}"`,
    );
    return fs.createReadStream(path).pipe(response);
  }),
);

export default router;
