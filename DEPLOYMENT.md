# Nuru Foundation - Deployment Guide

## Project Architecture

```
nuru-foundation-fullstack/
  ├── public_html/     ← Frontend (Apache serves this)
  │     ├── index.html, login.html, admin.html, courses.html, etc.
  │     ├── styles/, scripts/, images/, fonts/
  │     ├── admin-dashboard/, student-dashboard/, tutor-dashboard/
  │     ├── notes/
  │     └── .htaccess  ← Proxies /api/* to nuru_app
  │
  └── nuru_app/      ← Backend (Node.js + MySQL)
        ├── server.js       ← Cleaned (API only, no static files)
        ├── api/
        ├── node_modules/
        ├── sql/
        │   └── schema.sql  ← MySQL schema (run in PHPMyAdmin)
        └── .env
```

---

## Server Upload Order

### Phase 1: Backend (nuru_app)

Upload to `nuru_app/` on cPanel:

1. `server.js`
2. `api/` folder (entire folder)
3. `node_modules/` folder
4. `package.json`
5. `package-lock.json`
6. `.env`
7. `sql/` folder (schema.sql for reference)

After uploading:

1. Go to cPanel → **Setup Node.js App**
2. Application root should be set to `nuru_app`
3. Application startup file should be `server.js`
4. Click **Restart** on the app

### Phase 2: Frontend (public_html)

Upload to `public_html/` on cPanel:

1. All HTML files (index.html, login.html, etc.)
2. `styles/` folder
3. `scripts/` folder
4. `images/` folder
5. `fonts/` folder
6. `admin-dashboard/` folder
7. `student-dashboard/` folder
8. `tutor-dashboard/` folder
9. `notes/` folder
10. `.htaccess`

---

## Server Configuration

### .htaccess (public_html/.htaccess)

```apache
RewriteEngine On
RewriteBase /

# Proxy API requests to Node.js backend
RewriteRule ^api/(.*)$ http://127.0.0.1:3000/api/$1 [P,L]
RewriteRule ^api$ http://127.0.0.1:3000/api [P,L]
```

### cPanel Setup Node.js App

| Setting | Value |
|---------|-------|
| Application root | `nuru_app` |
| Application startup file | `server.js` |
| Application URL | nurufoundations.com |

---

## Testing

After deployment, test these URLs:

| URL | Expected Result |
|-----|---------------|
| https://nurufoundations.com/ | Homepage loads |
| https://nurufoundations.com/login.html | Login page loads |
| https://nurufoundations.com/api/courses | JSON API response |
| https://nurufoundations.com/api/health | Health check |
| https://nurufoundations.com/api/auth/login | Login API endpoint |

---

## Troubleshooting

### 503 Service Unavailable
- Verify Node.js app is running in cPanel
- Check Application root is set to `nuru_app`
- Restart the Node.js app

### Database Connection Error
- Verify `.env` file exists in `nuru_app/`
- Check MySQL credentials in `.env`
- Ensure database exists in cPanel with tables created

### Static Files Not Loading
- Verify all frontend files uploaded to `public_html/`
- Check file permissions (644 for files, 755 for folders)

---

## Environment Variables (.env)

Required in `nuru_app/.env`:

```env
NODE_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=nurufoun_db
JWT_SECRET=your_secure_jwt_secret
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
ADMIN_EMAIL=admin@nurufoundations.com
FRONTEND_URL=https://nurufoundations.com
```

### M-Pesa Configuration (optional)

```env
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_SHORT_CODE=174379
MPESA_PASSKEY=your_passkey
MPESA_ENV=sandbox
MPESA_CALLBACK_URL=https://nurufoundations.com/api/mpesa/callback
```

---

## Database Setup

The MySQL database should be set up with tables from `sql/schema.sql`.

In cPanel PHPMyAdmin:
1. Select the database `nurufoun_db`
2. Import `sql/schema.sql` or run the CREATE TABLE statements
3. Verify tables exist: users, courses, lessons, enrollments, invoices, etc.

---

## Post-Deployment Checklist

- [ ] Backend uploaded to nuru_app/
- [ ] Frontend uploaded to public_html/
- [ ] .htaccess uploaded to public_html/
- [ ] Node.js app running in cPanel
- [ ] Domain resolves correctly (HTTPS)
- [ ] Health check returns success
- [ ] User registration works
- [ ] Login/logout works
- [ ] Dashboard pages load
- [ ] Email sending works
- [ ] M-Pesa integration works (if enabled)