import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
export const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
export function normalizeLegacyBcrypt(hash) {
    return hash.startsWith('$2y$') ? `$2b$${hash.slice(4)}` : hash;
}
export async function verifyPassword(password, hash) {
    return bcrypt.compare(password, normalizeLegacyBcrypt(hash));
}
export async function hashForLegacyLaravel(password) {
    const hash = await bcrypt.hash(password, 12);
    return hash.startsWith('$2b$') ? `$2y$${hash.slice(4)}` : hash;
}
