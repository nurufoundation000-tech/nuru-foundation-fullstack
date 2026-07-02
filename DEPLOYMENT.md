# Nuru Foundation — Deployment Guide

## Hosting Environment
- **Hosting type:** LiteSpeed cPanel shared hosting
- **Node.js:** Available via cPanel "Setup Node.js App" feature
- **Database:** MySQL/MariaDB via cPanel
- **SSL:** Enable via cPanel AutoSSL or Let's Encrypt

## Deploying the Backend

### 1. Upload Files
Upload the entire `backend/` directory to your hosting account.

### 2. Set Up Node.js App (cPanel)
1. Go to **Setup Node.js App** in cPanel
2. Create a new Node.js application:
   - **Application root:** `/path/to/backend`
   - **Application URL:** `https://yourdomain.com`
   - **Application startup file:** `src/app.js`
   - **Application mode:** `Production`
3. After creation, run `npm install` in the application root via cPanel terminal or SSH

### 3. Environment Variables
Set these in cPanel (or create a `.env` file in `backend/`):

| Variable | Description |
|----------|-------------|
| `PORT` | Usually `5000` |
| `NODE_ENV` | `production` |
| `DB_HOST` | MySQL host (usually `localhost`) |
| `DB_PORT` | MySQL port (usually `3306`) |
| `DB_USER` | MySQL username |
| `DB_PASSWORD` | MySQL password |
| `DB_NAME` | Database name |
| `JWT_SECRET` | Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `MPESA_CONSUMER_KEY` | Safaricom API consumer key |
| `MPESA_CONSUMER_SECRET` | Safaricom API consumer secret |
| `MPESA_SHORT_CODE` | Safaricom short code |
| `MPESA_PASSKEY` | Safaricom passkey |
| `MPESA_ENV` | `sandbox` or `production` |
| `MPESA_CALLBACK_URL` | Full URL for M-Pesa callbacks |
| `MPESA_FORCE_SIMULATION` | `true` to simulate M-Pesa (no real transactions) |
| `CRON_SECRET` | Secret token for external cron triggers |

### 4. Database Setup
1. Create a MySQL database via cPanel
2. Import `backend/sql/schema.sql` (if exists) or create tables
3. Run migration scripts in order:
   - `backend/sql/migration_add_missing_columns.sql`
   - `backend/sql/migration_phase_a.sql`
   - `backend/sql/migration_phase_b.sql`

### 5. Configure Domain
- Point your domain or subdomain to the Node.js app
- The `.htaccess` should proxy requests to the Node.js app port

### 6. File Uploads
Ensure these directories exist and are writable:
- `backend/public_html/uploads/images/`
- `backend/public_html/uploads/files/`

## Cron Jobs (via cron-job.org)

Since shared hosting has no persistent cron, use **cron-job.org** (free):

### Setup Instructions
1. Create an account at [cron-job.org](https://cron-job.org)
2. Create two cron jobs:

#### Job 1: Monthly Invoice Generation
- **URL:** `https://yourdomain.com/api/cron/generate-monthly-invoices?token=YOUR_CRON_SECRET`
- **Interval:** Daily (recommended: 02:00 AM)
- **Method:** GET

#### Job 2: Overdue Invoice Check
- **URL:** `https://yourdomain.com/api/cron/check-overdue?token=YOUR_CRON_SECRET`
- **Interval:** Hourly
- **Method:** GET

### Security
- The `CRON_SECRET` environment variable must match the `?token=` parameter
- Never share the cron URL publicly

## Frontend
- Static frontend files are served directly by the Node.js backend from `backend/public_html/`
- No separate build step needed — just upload HTML/CSS/JS files

## Updating the Application
1. Upload new files via FTP or cPanel File Manager
2. Restart the Node.js app from cPanel if needed
3. Run any new migration SQL files

## Troubleshooting

### Backend won't start
- Check `JWT_SECRET` is set
- Check database credentials
- Run `node src/app.js` from SSH to see error output

### M-Pesa not working
- Set `MPESA_FORCE_SIMULATION=true` for testing
- Check callback URL is publicly accessible
- Verify STK push credentials

### File uploads failing
- Check directory permissions (should be 755)
- Check PHP upload limits (if PHP is involved)
