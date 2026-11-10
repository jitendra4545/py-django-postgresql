import bcrypt from 'bcryptjs';

export const hashPassword = (password) => bcrypt.hash(password, 12).then(hash=>hash.replace(/^\$2b\$/, '$2y$'));
export const verifyPassword = (password, hash) => bcrypt.compare(password, hash);
