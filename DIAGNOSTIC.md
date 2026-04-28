# Database Connection Diagnostic

## Current Error
```
Access denied for user 'nurufoun_user'@'localhost' (using password: YES)
```

## Current Credentials (from `.env`)
- **Host**: localhost
- **Port**: 3306
- **User**: nurufoun_user
- **Password**: V);shvakQsXURRLM (length: 16)
- **Database**: nurufoun_db

## Steps to Fix

### 1. Verify Credentials in cPanel
1. Log into your cPanel
2. Go to **MySQL Databases** or **phpMyAdmin**
3. Check if the database `nurufoun_db` exists
4. Check if user `nurufoun_user` exists
5. Verify the user has **ALL PRIVILEGES** on `nurufoun_db`

### 2. Recreate User (if needed)
In cPanel MySQL Databases:
1. Create new user OR update password for `nurufoun_user`
2. Make sure to **Add User To Database** with ALL PRIVILEGES
3. Update `.env` file with correct password

### 3. Test Connection in cPanel phpMyAdmin
1. Open phpMyAdmin from cPanel
2. Try to login with:
   - User: `nurufoun_user`
   - Password: `V);shvakQsXURRLM`
3. If login fails, the password is wrong

### 4. Update .env with Correct Password
If you get a new password from cPanel, update `backend/.env`:
```bash
DB_PASSWORD=your_new_correct_password
```

### 5. Run Migration (After DB Connection Works)
In phpMyAdmin, run this SQL:
```sql
-- Add missing columns
ALTER TABLE users ADD COLUMN is_locked BOOLEAN DEFAULT FALSE;
ALTER TABLE courses ADD COLUMN slug VARCHAR(255) UNIQUE;

-- Add slugs to existing courses
UPDATE courses SET slug = 'python' WHERE title LIKE '%Python%' LIMIT 1;
UPDATE courses SET slug = 'web-dev-1' WHERE title LIKE '%Web Development 1%' OR title LIKE '%Web Dev 1%' LIMIT 1;
UPDATE courses SET slug = 'web-dev-2' WHERE title LIKE '%Web Development 2%' OR title LIKE '%Web Dev 2%' LIMIT 1;
UPDATE courses SET slug = 'web-dev-3' WHERE title LIKE '%Web Development 3%' OR title LIKE '%Web Dev 3%' LIMIT 1;
UPDATE courses SET slug = 'data-science' WHERE title LIKE '%Data Science%' LIMIT 1;
UPDATE courses SET slug = 'data-engineering' WHERE title LIKE '%Data Engineering%' LIMIT 1;
UPDATE courses SET slug = 'data-analysis' WHERE title LIKE '%Data Analysis%' LIMIT 1;
UPDATE courses SET slug = 'cybersecurity-1' WHERE title LIKE '%Cybersecurity 1%' OR title LIKE '%Cybersecurity Level 1%' LIMIT 1;
UPDATE courses SET slug = 'cybersecurity-2' WHERE title LIKE '%Cybersecurity 2%' OR title LIKE '%Cybersecurity Level 2%' LIMIT 1;
UPDATE courses SET slug = 'ai-essentials' WHERE title LIKE '%AI Essentials%' LIMIT 1;
UPDATE courses SET slug = 'soft-skills' WHERE title LIKE '%Soft Skills%' LIMIT 1;
UPDATE courses SET slug = 'computer-packages' WHERE title LIKE '%Computer Packages%' LIMIT 1;
```

### 6. Restart Backend
After fixing DB connection:
```bash
cd "D:\Nuru\nuru-foundation-fullstack\backend"
echo test > tmp\restart.txt
```

## Quick Test
Run this after fixing credentials:
```bash
cd "D:\Nuru\nuru-foundation-fullstack\backend"
node test-db.js
```

Expected output:
```
✓ Database connection SUCCESSFUL!
✓ is_locked column EXISTS in users table (or message to run migration)
✓ slug column EXISTS in courses table (or message to run migration)
```

## Test Payment Flow (After DB is Fixed)

### 1. Login as Student
```bash
curl -X POST "http://localhost:5000/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email": "student@test.com", "password": "password123"}'
```

### 2. Check Invoices
```bash
curl -X GET "http://localhost:5000/api/student/invoices" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 3. Check Notes Access (Should be denied)
```bash
curl -X GET "http://localhost:5000/api/student/course-notes-access/1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Initiate Payment
```bash
curl -X POST "http://localhost:5000/api/student/pay/1" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber": "254712345678"}'
```
