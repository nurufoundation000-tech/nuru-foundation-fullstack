const mysql = require('mysql2/promise');
const Database = require('sql.js');

let pool = null;
let sqlDb = null;
let useSQLite = false;

async function initSQLite() {
  if (sqlDb) return;
  
  const SQL = await Database();
  const dbPath = './prisma/dev.db';
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    sqlDb = new SQL.Database(buffer);
    console.log('SQLite database loaded:', dbPath);
    useSQLite = true;
  }
}

function sqliteQuery(sql, params = []) {
  if (!sqlDb) return [];
  
  sql = sql.replace(/`/g, '');
  sql = sql.replace(/\busers\b/g, 'users');
  sql = sql.replace(/\broles\b/g, 'roles');
  sql = sql.replace(/\bcourses\b/g, 'courses');
  sql = sql.replace(/\blessons\b/g, 'lessons');
  sql = sql.replace(/\benrollments\b/g, 'enrollments');
  sql = sql.replace(/\binvoices\b/g, 'invoices');
  sql = sql.replace(/\blesson_progress\b/g, 'lesson_progress');
  sql = sql.replace(/\bcourse_pricing\b/g, 'course_pricing');
  
  try {
    const stmt = sqlDb.prepare(sql);
    if (params.length > 0) {
      stmt.bind(params);
    }
    
    const results = [];
    while (stmt.step()) {
      const row = stmt.getAsObject();
      results.push(row);
    }
    stmt.free();
    return results;
  } catch (e) {
    console.log('SQLite query error:', e.message, 'SQL:', sql.substring(0, 100));
    return [];
  }
}

function sqliteGetOne(sql, params = []) {
  const rows = sqliteQuery(sql, params);
  return rows[0] || null;
}

function sqliteInsert(table, data) {
  if (!sqlDb) return 0;
  
  const fields = Object.keys(data);
  const values = Object.values(data).map(v => {
    if (v instanceof Date) return v.toISOString();
    return v;
  });
  
  const sql = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${values.map(() => '?').join(', ')})`;
  
  try {
    sqlDb.run(sql, values);
    const result = sqliteGetOne('SELECT last_insert_rowid() as id');
    return result?.id || 0;
  } catch (e) {
    console.log('SQLite insert error:', e.message);
    return 0;
  }
}

function sqliteUpdate(table, id, data) {
  if (!sqlDb) return;
  
  const fields = Object.keys(data);
  const values = Object.values(data);
  const sql = `UPDATE ${table} SET ${fields.map(f => `${f} = ?`).join(', ')} WHERE id = ?`;
  
  try {
    sqlDb.run(sql, [...values, id]);
  } catch (e) {
    console.log('SQLite update error:', e.message);
  }
}

async function getPool() {
  if (pool) return pool;
  
  const dbUrl = process.env.DATABASE_URL || '';
  
  let config;
  if (dbUrl.startsWith('mysql://')) {
    const url = new URL(dbUrl);
    config = {
      host: url.hostname || 'localhost',
      port: url.port || 3306,
      user: url.username,
      password: url.password,
      database: url.pathname?.replace('/', '') || 'nurufoun_db',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };
  } else {
    config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'nurufoun_user',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'nurufoun_db',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };
  }
  
  try {
    pool = mysql.createPool(config);
    await pool.query('SELECT 1');
    console.log('MySQL pool created:', config.database);
    return pool;
  } catch (err) {
    console.log('MySQL connection failed, using SQLite for testing:', err.message);
    
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }
    
    await initSQLite();
    return null;
  }
}

async function query(sql, params = []) {
  if (useSQLite) {
    return sqliteQuery(sql, params);
  }
  
  const p = await getPool();
  if (!p) {
    return sqliteQuery(sql, params);
  }
  const [rows] = await p.execute(sql, params);
  return rows;
}

async function getOne(sql, params = []) {
  if (useSQLite) {
    return sqliteGetOne(sql, params);
  }
  
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function insert(table, data) {
  if (useSQLite) {
    return sqliteInsert(table, data);
  }
  
  const p = await getPool();
  if (!p) {
    return sqliteInsert(table, data);
  }
  
  const fields = Object.keys(data);
  const values = Object.values(data);
  const placeholders = fields.map(() => '?').join(', ');
  const sql = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`;
  const [result] = await p.execute(sql, values);
  return result.insertId;
}

async function update(table, id, data) {
  if (useSQLite) {
    return sqliteUpdate(table, id, data);
  }
  
  const p = await getPool();
  if (!p) {
    return sqliteUpdate(table, id, data);
  }
  
  const fields = Object.keys(data);
  const values = Object.values(data);
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
  values.push(id);
  await p.execute(sql, values);
}

async function remove(table, id) {
  if (useSQLite && sqlDb) {
    sqlDb.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
    return;
  }
  
  const p = await getPool();
  if (p) {
    await p.execute(`DELETE FROM ${table} WHERE id = ?`, [id]);
  }
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (sqlDb) {
    sqlDb.close();
    sqlDb = null;
  }
}

module.exports = {
  getPool,
  query,
  getOne,
  insert,
  update,
  remove,
  close
};