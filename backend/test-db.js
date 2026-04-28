// test-db.js - Test database connection
require('dotenv').config();
const mysql = require('mysql2/promise');

async function testConnection() {
  console.log('Testing database connection with:');
  console.log('  Host:', process.env.DB_HOST || 'localhost');
  console.log('  Port:', process.env.DB_PORT || 3306);
  console.log('  User:', process.env.DB_USER || 'nurufoun_user');
  console.log('  Database:', process.env.DB_NAME || 'nurufoun_db');
  console.log('  Password:', process.env.DB_PASSWORD ? '***SET***' : 'NOT SET');
  
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER || 'nurufoun_user',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'nurufoun_db',
    });
    
    await connection.query('SELECT 1 as test');
    console.log('\n✓ Database connection SUCCESSFUL!');
    
    // Check if is_locked column exists
    try {
      await connection.query('SELECT is_locked FROM users LIMIT 1');
      console.log('✓ is_locked column EXISTS in users table');
    } catch (e) {
      console.log('✗ is_locked column MISSING from users table');
      console.log('  Run: ALTER TABLE users ADD COLUMN is_locked BOOLEAN DEFAULT FALSE;');
    }
    
    // Check if slug column exists
    try {
      await connection.query('SELECT slug FROM courses LIMIT 1');
      console.log('✓ slug column EXISTS in courses table');
    } catch (e) {
      console.log('✗ slug column MISSING from courses table');
      console.log('  Run: ALTER TABLE courses ADD COLUMN slug VARCHAR(255) UNIQUE;');
    }
    
    await connection.end();
    
  } catch (error) {
    console.error('\n✗ Database connection FAILED:');
    console.error('  Error:', error.message);
    console.error('\n  Troubleshooting:');
    console.error('  1. Check database credentials in .env');
    console.error('  2. Verify user has access from localhost in cPanel');
    console.error('  3. Check if database exists and is running');
  }
}

testConnection();
