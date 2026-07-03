const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'nurufoun_user',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nurufoun_db',
    multipleStatements: true
  });

  const migrationFile = process.argv[2] || 'migration_course_tutors.sql';
  const sqlPath = path.join(__dirname, '..', 'sql', migrationFile);
  const sql = fs.readFileSync(sqlPath, 'utf8');

  try {
    await conn.query(sql);
    console.log('Migration applied successfully: course_tutors table created + data migrated');
  } catch (err) {
    console.error('Migration error:', err.message);
  } finally {
    await conn.end();
  }
}

run();
