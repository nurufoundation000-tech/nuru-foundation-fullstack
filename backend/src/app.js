// src/app.js - PRODUCTION VERSION for HostPinnacle (Passenger + Static Serving)
// Based on MediQuick architecture pattern
import express from 'express';
import path from 'path';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import os from 'os';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Path resolution for HostPinnacle structure
const projectRoot = path.resolve(__dirname, '..');
const publicHtmlPath = path.resolve(projectRoot, 'public_html');

// Import routes
import routes from './routes/index.js';

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';

// ================= CRITICAL: SKIP STATIC FOR API =================
// This middleware MUST come BEFORE express.static to block /api from being served as static files
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next('route'); // Skip static file serving for API paths
  }
  next();
});

// ================= PRODUCTION CORS =================
const allowedOrigins = [
  'https://nurufoundations.com',
  'https://www.nurufoundations.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
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

// ================= SECURITY & MIDDLEWARE =================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ================= STATIC FRONTEND (API paths already filtered out) =================
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

// ================= HEALTH CHECK - FIRST API ROUTE =================
// This MUST be defined BEFORE app.use('/api', routes) to ensure it catches
app.get('/api/health', async (req, res) => {
  try {
    const db = await import('./config/database.js');
    await db.default.query('SELECT 1');
    res.json({
      status: 'OK',
      message: 'Nuru Foundation Backend is running on Passenger!',
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

// ================= API ROUTES =================
app.use('/api', routes);

// ================= EXPLICIT FRONTEND ROUTES =================
// These must be explicit to avoid the fallback catching API requests
const frontendPages = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/courses.html',
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

// ================= DASHBOARD ROUTES =================
app.get('/admin-dashboard', (req, res) => {
  res.sendFile(path.join(publicHtmlPath, 'admin-dashboard', 'index.html'));
});
app.get('/student-dashboard', (req, res) => {
  res.sendFile(path.join(publicHtmlPath, 'student-dashboard', 'index.html'));
});
app.get('/tutor-dashboard', (req, res) => {
  res.sendFile(path.join(publicHtmlPath, 'tutor-dashboard', 'index.html'));
});

// ================= SPA FALLBACK =================
// Only match .html requests that aren't API calls
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
app.get('*', (req, res) => {
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

// ================= ERROR HANDLER =================
app.use((err, req, res, next) => {
  console.error('SERVER_ERROR:', err.message);
  res.status(500).json({
    success: false,
    message: 'Internal Server Error',
    debug_message: err.message
  });
});

// ================ START THE SERVER =================
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

export default app;