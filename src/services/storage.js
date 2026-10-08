import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

const s3 = env.UPLOAD_DRIVER === 's3' ? new S3Client({ region: env.AWS_REGION }) : null;
const safeExtension = (name) =>
  path
    .extname(name)
    .toLowerCase()
    .replace(/[^.a-z0-9]/g, '')
    .slice(0, 10);

export const storePrivateFile = async (file) => {
  const key = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${safeExtension(file.originalname)}`;
  if (env.UPLOAD_DRIVER === 's3') {
    await s3.send(
      new PutObjectCommand({
        Bucket: env.AWS_S3_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ServerSideEncryption: 'AES256',
      }),
    );
    return { disk: 's3', key };
  }
  const root = path.resolve(env.UPLOAD_DIR);
  const fullPath = path.resolve(root, key);
  if (!fullPath.startsWith(`${root}${path.sep}`)) throw new Error('Invalid upload path');
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, file.buffer, { flag: 'wx', mode: 0o600 });
  return { disk: 'local', key };
};

export const localFilePath = (key) => {
  const root = path.resolve(env.UPLOAD_DIR);
  const fullPath = path.resolve(root, key);
  if (!fullPath.startsWith(`${root}${path.sep}`)) throw new Error('Invalid stored file path');
  return fullPath;
};

export const signedDownloadUrl = async (key) =>
  getSignedUrl(s3, new GetObjectCommand({ Bucket: env.AWS_S3_BUCKET, Key: key }), {
    expiresIn: 300,
  });
