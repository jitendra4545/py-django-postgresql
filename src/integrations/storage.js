import fs from 'node:fs/promises';
import path from 'node:path';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';
const s3 = env.STORAGE_DRIVER === 's3'
    ? new S3Client({
        region: env.AWS_REGION,
        credentials: env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
            ? { accessKeyId: env.AWS_ACCESS_KEY_ID, secretAccessKey: env.AWS_SECRET_ACCESS_KEY }
            : undefined
    })
    : null;
export async function storeBuffer(buffer, fileName, mimeType, folder) {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}-${safeName}`;
    if (env.STORAGE_DRIVER === 's3') {
        if (!s3 || !env.AWS_S3_BUCKET)
            throw new Error('S3 storage is selected but bucket configuration is missing');
        await s3.send(new PutObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: key, Body: buffer, ContentType: mimeType }));
        return { path: `s3://${env.AWS_S3_BUCKET}/${key}`, mimeType };
    }
    const absolute = path.resolve(process.cwd(), env.UPLOAD_DIR, key);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, buffer);
    return { path: `/${env.UPLOAD_DIR}/${key}`.replace(/\\/g, '/'), mimeType };
}
