import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

// DigitalOcean Spaces implements the S3 protocol. The SDK is used only as the
// protocol client; no AWS infrastructure or AWS environment variables are used.
const spaces =
  env.UPLOAD_DRIVER === 'spaces'
    ? new S3Client({
        endpoint: env.DO_SPACES_ENDPOINT,
        region: env.DO_SPACES_REGION,
        forcePathStyle: false,
        credentials: {
          accessKeyId: env.DO_SPACES_KEY,
          secretAccessKey: env.DO_SPACES_SECRET,
        },
      })
    : null;

const safeExtension = (name) =>
  path
    .extname(name)
    .toLowerCase()
    .replace(/[^.a-z0-9]/g, '')
    .slice(0, 10);

const safeRoot = (value) =>
  value
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');

export const buildStorageKey = (root, originalName, now = new Date()) =>
  [
    safeRoot(root),
    now.toISOString().slice(0, 10),
    `${crypto.randomUUID()}${safeExtension(originalName)}`,
  ]
    .filter(Boolean)
    .join('/');

const storeFile = async (file, visibility) => {
  const root = visibility === 'PUBLIC' ? env.DO_SPACES_PUBLIC_ROOT : env.DO_SPACES_PRIVATE_ROOT;
  const key = buildStorageKey(root, file.originalname);

  if (env.UPLOAD_DRIVER === 'spaces') {
    await spaces.send(
      new PutObjectCommand({
        Bucket: env.DO_SPACES_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: visibility === 'PUBLIC' ? 'public, max-age=31536000, immutable' : 'no-store',
        ACL: visibility === 'PUBLIC' ? 'public-read' : 'private',
      }),
    );
    return {
      disk: 'spaces',
      key,
      visibility,
      ...(visibility === 'PUBLIC' ? { url: publicMediaUrl(key) } : {}),
    };
  }

  const localRoot = path.resolve(env.UPLOAD_DIR);
  const fullPath = path.resolve(localRoot, key);
  if (!fullPath.startsWith(`${localRoot}${path.sep}`)) throw new Error('Invalid upload path');
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, file.buffer, { flag: 'wx', mode: 0o600 });
  return { disk: 'local', key, visibility };
};

export const storePrivateFile = (file) => storeFile(file, 'PRIVATE');

// Public storage is deliberately a separate function. Sensitive document
// callers cannot make a file public by passing a request field.
export const storePublicFile = (file) => storeFile(file, 'PUBLIC');

export const localFilePath = (key) => {
  const root = path.resolve(env.UPLOAD_DIR);
  const fullPath = path.resolve(root, key);
  if (!fullPath.startsWith(`${root}${path.sep}`)) throw new Error('Invalid stored file path');
  return fullPath;
};

export const publicMediaUrl = (key) => {
  if (!env.MEDIA_CDN_ENABLED || !env.DO_SPACES_CDN_ENDPOINT) return null;
  return `${env.DO_SPACES_CDN_ENDPOINT.replace(/\/$/, '')}/${key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
};

export const signedDownloadUrl = async (key, expiresIn = 300) => {
  if (!spaces) throw new Error('DigitalOcean Spaces storage is not configured');
  return getSignedUrl(spaces, new GetObjectCommand({ Bucket: env.DO_SPACES_BUCKET, Key: key }), {
    expiresIn,
  });
};
