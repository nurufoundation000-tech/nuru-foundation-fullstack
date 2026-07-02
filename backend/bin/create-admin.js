const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'nurufoun_db',
  });

  // Seed roles
  const roleNames = ['admin', 'tutor', 'student'];
  for (const name of roleNames) {
    const [rows] = await conn.execute('SELECT id FROM roles WHERE name = ?', [name]);
    if (rows.length === 0) {
      await conn.execute('INSERT INTO roles (name) VALUES (?)', [name]);
      console.log('Role created: ' + name);
    }
  }

  // Get admin role id
  const [roleRows] = await conn.execute('SELECT id FROM roles WHERE name = ?', ['admin']);
  const roleId = roleRows[0].id;

  // Create/update admin user
  const email = 'admin@nurufoundation.com';
  const username = 'admin';
  const password = 'admin123';
  const hash = await bcrypt.hash(password, 10);

  const [existing] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);
  if (existing.length > 0) {
    await conn.execute(
      'UPDATE users SET username = ?, password_hash = ?, role_id = ?, must_change_password = 0 WHERE email = ?',
      [username, hash, roleId, email]
    );
    console.log('Admin user updated: ' + email);
  } else {
    await conn.execute(
      'INSERT INTO users (email, username, password_hash, role_id, must_change_password) VALUES (?, ?, ?, ?, 0)',
      [email, username, hash, roleId]
    );
    console.log('Admin user created: ' + email);
  }

  await conn.end();
}

main().catch(err => { console.error(err); process.exit(1); });
