// src/app.js - PRODUCTION VERSION for LiteSpeed (CommonJS)
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const fs = require('fs');
require('dotenv').config();

const app = express();
const routes = require('./routes/index.js');

console.log('[App] Checking environment variables...');
console.log('[App] EMAIL_USER:', process.env.EMAIL_USER ? 'SET' : 'NOT SET');
console.log('[App] EMAIL_PASS:', process.env.EMAIL_PASS ? 'SET' : 'NOT SET');
console.log('[App] FRONTEND_URL:', process.env.FRONTEND_URL || 'NOT SET');
console.log('[App] JWT_SECRET:', process.env.JWT_SECRET ? 'SET' : 'NOT SET');

if (!process.env.JWT_SECRET) {
  console.error('[App] FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';

const publicHtmlPath = path.resolve(__dirname, '..', '..', 'public_html');

// CRITICAL: Skip static for API paths
app.use('/api', (req, res, next) => {
  next();
});

const allowedOrigins = [
  'https://nurufoundations.com',
  'https://www.nurufoundations.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5000'
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('nurufoundations.com')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'Content-Type']
};

app.use(cors(corsOptions));

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploads directory for file uploads
const uploadsPath = path.resolve(__dirname, '..', '..', 'public_html', 'uploads');
if (fs.existsSync(uploadsPath)) {
  app.use('/uploads', express.static(uploadsPath, {
    setHeaders: (res, filePath) => {
      if (/\.(jpg|jpeg|png|webp|gif|svg)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    }
  }));
  console.log('Uploads directory configured at:', uploadsPath);
}

if (fs.existsSync(publicHtmlPath)) {
  app.use(express.static(publicHtmlPath, {
    setHeaders: (res, filePath) => {
      if (/\.(jpg|jpeg|png|webp|gif|svg|ico)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
      if (/\.(css|js)$/i.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    }
  }));
  console.log('Static frontend configured at:', publicHtmlPath);
}

// ================= API ROUTES =================
app.use('/api', routes);

// Debug route to test if routes are mounted
app.get('/api/test', (req, res) => {
  res.json({ test: 'ok', message: 'Routes working!', timestamp: new Date().toISOString() });
});

app.get('/api/health', async (req, res) => {
  try {
    const db = require('./config/database.js');
    await db.query('SELECT 1');
    res.json({
      status: 'OK',
      message: 'Nuru Foundation Backend is running on LiteSpeed!',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'production',
      database: 'Connected'
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      database: 'disconnected',
      error: error.message
    });
  }
});

const frontendPages = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/courses.html',
  '/student-dashboard/reader.html',
  '/about.html',
  '/contact.html',
  '/community.html',
  '/calender.html',
  '/computer-packages.html',
  '/apply-now-bt.html',
  '/err.html',
  '/admin.html'
];

frontendPages.forEach(pagePath => {
  app.get(pagePath, (req, res) => {
    const fileName = pagePath === '/' ? 'index.html' : pagePath;
    const filePath = path.join(publicHtmlPath, fileName);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.sendFile(path.join(publicHtmlPath, 'index.html'));
    }
  });
});

app.get('/admin-dashboard', (req, res) => {
  res.sendFile(path.join(publicHtmlPath, 'admin-dashboard', 'index.html'));
});
app.get('/student-dashboard', (req, res) => {
  res.sendFile(path.join(publicHtmlPath, 'student-dashboard', 'index.html'));
});
app.get('/tutor-dashboard', (req, res) => {
  res.sendFile(path.join(publicHtmlPath, 'tutor-dashboard', 'index.html'));
});
app.get('/student-dashboard/reader.html', (req, res) => {
  res.sendFile(path.join(publicHtmlPath, 'student-dashboard', 'reader.html'));
});

app.get(/.*\.html$/, (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  const filePath = path.join(publicHtmlPath, req.path);
  if (fs.existsSync(filePath)) {
    res.sendFile(filePath);
  } else {
    res.sendFile(path.join(publicHtmlPath, 'index.html'));
  }
});

// ================= DEFAULT FALLBACK =================
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  const indexPath = path.join(publicHtmlPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend build not found.');
  }
});

app.use((err, req, res, next) => {
  console.error('SERVER_ERROR:', err.message);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    debug_message: err.message
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`\n🚀 ===========================================`);
  console.log(`✅ Nuru Foundation Backend is running!`);
  console.log(`📡 Listening on: http://${HOST}:${PORT}`);
  console.log(`🌐 Local access: http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
  console.log(`📁 Static files: ${publicHtmlPath}`);
  console.log(`============================================\n`);
});

server.on('error', (error) => {
  console.error('❌ Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
  }
});

module.exports = app;
