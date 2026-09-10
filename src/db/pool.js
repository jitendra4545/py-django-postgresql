// import mysql from 'mysql2/promise';
// import { env } from '../config/env.js';
// export const db = mysql.createPool({
//     host: env.DB_HOST,
//     port: env.DB_PORT,
//     user: env.DB_USER,
//     password: env.DB_PASSWORD,
//     database: env.DB_NAME,
//     connectionLimit: env.DB_CONNECTION_LIMIT,
//     waitForConnections: true,
//     queueLimit: 0,
//     enableKeepAlive: true,
//     keepAliveInitialDelay: 0,
//     decimalNumbers: true,
//     timezone: 'Z'
// });
// export async function rows(sql, params = [], executor = db) {
//     const [result] = await executor.execute(sql, params);
//     return result;
// }
// export async function one(sql, params = [], executor = db) {
//     const result = await rows(sql, params, executor);
//     return result[0] ?? null;
// }
// export async function exec(sql, params = [], executor = db) {
//     const [result] = await executor.execute(sql, params);
//     return result;
// }
// export async function transaction(fn) {
//     const conn = await db.getConnection();
//     try {
//         await conn.beginTransaction();
//         const result = await fn(conn);
//         await conn.commit();
//         return result;
//     }
//     catch (error) {
//         await conn.rollback();
//         throw error;
//     }
//     finally {
//         conn.release();
//     }
// }













import mysql from 'mysql2/promise';

import { env } from '../config/env.js';

export const db = mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    connectionLimit: env.DB_CONNECTION_LIMIT,

    waitForConnections: true,
    queueLimit: 0,

    enableKeepAlive: true,
    keepAliveInitialDelay: 0,

    decimalNumbers: true,
    timezone: 'Z',

    ssl: env.DB_SSL
        ? {
              rejectUnauthorized: false
          }
        : undefined
});

export async function rows(sql, params = [], executor = db) {
    const [result] = await executor.execute(sql, params);
    return result;
}

export async function one(sql, params = [], executor = db) {
    const result = await rows(sql, params, executor);
    return result[0] ?? null;
}

export async function exec(sql, params = [], executor = db) {
    const [result] = await executor.execute(sql, params);
    return result;
}

export async function transaction(fn) {
    const conn = await db.getConnection();

    try {
        await conn.beginTransaction();

        const result = await fn(conn);

        await conn.commit();

        return result;
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
}