import fs from 'node:fs';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

const ssl = env.DB_SSL
  ? {
      rejectUnauthorized: true,
      ...(env.DB_SSL_CA_PATH ? { ca: fs.readFileSync(env.DB_SSL_CA_PATH, 'utf8') } : {}),
    }
  : undefined;

export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: env.DB_CONNECTION_LIMIT,
  waitForConnections: true,
  decimalNumbers: true,
  timezone: 'Z',
  ssl,
});

export const query = async (sql, params = []) => {
  const [rows] = await pool.execute(sql, params);
  return rows;
};

export const one = async (sql, params = []) => {
  const rows = await query(sql, params);
  return rows[0] ?? null;
};

export const transaction = async (work) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
