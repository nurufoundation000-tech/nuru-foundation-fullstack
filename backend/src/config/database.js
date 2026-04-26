// config/database.js - MySQL Database Configuration
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

let pool = null;

export async function getPool() {
  if (pool) return pool;

  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'nurufoun_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nurufoun_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };

  try {
    pool = mysql.createPool(config);
    await pool.query('SELECT 1');
    console.log('MySQL pool created:', config.database);
    return pool;
  } catch (err) {
    console.error('MySQL connection failed:', err.message);
    throw err;
  }
}

export async function query(sql, params = []) {
  const p = await getPool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

export async function getOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

export async function insert(table, data) {
  const p = await getPool();

  const fields = Object.keys(data);
  const values = Object.values(data);
  const placeholders = fields.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`;
  const [result] = await p.execute(sql, values);
  return result.insertId;
}

export async function update(table, id, data) {
  const p = await getPool();

  const fields = Object.keys(data);
  const values = Object.values(data);
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
  values.push(id);
  await p.execute(sql, values);
}

export async function remove(table, id) {
  const p = await getPool();
  await p.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
}

export async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export default {
  getPool,
  query,
  getOne,
  insert,
  update,
  remove,
  close
};