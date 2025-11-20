const { handleAuth, handleUsers, handleCourses, handleAssignments } = require('../lib/handlers');
const { authenticate } = require('../middleware/auth');

module.exports = async (req, res) => {
  const { method, url } = req;
  
  console.log(`📨 ${method} ${url}`);

  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight
  if (method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { path, body, query } = await parseRequest(req, url);
    
    const requestData = { method, path, body, query, headers: req.headers };

    // Public routes (no auth required)
    if (path === '/api/health' && method === 'GET') {
      return res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        service: 'Nuru Foundation API'
      });
    }

    if (path === '/api/auth/login' && method === 'POST') {
      return await handleAuth.login(requestData, res);
    }

    if (path === '/api/auth/register' && method === 'POST') {
      return await handleAuth.register(requestData, res);
    }

    // Protected routes (require authentication)
    const auth = await authenticate(requestData);
    if (!auth.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // User routes
    if (path === '/api/users/me' && method === 'GET') {
      return await handleUsers.getCurrentUser(requestData, res, auth.user);
    }

    if (path === '/api/users/profile' && method === 'PUT') {
      return await handleUsers.updateProfile(requestData, res, auth.user);
    }

    if (path === '/api/users/enrollments' && method === 'GET') {
      return await handleUsers.getUserEnrollments(requestData, res, auth.user);
    }

    // Course routes
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
    // Assignment routes
    if (path === '/api/assignments' && method === 'GET') {
      return await handleAssignments.list(requestData, res, auth.user);
    }

    if (path === '/api/assignments' && method === 'POST') {
      return await handleAssignments.create(requestData, res, auth.user);
    }

    if (path.match(/^\/api\/assignments\/\w+\/submit$/) && method === 'POST') {
      return await handleAssignments.submit(requestData, res, auth.user);
    }

    // 404 for unknown routes
    res.status(404).json({ 
      error: 'Endpoint not found', 
      path: `${method} ${path}`,
      availableEndpoints: [
        'GET /api/health',
        'POST /api/auth/login',
        'POST /api/auth/register',
        'GET /api/users/me',
        'GET /api/courses',
        'POST /api/courses (tutor/admin only)',
        'GET /api/assignments'
      ]
    });

  } catch (error) {
    console.error('🚨 API Error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
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