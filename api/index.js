const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { handleAuth, handleUsers, handleCourses, handleAssignments } = require('../lib/handlers');
const { authenticate } = require('../middleware/auth');
const { authLimiter, registerLimiter } = require('./middleware/rateLimiter');

const loginAttempts = new Map();
const registerAttempts = new Map();

const checkRateLimit = (key, limit, windowMs, map) => {
  const now = Date.now();
  const record = map.get(key) || { count: 0, resetAt: now + windowMs };
  
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }
  
  record.count++;
  map.set(key, record);
  
  if (record.count > limit) {
    return false;
  }
  return true;
};

module.exports = async (req, res) => {
  const { method, url } = req;
  const ip = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || 'unknown';
  
  console.log(`📨 ${method} ${url}`);

  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { path, body, query } = await parseRequest(req, url);
    
    const requestData = { method, path, body, query, headers: req.headers };

    if (path === '/api/health' && method === 'GET') {
      return res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Nuru Foundation API'
      });
    }

    if (path === '/api/auth/login' && method === 'POST') {
      if (!checkRateLimit(ip, 5, 15 * 60 * 1000, loginAttempts)) {
        return res.status(429).json({
          success: false,
          error: 'Too many login attempts. Please try again after 15 minutes.'
        });
      }
      return await handleAuth.login(requestData, res);
    }

    if (path === '/api/auth/register' && method === 'POST') {
      if (!checkRateLimit(ip, 10, 60 * 60 * 1000, registerAttempts)) {
        return res.status(429).json({
          success: false,
          error: 'Too many registration attempts. Please try again after an hour.'
        });
      }
      return await handleAuth.register(requestData, res);
    }

    const auth = await authenticate(requestData);
    if (!auth.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (path === '/api/users/me' && method === 'GET') {
      return await handleUsers.getCurrentUser(requestData, res, auth.user);
    }

    if (path === '/api/users/profile' && method === 'PUT') {
      return await handleUsers.updateProfile(requestData, res, auth.user);
    }

    if (path === '/api/users/enrollments' && method === 'GET') {
      return await handleUsers.getUserEnrollments(requestData, res, auth.user);
    }

    if (path === '/api/courses' && method === 'GET') {
      return await handleCourses.list(requestData, res, auth.user);
    }

    if (path === '/api/courses' && method === 'POST') {
      return await handleCourses.create(requestData, res, auth.user);
    }

    if (path.match(/^\/api\/courses\/\d+$/) && method === 'GET') {
      return await handleCourses.getById(requestData, res, auth.user);
    }

    if (path.match(/^\/api\/courses\/\d+\/enroll$/) && method === 'POST') {
      return await handleCourses.enroll(requestData, res, auth.user);
    }

    if (path === '/api/assignments' && method === 'GET') {
      return await handleAssignments.list(requestData, res, auth.user);
    }

    if (path === '/api/assignments' && method === 'POST') {
      return await handleAssignments.create(requestData, res, auth.user);
    }

    if (path.match(/^\/api\/assignments\/\w+\/submit$/) && method === 'POST') {
      return await handleAssignments.submit(requestData, res, auth.user);
    }

    res.status(404).json({ 
      error: 'Endpoint not found', 
      path: `${method} ${path}`
    });

  } catch (error) {
    console.error('🚨 API Error:', error);
    res.status(500).json({ 
      error: 'Internal server error'
    });
  }
};

// Request parsing utility
async function parseRequest(req, url) {
  const [path, queryString] = url.split('?');
  const query = {};
  
  if (queryString) {
    queryString.split('&').forEach(pair => {
      const [key, value] = pair.split('=');
      if (key) query[decodeURIComponent(key)] = decodeURIComponent(value || '');
    });
  }

  let body = {};
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    body = await new Promise((resolve, reject) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (error) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }

  return { path, body, query };
}